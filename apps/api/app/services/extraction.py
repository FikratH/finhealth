"""Extraction of financial metrics from CSV / XLSX / XLS / PDF files.

The strategy is table-oriented: every source is converted into rows of
(label, {period_column -> raw value}, source_ref). Labels are matched against
the metric dictionary; values are parsed with locale-aware number parsing.
No values are invented: metrics that are not found are reported as N/A.
"""
from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from typing import Optional

from ..schemas import ExtractedValue, ExtractionResult, PeriodSelectionMeta, Scale
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
    label_col_idx: int = 0


_HEADER_LABEL_TOKENS = ("наименование", "показател")
_LATEST_MARKERS = ("на конец", "end of")
_PREVIOUS_MARKERS = ("на начало", "beginning of")
_PERIOD_MARKER_PHRASES = _LATEST_MARKERS + _PREVIOUS_MARKERS + (
    "конец отчетного", "начало отчетного")
_KOD_TOKEN = "код"


def _find_header_index(rows: list[list[str]]) -> Optional[int]:
    """Best header = the row (within the first 20 non-empty rows) whose
    non-first cells carry the most year-bearing cells. A title like
    «Отчёт ... за 2024 год» has its year in cell 0 and scores 0 (finding 3).

    Some statutory layouts (e.g. KZ RSBU) never put a year in the header at
    all — columns are labelled «На конец / начало отчётного периода»
    instead. When no row scores any year-bearing cells, fall back to
    recognizing the header by its label content: cell 0 reads as
    "наименование"/"показатель" and at least one other cell carries a
    period-marker phrase (finding F1)."""
    best_idx, best_count = None, 0
    for i, cells in enumerate(rows[:20]):
        count = sum(1 for c in cells[1:] if M.detect_periods([c]))
        if count > best_count:
            best_idx, best_count = i, count
    if best_count > 0:
        return best_idx
    for i, cells in enumerate(rows[:20]):
        if not cells:
            continue
        first = M.normalize_label(cells[0])
        if not any(tok in first for tok in _HEADER_LABEL_TOKENS):
            continue
        if any(any(marker in M.normalize_label(c) for marker in _PERIOD_MARKER_PHRASES)
               for c in cells[1:]):
            return i
    return best_idx


def _label_based_column_roles(data_header_cells: list[str]) -> dict[int, str]:
    """When a table's header has no year cells at all, map columns to
    latest/previous by header label content instead. «Код» columns are
    skipped — they hold line codes, not values. Columns carrying an
    explicit «на конец»/«на начало» (or «end of»/«beginning of») marker are
    assigned by that marker; any remaining, unmarked columns fall back to
    positional order (first → latest, second → previous).

    `data_header_cells` is already the label column's header cell excluded
    (see _data_columns) — callers pass the same slice used to build
    `_Row.cells`, so indices returned here line up with row.cells directly."""
    candidates: list[int] = []
    roles: dict[int, str] = {}
    for idx, cell in enumerate(data_header_cells):
        norm = M.normalize_label(cell)
        if _KOD_TOKEN in norm:
            continue
        candidates.append(idx)
        if any(m in norm for m in _LATEST_MARKERS):
            roles[idx] = "latest"
        elif any(m in norm for m in _PREVIOUS_MARKERS):
            roles[idx] = "previous"
    remaining_roles = [r for r in ("latest", "previous") if r not in roles.values()]
    for idx in candidates:
        if idx in roles or not remaining_roles:
            continue
        roles[idx] = remaining_roles.pop(0)
    return roles


# ---------------------------------------------------------------------------
# Column-role classifier (P7.T3a): identifies which column holds the row
# label by *content* — mostly Cyrillic text, not parseable as a number —
# instead of always assuming column 0. Only overrides the position-0
# assumption when unambiguous; every existing fixture's label column is
# already at position 0, so the confidence gate returns 0 for them too and
# nothing about today's output changes. Code-column (RSBU 4-digit line
# codes) and period-column (numeric density) scores are computed for the
# same reason the spec asks for them — content-based column typing — but
# their consumer today is this label decision alone: once the label column
# is correctly located, code vs. period discrimination is already handled
# position-independently by the existing header-text logic below (a
# column's header cell either carries a detectable period or it doesn't,
# regardless of which index it sits at), so there is no second, competing
# decision path to keep in sync.
# ---------------------------------------------------------------------------
_CODE_RE = re.compile(r"^\d{4}$")
_CYRILLIC_RE = re.compile(r"[а-яё]", re.IGNORECASE)
_LABEL_CONFIDENCE = 0.6
_LABEL_MARGIN = 0.15
_MIN_ROWS_FOR_CLASSIFICATION = 3
_CLASSIFY_SAMPLE_ROWS = 30


def _column_content_scores(data_rows: list[list[str]], header: list[str],
                            n_cols: int) -> list[dict[str, float]]:
    """Per-column content scores over a sample of data rows: label
    (Cyrillic-text ratio), code (RSBU 4-digit line-code ratio), period
    (numeric-parse density, boosted when the column's own header cell looks
    period-like)."""
    sample = data_rows[:_CLASSIFY_SAMPLE_ROWS]
    scores: list[dict[str, float]] = []
    for col in range(n_cols):
        non_empty = text_like = code_like = numeric_like = 0
        for row in sample:
            if col >= len(row):
                continue
            cell = row[col].strip()
            if not cell:
                continue
            non_empty += 1
            if _CODE_RE.match(cell):
                code_like += 1
            if M.parse_number(cell) is not None:
                numeric_like += 1
            elif _CYRILLIC_RE.search(cell):
                text_like += 1
        if non_empty == 0:
            scores.append({"label": 0.0, "code": 0.0, "period": 0.0, "non_empty": 0.0})
            continue
        period_score = numeric_like / non_empty
        header_cell = header[col] if col < len(header) else ""
        if M.detect_period_objects([header_cell]):
            period_score = min(1.0, period_score + 0.3)
        scores.append({
            "label": text_like / non_empty,
            "code": code_like / non_empty,
            "period": period_score,
            "non_empty": float(non_empty),
        })
    return scores


def _classify_label_column(data_rows: list[list[str]], header: list[str], n_cols: int) -> int:
    """Content-based label-column detection. Falls back to column 0 —
    today's positional assumption — whenever there isn't enough data to be
    confident (fewer than a handful of data rows) or more than one column
    plausibly looks like the label column (the genuinely-ambiguous case)."""
    if n_cols == 0 or len(data_rows) < _MIN_ROWS_FOR_CLASSIFICATION:
        return 0
    scores = _column_content_scores(data_rows, header, n_cols)
    candidates = [i for i, s in enumerate(scores)
                  if s["non_empty"] > 0 and s["label"] >= _LABEL_CONFIDENCE]
    if len(candidates) != 1:
        return 0
    winner = candidates[0]
    runner_up = max((s["label"] for i, s in enumerate(scores) if i != winner), default=0.0)
    if scores[winner]["label"] - runner_up < _LABEL_MARGIN:
        return 0
    return winner


def _data_columns(cells: list[str], label_col_idx: int) -> list[str]:
    """All cells except the label column, left-to-right order preserved.
    Equivalent to today's `cells[1:]` when label_col_idx == 0 (the default
    for every pre-existing fixture)."""
    return [c for i, c in enumerate(cells) if i != label_col_idx]


# ---------------------------------------------------------------------------
# Multi-row header merge (P7.T3b): a stacked layout — e.g. a quarter marker
# on one row («I квартал») with the year on the row directly below («2024
# г.») — splits one logical header across physical rows. Without merging,
# both quarter columns would canonicalize to the same bare year and collide.
# ---------------------------------------------------------------------------
_MAX_HEADER_MERGE_ROWS = 3
_RU_MONTHS = ("январ", "феврал", "март", "апрел", "ма[йя]", "июн", "июл", "август",
              "сентябр", "октябр", "ноябр", "декабр")
_DATE_NO_YEAR_RE = re.compile(r"\b\d{1,2}\s+(?:" + "|".join(_RU_MONTHS) + r")\w*\b",
                              re.IGNORECASE)


def _looks_like_data_row(cells: list[str]) -> bool:
    """A row is data (not a header fragment) once any of its cells matches a
    known metric label — real statement rows always start with a
    recognizable line item; header/title fragments never do."""
    return any(M.match_label(c) is not None for c in cells if c)


def _has_period_fragment(cells: list[str]) -> bool:
    """Looser than a full period match: true if any *non-label* cell (index
    ≥ 1) carries a bare year, a quarter/half-year word marker (even without
    a year — the year may live on a neighboring stacked row), or a
    day+RU-month phrase without a year («На 31 декабря»). Restricted to
    cells[1:] deliberately: a title row's year is embedded in prose in cell
    0 (e.g. «Отчёт... за 2024 год»), while a genuine stacked-header fragment
    carries its date/quarter content in its own, separate cell — this alone
    is what keeps title rows from being swept into the header."""
    for cell in cells[1:]:
        if not cell:
            continue
        if M.has_period_marker(cell) or _DATE_NO_YEAR_RE.search(cell):
            return True
    return False


def _merge_header_block(norm_rows: list[tuple[int, list[str]]],
                        header_pos: int) -> tuple[list[str], set[int]]:
    """Merge `header_pos` with immediately adjacent header-fragment rows.
    A neighbor merges in only when it is not itself a data row and it adds
    period-bearing content — this is what keeps section-title rows (no
    metric match, but also no period content) out. Returns the merged
    header cells and the set of norm_rows *positions* consumed, so the
    caller skips them when building data rows."""
    n = len(norm_rows)

    def _is_fragment(pos: int) -> bool:
        if pos < 0 or pos >= n or pos == header_pos:
            return False
        _, cells = norm_rows[pos]
        if _looks_like_data_row(cells):
            return False
        return _has_period_fragment(cells)

    block = [header_pos]
    pos = header_pos - 1
    while len(block) < _MAX_HEADER_MERGE_ROWS and _is_fragment(pos):
        block.append(pos)
        pos -= 1
    pos = header_pos + 1
    while len(block) < _MAX_HEADER_MERGE_ROWS and _is_fragment(pos):
        block.append(pos)
        pos += 1

    if len(block) == 1:
        return norm_rows[header_pos][1], {header_pos}

    block.sort()
    width = max(len(norm_rows[p][1]) for p in block)
    merged = [""] * width
    for pos in block:
        _, cells = norm_rows[pos]
        for c in range(width):
            cell = cells[c] if c < len(cells) else ""
            if not cell:
                continue
            merged[c] = f"{merged[c]} {cell}".strip() if merged[c] else cell
    return merged, set(block)


def _rows_from_matrix(matrix: list[list], source_prefix: str) -> _Table:
    table = _Table()
    norm_rows: list[tuple[int, list[str]]] = []
    for i, row in enumerate(matrix):
        cells = ["" if c is None else str(c).strip() for c in row]
        if any(cells):
            norm_rows.append((i, cells))
    header_pos = _find_header_index([cells for _, cells in norm_rows])
    consumed: set[int] = set()
    if header_pos is not None:
        table.header, consumed = _merge_header_block(norm_rows, header_pos)

    data_rows = [cells for pos, (_, cells) in enumerate(norm_rows)
                 if pos != header_pos and pos not in consumed]
    n_cols = max((len(cells) for _, cells in norm_rows), default=0)
    table.label_col_idx = _classify_label_column(data_rows, table.header, n_cols)

    for pos, (i, cells) in enumerate(norm_rows):
        if pos == header_pos or pos in consumed:
            continue
        label = cells[table.label_col_idx] if table.label_col_idx < len(cells) else ""
        if label:
            table.rows.append(_Row(
                label=label, cells=_data_columns(cells, table.label_col_idx),
                source=f"{source_prefix}, строка {i + 1}"))
    return table


def _select_comparable_periods(
    ordered: list[M.Period],
) -> tuple[Optional[M.Period], Optional[M.Period], dict]:
    """Pick the two most recent COMPARABLE periods (P7.T3c): same
    period-type preferred (annual vs. annual, quarter vs. quarter, ...);
    when the latest period has no earlier period of the same type, fall
    back to the latest two periods overall. `ordered` must already be
    sorted newest-first (by Period.sort_key, descending) — for a plain
    annual-only file (today's only shape) this reduces to exactly
    `ordered[0]`/`ordered[1]`, unchanged from before P7.T3."""
    if not ordered:
        return None, None, {"chosen": [], "rejected": [], "reason": "периоды не обнаружены"}
    latest = ordered[0]
    same_kind = next((p for p in ordered[1:] if p.kind == latest.kind), None)
    if same_kind is not None:
        previous = same_kind
        reason = f"последние два периода одного типа ({latest.kind})"
    elif len(ordered) > 1:
        previous = ordered[1]
        reason = ("второй период того же типа, что и последний, не найден — "
                  "использованы последние два периода в целом")
    else:
        previous = None
        reason = "обнаружен только один период"
    chosen = [latest.label] + ([previous.label] if previous else [])
    rejected = [p.label for p in ordered if p.label not in chosen]
    return latest, previous, {"chosen": chosen, "rejected": rejected, "reason": reason}


def _extract_from_tables(tables: list[_Table], full_text: str,
                         base_confidence_penalty: float = 0.0) -> ExtractionResult:
    scale = M.detect_scale(full_text)
    currency = M.detect_currency(full_text)
    audited = M.detect_audited(full_text)

    period_objs: dict[str, M.Period] = {}
    for t in tables:
        for p in M.detect_period_objects(t.header):
            period_objs.setdefault(p.label, p)
    ordered_periods = sorted(period_objs.values(), key=lambda p: p.sort_key, reverse=True)
    all_periods = [p.label for p in ordered_periods]
    latest_obj, previous_obj, period_meta = _select_comparable_periods(ordered_periods)
    latest = latest_obj.label if latest_obj else None
    previous = previous_obj.label if previous_obj else None

    found: dict[str, ExtractedValue] = {}
    found_prev: dict[str, ExtractedValue] = {}
    warnings: list[str] = []

    for t in tables:
        # map column index -> canonical period label, from period-bearing
        # header cells (plain years, or quarter/half-year markers, P7.T3c).
        # header_data_cells excludes the label column so indices line up
        # 1:1 with row.cells regardless of where the label column sits
        # (P7.T3a) — with label_col_idx == 0 this is exactly t.header[1:].
        header_data_cells = _data_columns(t.header, t.label_col_idx) if t.header else []
        col_period: dict[int, str] = {}
        for idx, cell in enumerate(header_data_cells):
            objs = M.detect_period_objects([cell])
            if objs:
                col_period[idx] = objs[0].label
        has_year_columns = bool(col_period)

        # No year cells anywhere in the header: try to recognize it by label
        # content instead (e.g. KZ statutory «Наименование показателя / Код
        # строки / На конец / На начало отчётного периода», finding F1).
        col_role: dict[int, str] = {}
        label_header_recognized = False
        if not has_year_columns and t.header:
            label_cell = t.header[t.label_col_idx] if t.label_col_idx < len(t.header) else ""
            first_norm = M.normalize_label(label_cell)
            label_header_recognized = any(tok in first_norm for tok in _HEADER_LABEL_TOKENS)
            if label_header_recognized:
                col_role = _label_based_column_roles(header_data_cells)

        # Safety net: neither a year-bearing header nor a recognized label
        # header — we cannot reliably tell period columns from service
        # columns like «Код». Warn once and cap confidence for this table if
        # any matched row actually carries ≥2 numeric cells (finding F1b).
        safety_net_active = False
        if not has_year_columns and not label_header_recognized:
            for row in t.rows:
                if M.match_label(row.label) is None:
                    continue
                if sum(1 for c in row.cells if M.parse_number(c) is not None) >= 2:
                    safety_net_active = True
                    break
            if safety_net_active:
                note = ("Колонки периодов не распознаны — проверьте, что значения не взяты "
                        "из служебной колонки (например, «Код»).")
                if note not in warnings:
                    warnings.append(note)

        for row in t.rows:
            matched = M.match_label(row.label)
            if not matched:
                continue
            key, conf = matched
            conf = max(0.0, conf - base_confidence_penalty)
            if safety_net_active:
                conf = min(conf, 50.0)
            values: dict[str, float | None] = {}
            for idx, raw in enumerate(row.cells):
                num = M.parse_number(raw)
                if num is None:
                    continue
                if has_year_columns:
                    period = col_period.get(idx)
                    if period is None:
                        continue  # e.g. «Код» — a labeled non-year column is not data (finding 2)
                elif label_header_recognized:
                    role = col_role.get(idx)
                    if role is None:
                        continue  # «Код» column, or an extra column beyond latest/previous
                    period = role  # synthetic "latest"/"previous" key, resolved below
                else:
                    period = "latest"  # legacy fully-positional fallback (safety-net path)
                if period not in values:
                    values[period] = num
            snippet = (row.label + " | " + " | ".join(c for c in row.cells if c))[:200]

            def put(store: dict, period_label: Optional[str], value: Optional[float]):
                if value is None:
                    return
                # Normalize sign BEFORE comparing to the stored value: the
                # stored value was already normalized when it was put(), so
                # comparing a raw (still-negative) incoming value against it
                # produces a false «Дублирующиеся значения» warning for the
                # same parenthesized figure appearing in two sections (F2).
                if key in M.EXPENSE_MAGNITUDE_METRICS and value < 0:
                    value = abs(value)
                    note = (f"Знак «{M.METRICS[key]['name']}» нормализован: значение в скобках "
                            "приведено к положительной величине расхода.")
                    if note not in warnings:
                        warnings.append(note)
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
                store[key] = ExtractedValue(
                    metric=key, original_label=row.label, value=value,
                    currency=currency, scale=scale, period=period_label,
                    source=row.source, confidence=conf, snippet=snippet,
                )

            latest_val = None
            if latest is not None and latest in values:
                latest_val = values[latest]
            elif "latest" in values:
                latest_val = values["latest"]
            if latest_val is not None:
                put(found, latest, latest_val)

            prev_val = None
            if previous is not None and previous in values:
                prev_val = values[previous]
            elif "previous" in values:
                prev_val = values["previous"]
            if prev_val is not None:
                put(found_prev, previous, prev_val)

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
        period_selection=PeriodSelectionMeta(**period_meta),
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
