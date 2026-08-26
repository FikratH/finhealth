"""Extraction of financial metrics from CSV / XLSX / XLS / PDF files.

The strategy is table-oriented: every source is converted into rows of
(label, {period_column -> raw value}, source_ref). Labels are matched against
the metric dictionary; values are parsed with locale-aware number parsing.
No values are invented: metrics that are not found are reported as N/A.
"""
from __future__ import annotations

import io
from dataclasses import dataclass, field
from typing import Optional

from ..schemas import ExtractedValue, ExtractionResult, Scale
from . import metrics as M

# Resource caps: a hostile or pathological file (e.g. a 40k-row "sheet of
# junk") must not be fully materialized in memory or take minutes to parse.
# Real financial statements are tiny relative to these limits (findings 6, 26).
MAX_ROWS_PER_SHEET = 5000
MAX_COLS = 64
MAX_SHEETS = 20
MAX_PDF_PAGES = 60
TRUNCATION_WARNING = ("Файл усечён при разборе: обработаны не все строки/листы/страницы. "
                      "Финансовые отчёты обычно значительно меньше этих лимитов.")


class ScannedPdfError(Exception):
    """PDF contains no extractable text (likely a scan)."""


@dataclass
class _Row:
    label: str
    cells: list[str]
    source: str


@dataclass
class _Table:
    header: list[str] = field(default_factory=list)
    rows: list[_Row] = field(default_factory=list)


def _find_header_index(rows: list[list[str]]) -> Optional[int]:
    """Best header = the row (within the first 20 non-empty rows) whose
    non-first cells carry the most distinct years. A title like
    «Отчёт ... за 2024 год» has its year in cell 0 and scores 0 (finding 3)."""
    best_idx, best_count = None, 0
    for i, cells in enumerate(rows[:20]):
        count = sum(1 for c in cells[1:] if M.detect_periods([c]))
        if count > best_count:
            best_idx, best_count = i, count
    return best_idx


def _rows_from_matrix(matrix: list[list], source_prefix: str) -> _Table:
    table = _Table()
    norm_rows: list[tuple[int, list[str]]] = []
    for i, row in enumerate(matrix):
        cells = ["" if c is None else str(c).strip() for c in row]
        if any(cells):
            norm_rows.append((i, cells))
    header_pos = _find_header_index([cells for _, cells in norm_rows])
    for pos, (i, cells) in enumerate(norm_rows):
        if pos == header_pos:
            table.header = cells
            continue
        if cells[0]:
            table.rows.append(_Row(label=cells[0], cells=cells[1:],
                                   source=f"{source_prefix}, строка {i + 1}"))
    return table


def _extract_from_tables(tables: list[_Table], full_text: str,
                         base_confidence_penalty: float = 0.0) -> ExtractionResult:
    scale = M.detect_scale(full_text)
    currency = M.detect_currency(full_text)
    audited = M.detect_audited(full_text)

    all_periods: list[str] = []
    for t in tables:
        for p in M.detect_periods(t.header):
            if p not in all_periods:
                all_periods.append(p)
    all_periods = sorted(all_periods, reverse=True)
    latest = all_periods[0] if all_periods else None
    previous = all_periods[1] if len(all_periods) > 1 else None

    found: dict[str, ExtractedValue] = {}
    found_prev: dict[str, ExtractedValue] = {}
    warnings: list[str] = []

    for t in tables:
        header_periods = M.detect_periods(t.header)
        # map column index -> period label
        col_period: dict[int, str] = {}
        if t.header:
            for idx, cell in enumerate(t.header[1:]):
                ys = M.detect_periods([cell])
                if ys:
                    col_period[idx] = ys[0]
        has_year_columns = bool(col_period)
        for row in t.rows:
            matched = M.match_label(row.label)
            if not matched:
                continue
            key, conf = matched
            conf = max(0.0, conf - base_confidence_penalty)
            values: dict[str, float | None] = {}
            for idx, raw in enumerate(row.cells):
                num = M.parse_number(raw)
                if num is None:
                    continue
                period = col_period.get(idx)
                if period is None:
                    if has_year_columns:
                        continue  # e.g. «Код» — a labeled non-year column is not data (finding 2)
                    period = latest if latest and (latest not in values) else previous
                    if period is None:
                        period = "latest"
                if period not in values:
                    values[period] = num
            snippet = (row.label + " | " + " | ".join(c for c in row.cells if c))[:200]

            def put(store: dict, period_label: Optional[str], value: Optional[float]):
                if value is None:
                    return
                existing = store.get(key)
                if existing is not None and existing.value is not None:
                    if conf <= existing.confidence:
                        if existing.value != value:
                            warnings.append(
                                f"Дублирующиеся значения для «{M.METRICS[key]['name']}»: "
                                f"{existing.value} и {value}. Использовано более надёжное совпадение."
                            )
                        return
                    # new match is more confident (e.g. exact «Итого активы» later in the file)
                if key in M.EXPENSE_MAGNITUDE_METRICS and value is not None and value < 0:
                    value = abs(value)
                    note = (f"Знак «{M.METRICS[key]['name']}» нормализован: значение в скобках "
                            "приведено к положительной величине расхода.")
                    if note not in warnings:
                        warnings.append(note)
                store[key] = ExtractedValue(
                    metric=key, original_label=row.label, value=value,
                    currency=currency, scale=scale, period=period_label,
                    source=row.source, confidence=conf, snippet=snippet,
                )

            lp = latest or "latest"
            put(found, latest, values.get(lp) if lp in values else
                (list(values.values())[0] if values and latest is None else values.get(lp)))
            if previous and previous in values:
                put(found_prev, previous, values[previous])
            _ = header_periods

    # N/A entries for every dictionary metric that was not found
    for key, cfg in M.METRICS.items():
        if key not in found:
            found[key] = ExtractedValue(
                metric=key, original_label="", value=None, currency=currency,
                scale=scale, period=latest, source="", confidence=0,
                snippet="", )

    return ExtractionResult(
        upload_id="", periods=all_periods, latest_period=latest,
        previous_period=previous, currency=currency, scale=scale,
        audited=audited,
        values=list(found.values()),
        previous_values=list(found_prev.values()),
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# Format-specific readers
# ---------------------------------------------------------------------------
def extract_from_csv(data: bytes) -> ExtractionResult:
    import csv
    text = data.decode("utf-8-sig", errors="replace")
    sample = text[:2048]
    delimiter = ";" if sample.count(";") > sample.count(",") else ","
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    matrix = [row for row in reader]
    table = _rows_from_matrix(matrix, "CSV")
    return _extract_from_tables([table], text)


def extract_from_xlsx(data: bytes) -> ExtractionResult:
    from openpyxl import load_workbook
    wb = load_workbook(io.BytesIO(data), data_only=True, read_only=True)
    tables: list[_Table] = []
    full_text_parts: list[str] = []
    truncated = False
    for ws in wb.worksheets[:MAX_SHEETS]:
        matrix: list[list] = []
        for r_i, row in enumerate(ws.iter_rows(values_only=True)):
            if r_i >= MAX_ROWS_PER_SHEET:
                truncated = True
                break
            matrix.append(list(row[:MAX_COLS]))
        for row in matrix:
            full_text_parts.extend(str(c) for c in row if c is not None)
        tables.append(_rows_from_matrix(matrix, f"Лист «{ws.title}»"))
    if len(wb.worksheets) > MAX_SHEETS:
        truncated = True
    wb.close()
    result = _extract_from_tables(tables, " ".join(full_text_parts))
    if truncated:
        result.warnings.append(TRUNCATION_WARNING)
    return result


def extract_from_xls(data: bytes) -> ExtractionResult:
    import pandas as pd
    sheets = pd.read_excel(io.BytesIO(data), sheet_name=None, header=None,
                           dtype=str, nrows=MAX_ROWS_PER_SHEET)
    tables: list[_Table] = []
    full_text_parts: list[str] = []
    truncated = False
    sheet_names = list(sheets.keys())
    if len(sheet_names) > MAX_SHEETS:
        truncated = True
    for name in sheet_names[:MAX_SHEETS]:
        df = sheets[name]
        # pandas' nrows caps rows read but can't tell us whether the sheet
        # was actually longer than the cap — a sheet with exactly
        # MAX_ROWS_PER_SHEET rows read is treated as (possibly) truncated,
        # which is a conservative approximation (finding 6, 26).
        if len(df) >= MAX_ROWS_PER_SHEET:
            truncated = True
        matrix = df.iloc[:, :MAX_COLS].fillna("").values.tolist()
        for row in matrix:
            full_text_parts.extend(str(c) for c in row if c)
        tables.append(_rows_from_matrix(matrix, f"Лист «{name}»"))
    result = _extract_from_tables(tables, " ".join(full_text_parts))
    if truncated:
        result.warnings.append(TRUNCATION_WARNING)
    return result


def extract_from_pdf(data: bytes) -> ExtractionResult:
    import pdfplumber
    tables: list[_Table] = []
    text_parts: list[str] = []
    truncated = False
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        if len(pdf.pages) > MAX_PDF_PAGES:
            truncated = True
        for page_no, page in enumerate(pdf.pages[:MAX_PDF_PAGES], start=1):
            page_text = page.extract_text() or ""
            text_parts.append(page_text)
            page_tables = page.extract_tables() or []
            for t_no, raw_table in enumerate(page_tables, start=1):
                tables.append(_rows_from_matrix(
                    raw_table, f"PDF, стр. {page_no}, таблица {t_no}"))
            # line-based fallback: "Label ....  1 234  5 678"
            if not page_tables:
                matrix = []
                for line in page_text.splitlines():
                    parts = [p for p in line.replace("\u00a0", " ").rsplit("  ") if p.strip()]
                    if len(parts) >= 2:
                        matrix.append([parts[0].strip(), *[p.strip() for p in parts[1:]]])
                if matrix:
                    t = _rows_from_matrix(matrix, f"PDF, стр. {page_no} (текст)")
                    tables.append(t)
    full_text = "\n".join(text_parts)
    if not full_text.strip():
        raise ScannedPdfError(
            "PDF не содержит текстового слоя (вероятно, это скан). "
            "Загрузите Excel/CSV либо PDF более высокого качества."
        )
    result = _extract_from_tables(tables, full_text, base_confidence_penalty=15.0)
    if truncated:
        result.warnings.append(TRUNCATION_WARNING)
    return result


def extract(data: bytes, kind: str) -> ExtractionResult:
    if kind == "csv":
        return extract_from_csv(data)
    if kind == "xlsx":
        return extract_from_xlsx(data)
    if kind == "xls":
        return extract_from_xls(data)
    if kind == "pdf":
        return extract_from_pdf(data)
    raise ValueError(f"Неподдерживаемый тип файла: {kind}")


def suggest_industry(result: ExtractionResult) -> Optional[str]:
    """Very rough heuristic industry hint based on available structure."""
    by_key = {v.metric: v for v in result.values}
    inv = by_key.get("inventory")
    capex = by_key.get("capital_expenditures")
    if inv and inv.value not in (None, 0) and capex and capex.value:
        return "manufacturing"
    if inv and inv.value not in (None, 0):
        return "retail"
    return None
