"""Header-structure and column-role helpers for extraction.py (P7.T3).

Split out from extraction.py in round 1 (F5) to restore the 500-line file
cap — purely organizational, not a new subsystem: every function here is
pure, module-level, and picklable by construction. None of it is ever
pickled directly; only `extraction.extract`'s bytes-in/ExtractionResult-out
crosses the ProcessPool boundary, so lifting these helpers into a sibling
module changes nothing about pool safety.

Three pieces, each with one public entry point:
- `classify_table` — column-role classifier (P7.T3a): which column holds
  the row label, and which columns look like RSBU line codes.
- `merge_header_block` — multi-row header merge (P7.T3b).
- `select_comparable_periods` — comparable-period selection (P7.T3c).
Plus `data_columns`, the label-column-aware reindexing shared by both
extraction.py and this module.
"""
from __future__ import annotations

import re
from typing import Optional

from . import metrics as M

# ---------------------------------------------------------------------------
# Column-role classifier (P7.T3a): identifies which column holds the row
# label by *content* — mostly Cyrillic text, not parseable as a number —
# instead of always assuming column 0. Only overrides the position-0
# assumption when unambiguous; every pre-P7.T3 fixture's label column is
# already at position 0, so the confidence gate returns 0 for them too.
#
# Round 1 (F2/S1): the `code` score — RSBU 4-digit line-code ratio — is now
# an active veto (`code_column_relative_idxs`) on treating a column as a
# period/value column, not just a computed-but-unused signal. It matters
# specifically when header *text* can't be trusted to exclude a code column
# on its own: either there is no header text at all (a statutory no-year
# layout with the code column moved to position 0 — nothing to read "код"
# from), or the header text is actively misleading (a code column's header
# happens to contain a year, e.g. «Код строки 2025»). Header-text exclusion
# (the pre-existing «код»-token check, and "no year in this header cell")
# still runs first in extraction.py and remains correct on its own for
# every case that has trustworthy header text; this is the fallback for
# when it doesn't.
# ---------------------------------------------------------------------------
_CODE_RE = re.compile(r"^\d{4}$")
_CYRILLIC_RE = re.compile(r"[а-яё]", re.IGNORECASE)
_LABEL_CONFIDENCE = 0.6
_LABEL_MARGIN = 0.15
_MIN_ROWS_FOR_CLASSIFICATION = 3
_CLASSIFY_SAMPLE_ROWS = 30
_CODE_CONFIDENCE = 0.6  # same bar as the label gate (F2/S1)
# Phase-7 close wave (T3 NEW-J): «код» alone missed a code column headed
# «Строка 2025»/«Стр. 2025» — real RSBU forms label the line-code column
# «Код», «Код строки», «Код стр.», OR bare «Строка»/«Стр.» — broadened to
# both tokens, here AND in extraction.py's period-scan exclusion (the same
# gap existed in both places; NEW-J's probe confirmed fixing only one
# stops codes becoming values but leaves the phantom period behind).
_CODE_HEADER_TOKENS = ("код", "стр")


def column_content_scores(data_rows: list[list[str]], header: list[str],
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


def _classify_label_column(scores: list[dict[str, float]]) -> int:
    """Content-based label-column decision from precomputed scores. Falls
    back to column 0 — today's positional assumption — whenever more than
    one column plausibly looks like the label column (the
    genuinely-ambiguous case); the "not enough data" gate lives in
    `classify_table`, the shared entry point."""
    candidates = [i for i, s in enumerate(scores)
                  if s["non_empty"] > 0 and s["label"] >= _LABEL_CONFIDENCE]
    if len(candidates) != 1:
        return 0
    winner = candidates[0]
    runner_up = max((s["label"] for i, s in enumerate(scores) if i != winner), default=0.0)
    if scores[winner]["label"] - runner_up < _LABEL_MARGIN:
        return 0
    return winner


def _code_column_relative_idxs(scores: list[dict[str, float]], header: list[str],
                               label_col_idx: int) -> frozenset[int]:
    """Absolute column indices whose content confidently looks like RSBU
    line codes, translated to the label-excluded relative indexing used by
    `data_columns`/`_Row.cells` (F2/S1's veto).

    Round 2 (NEW-1): gated on the column's OWN header cell, not content
    alone. A high code score (>=60% of sampled cells matching ^\\d{4}$) is
    common to two very different shapes: a genuine RSBU line-code column,
    and an ordinary 4-digit VALUE column on a statement reported in
    millions/large units («Выручка;4120;3780») or any xlsx whose numeric
    cells simply stringify without thousands separators — content alone
    cannot tell them apart. The header can: if the column's own header
    cell already resolves to a complete period (`M.detect_period_objects`)
    and doesn't itself say «код»/«стр» (close wave, T3 NEW-J — see
    `_CODE_HEADER_TOKENS`), the header is trustworthy and the veto stands
    down — content-only vetoing here previously discarded an entire
    statement (`{}`, no warning) on exactly this ordinary shape, because
    the veto ran before the classifier's own period score (already
    computed, already correct) was ever consulted."""
    idxs: set[int] = set()
    for i, s in enumerate(scores):
        if i == label_col_idx or s["non_empty"] == 0 or s["code"] < _CODE_CONFIDENCE:
            continue
        header_cell = header[i] if i < len(header) else ""
        normalized_header = M.normalize_label(header_cell)
        header_says_code = any(tok in normalized_header for tok in _CODE_HEADER_TOKENS)
        header_is_period = bool(M.detect_period_objects([header_cell]))
        if header_is_period and not header_says_code:
            continue  # header text already trustworthily resolves this column
        idxs.add(i - 1 if i > label_col_idx else i)
    return frozenset(idxs)


def classify_table(data_rows: list[list[str]], header: list[str],
                   n_cols: int) -> tuple[int, frozenset[int]]:
    """Shared entry point: (label_col_idx, code_col_idxs). Both stay at
    their inert defaults (0, empty) whenever there isn't enough data to be
    confident — fewer than a handful of data rows, or no columns at all."""
    if not n_cols or len(data_rows) < _MIN_ROWS_FOR_CLASSIFICATION:
        return 0, frozenset()
    scores = column_content_scores(data_rows, header, n_cols)
    label_col_idx = _classify_label_column(scores)
    return label_col_idx, _code_column_relative_idxs(scores, header, label_col_idx)


def data_columns(cells: list[str], label_col_idx: int) -> list[str]:
    """All cells except the label column, left-to-right order preserved.
    Equivalent to today's `cells[1:]` when label_col_idx == 0 (the default
    for every pre-P7.T3 fixture)."""
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
    """True if any *non-label* cell (index >= 1) carries period-bearing
    content that still NEEDS a merge to become a complete period: a bare
    quarter/half-year word marker (no year — e.g. "I квартал", the year may
    live on a neighboring stacked row) or a day+RU-month phrase without a
    year («На 31 декабря»).

    Round 1 (F1): a cell that already resolves to a *complete* period on
    its own (`M.detect_period_objects`) is explicitly excluded first and is
    NEVER fragment evidence, even though it obviously "carries period
    content" — a bare, already-complete year is not proof the row is a
    header fragment. Before this fix, a title row whose date happened to
    sit in the second cell («ТОО «Тест» — баланс;на 31 декабря 2024
    года;;») matched on that bare year and got merged straight into the
    header, landing "2024" inside the neighboring «Код» column's header
    text and promoting it to a period column (RSBU line codes presented as
    balance-sheet values at full confidence). The two triggers left after
    the exclusion — a bare quarter word, a day+month with no year — can
    never independently resolve via detect_period_objects (both require a
    year to form a complete Period), so there is no overlap between the
    exclusion and the trigger: nothing that legitimately needs a merge is
    ever skipped by it.

    Restricted to cells[1:] for a second, independent reason: a title row's
    year is typically embedded in cell-0 prose («Отчёт... за 2024 год»),
    while a genuine stacked-header fragment carries its date/quarter
    content in its own, separate cell."""
    for cell in cells[1:]:
        if not cell:
            continue
        if M.detect_period_objects([cell]):
            continue  # resolves to a complete period alone — not fragment evidence
        if M.has_quarter_marker_without_year(cell) or _DATE_NO_YEAR_RE.search(cell):
            return True
    return False


def merge_header_block(norm_rows: list[tuple[int, list[str]]],
                       header_pos: int) -> tuple[list[str], set[int]]:
    """Merge `header_pos` with immediately adjacent header-fragment rows.
    A neighbor merges in only when it is not itself a data row and it adds
    period-bearing content that still needs completing — this is what keeps
    section-title rows (no metric match, but also no such content) and
    title rows with an already-complete date elsewhere (F1) out. Returns
    the merged header cells and the set of norm_rows *positions* consumed,
    so the caller skips them when building data rows."""
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


def select_comparable_periods(
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
