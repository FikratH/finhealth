"""Phase 7, Task 3: column-role classifier (a), multi-row header merge (b),
quarterly period selection (c). Six new golden fixtures, one per path plus
the required ambiguous-fallback pin. Every expected value below was
hand-computed from the fixture's own raw cells (see each test's docstring)
rather than frozen from a first run of the pipeline.
"""
from pathlib import Path

from app.services.extraction import extract_from_csv, extract_from_xlsx

GOLDEN = Path(__file__).resolve().parent / "golden"


def _values(result):
    return {v.metric: v.value for v in result.values if v.value is not None}


def _prev(result):
    return {v.metric: v.value for v in result.previous_values if v.value is not None}


def test_shuffled_columns_locates_label_by_content_not_position():
    """golden/shuffled_columns.csv puts the code column first and the label
    column second («Код;Наименование показателя;...»). Positional logic
    (column 0 = label) would treat the 4-digit code as the row label and
    match nothing; the classifier must find the label column by its
    Cyrillic-text content instead. Expected values are the raw cells
    themselves — no arithmetic involved."""
    res = extract_from_csv((GOLDEN / "shuffled_columns.csv").read_bytes())
    vals = _values(res)
    assert vals["inventory"] == 312600
    assert vals["total_assets"] == 2456800
    assert vals["current_liabilities"] == 486200
    prev = _prev(res)
    assert prev["inventory"] == 289400
    assert prev["total_assets"] == 2298500
    assert prev["current_liabilities"] == 441700
    # the 4-digit codes must never leak into extracted values
    codes = {1210, 1600, 1500}
    assert not (set(vals.values()) & codes)
    assert res.latest_period == "2024"
    assert res.previous_period == "2023"


def test_codeless_statement_regular_single_row_header_unaffected():
    """golden/codeless_statement.csv has ≥3 data rows (enough to trigger
    real classification, not just the row-count fallback) but a normal,
    unshuffled layout and no «Код» column at all — pins that the new
    classifier/merge machinery is a no-op here (label stays column 0,
    no header rows get merged) and every value still comes through,
    including the parenthesized cost-of-sales sign flip."""
    res = extract_from_csv((GOLDEN / "codeless_statement.csv").read_bytes())
    vals = _values(res)
    assert vals["revenue"] == 4120300
    assert vals["cost_of_goods_sold"] == 2850100  # sign normalized from (2 850 100)
    assert vals["total_assets"] == 3102400
    assert vals["total_liabilities"] == 1450800
    assert vals["shareholders_equity"] == 1651600
    prev = _prev(res)
    assert prev["revenue"] == 3780900
    assert prev["cost_of_goods_sold"] == 2601200
    assert any("знак" in w.lower() for w in res.warnings)


def test_thousands_separator_variants_all_parse_and_classify_as_period():
    """golden/thousands_separator_variants.csv mixes three thousands-
    separator styles in one statement: EU dot-thousands + comma-decimal
    (4.120.300,50), apostrophe thousands (2'456'800), and plain-space
    thousands (1 026 200). All three must parse correctly *and* the
    numeric-density part of the column classifier must still recognize
    both data columns as period columns despite the differing formats."""
    res = extract_from_csv((GOLDEN / "thousands_separator_variants.csv").read_bytes())
    vals = _values(res)
    assert vals["revenue"] == 4120300.5
    assert vals["total_assets"] == 2456800
    assert vals["total_liabilities"] == 1026200
    prev = _prev(res)
    assert prev["revenue"] == 3780900.25
    assert prev["total_assets"] == 2298500
    assert prev["total_liabilities"] == 1051700


def test_ambiguous_two_text_columns_falls_back_to_position_zero():
    """golden/ambiguous_fallback.csv has TWO equally text-heavy columns
    («Раздел»: Активы/Активы/Пассивы, and «Показатель»: the real line
    items) — the classifier must decline (not exactly one confident
    candidate) and fall back wholesale to today's column-0-is-label
    positional rule, exactly as if none of P7.T3's new logic existed.
    Under that rule, column 0 («Раздел») becomes the label: "Активы"
    itself exact-matches the total_assets synonym list, so both "Активы"
    rows collide on total_assets (first wins, second raises the existing
    duplicate-value warning) and "Пассивы" matches no metric at all and is
    dropped — this is the *current*, unimproved behavior for this shape,
    reproduced by hand-tracing match_label()/parse_number() against the
    unchanged algorithm, not a new behavior being asserted as correct."""
    res = extract_from_csv((GOLDEN / "ambiguous_fallback.csv").read_bytes())
    vals = _values(res)
    assert vals == {"total_assets": 2456800}
    prev = _prev(res)
    assert prev == {"total_assets": 2298500}
    assert any("дублирующ" in w.lower() for w in res.warnings)


def test_quarterly_csv_falls_back_to_latest_two_overall_when_no_same_kind_match():
    """golden/quarterly_mixed_periods.csv headers with a quarter-end date
    (31.03.2024 -> Q1 2024, quarter) and a year-end date (31.12.2023 ->
    "2023", annual — dd.mm with mm=12 is deliberately excluded from quarter
    detection, see metrics.py). The latest period (Q1 2024) has no other
    quarter to pair with, so selection must fall back to "latest two
    periods overall" rather than leaving `previous_period` empty."""
    res = extract_from_csv((GOLDEN / "quarterly_mixed_periods.csv").read_bytes())
    assert res.latest_period == "Q1 2024"
    assert res.previous_period == "2023"
    assert res.periods == ["Q1 2024", "2023"]
    vals = _values(res)
    assert vals["revenue"] == 1245000
    assert vals["total_assets"] == 2456800
    prev = _prev(res)
    assert prev["revenue"] == 4780900
    assert prev["total_assets"] == 2298500
    sel = res.period_selection
    assert sel is not None
    assert sel.chosen == ["Q1 2024", "2023"]
    assert sel.rejected == []
    assert "использованы последние два периода" in sel.reason


def test_multi_row_header_xlsx_merges_quarter_word_row_with_year_row():
    """golden/multi_row_header.xlsx splits the header across two physical
    rows: row 2 carries the quarter words («I квартал», «II квартал») with
    no year, row 3 carries the year alone («2024 г.», «2024 г.») for both
    columns. Without merging, both columns would canonicalize to the same
    bare year "2024" and collide — the second column's numbers would be
    silently dropped. After merging, the columns must resolve to distinct
    "Q1 2024" / "Q2 2024" periods and both quarters' numbers must survive,
    with Q2 (the more recent quarter) selected as latest."""
    res = extract_from_xlsx((GOLDEN / "multi_row_header.xlsx").read_bytes())
    assert res.latest_period == "Q2 2024"
    assert res.previous_period == "Q1 2024"
    assert set(res.periods) == {"Q1 2024", "Q2 2024"}
    vals = _values(res)
    assert vals["total_assets"] == 1620000
    assert vals["total_liabilities"] == 950000
    prev = _prev(res)
    assert prev["total_assets"] == 1500000
    assert prev["total_liabilities"] == 900000
    sel = res.period_selection
    assert sel is not None
    assert sel.chosen == ["Q2 2024", "Q1 2024"]
    assert "quarter" in sel.reason


def test_period_selection_meta_present_and_stable_for_plain_annual_demo_shape():
    """A pure annual two-period file (the demo shape) must select exactly
    like before P7.T3 — ordered[0]/ordered[1] — and now additionally expose
    period_selection as an additive field with a "same type" reason."""
    csv = (
        "Показатель;2024;2023\n"
        "Итого активы;2 456 800;2 298 500\n"
        "Итого обязательства;1 026 200;1 051 700\n"
        "Собственный капитал;1 430 600;1 246 800\n"
    ).encode()
    res = extract_from_csv(csv)
    assert res.latest_period == "2024"
    assert res.previous_period == "2023"
    sel = res.period_selection
    assert sel is not None
    assert sel.chosen == ["2024", "2023"]
    assert sel.rejected == []
    assert "annual" in sel.reason


def test_determinism_shuffled_and_multi_row_header_byte_identical_across_runs():
    """Same file -> same output, every run (spawn-context ProcessPool
    determinism requirement) — checked directly for the two fixtures whose
    new code paths (classifier, header merge) are most likely to have any
    hidden order-dependence (dict ordering, set iteration order)."""
    csv_bytes = (GOLDEN / "shuffled_columns.csv").read_bytes()
    xlsx_bytes = (GOLDEN / "multi_row_header.xlsx").read_bytes()
    r1 = extract_from_csv(csv_bytes)
    r2 = extract_from_csv(csv_bytes)
    assert r1.model_dump() == r2.model_dump()
    x1 = extract_from_xlsx(xlsx_bytes)
    x2 = extract_from_xlsx(xlsx_bytes)
    assert x1.model_dump() == x2.model_dump()
