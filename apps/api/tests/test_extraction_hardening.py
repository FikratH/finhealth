"""Phase 7, Task 3: column-role classifier (a), multi-row header merge (b),
quarterly period selection (c). Six new golden fixtures, one per path plus
the required ambiguous-fallback pin. Every expected value below was
hand-computed from the fixture's own raw cells (see each test's docstring)
rather than frozen from a first run of the pipeline.

Round 1 (post-review) additions below the original eight: F1's adversarial
title-date-in-cell-2 fixture, F2/S1's shuffled+statutory-no-year fixture,
F3's inline lying-«Код»-header regression, F4's 3-period same-kind-vs.
latest-two fixture, F7's non-comparable-pair warning, F8's snippet-ordering
check. All expected values re-derived by hand against the *fixed* code, not
copied from the review's counterfactual pre-fix numbers.
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


# ---------------------------------------------------------------------------
# Round 1 (post-review fixes)
# ---------------------------------------------------------------------------

def test_title_date_in_second_cell_does_not_corrupt_the_header_f1():
    """F1 (blocking): golden/title_date_in_second_cell.csv is
    rsbu_kod_column.csv with the title's date moved into the title row's
    *second* cell («ТОО «Тест» — баланс;на 31 декабря 2024 года;;»). Before
    the fix, that bare year was read as fragment evidence, merging the
    title row into the header and landing "2024" inside the «Код» column's
    header text — promoting the line-code column to a period column, so the
    codes (1210/1600/1400) came out as the latest period's *values* at full
    confidence with no warning. After the fix (a cell that already resolves
    to a complete period on its own is never fragment evidence), the title
    row stays out of the header entirely — same outcome as
    rsbu_kod_column.csv itself: real figures, not codes, confidence 95."""
    res = extract_from_csv((GOLDEN / "title_date_in_second_cell.csv").read_bytes())
    vals = _values(res)
    assert vals["inventory"] == 312600
    assert vals["total_assets"] == 2456800
    assert vals["total_liabilities"] == 1026200
    prev = _prev(res)
    assert prev["inventory"] == 289400
    assert prev["total_assets"] == 2298500
    assert prev["total_liabilities"] == 1051700
    codes = {1210, 1600, 1400}
    assert not (set(vals.values()) & codes)
    ev = {v.metric: v for v in res.values}["total_assets"]
    assert ev.confidence == 95.0
    assert not any("не распознаны" in w.lower() for w in res.warnings)


def test_shuffled_statutory_no_year_header_extracts_values_not_codes_f2_s1():
    """F2/S1 (must close): golden/shuffled_statutory_no_year_header.csv is
    the KZ statutory no-year layout («Наименование показателя / Код строки
    / На конец / На начало») with the «Код» column moved to position 0.
    There is no header text to read «код» from at all here — the header
    itself is never even recognized (_find_header_index finds no
    year-bearing row and cell 0 reads "Код", not "наименование") — so
    before the F2/S1 veto, the classifier correctly relocated the label
    column but nothing stopped the code column's own 4-digit values from
    winning the position-0-safety-net's "first numeric cell wins" pick:
    inventory came out as 1210 instead of 312600. The content-based
    code-column veto (code score >= 0.6, independent of any header text)
    closes this: the code column is skipped entirely, and the *real*
    number — now the first non-vetoed numeric cell — wins instead. Still
    routes through the safety net (no header recognized at all), so
    confidence is still capped at 50 and the "не распознаны" warning still
    fires — the veto fixes *which* number is picked, not the honesty
    signal that periods were never resolved for this file."""
    res = extract_from_csv((GOLDEN / "shuffled_statutory_no_year_header.csv").read_bytes())
    vals = _values(res)
    assert vals["inventory"] == 312600
    assert vals["total_assets"] == 2456800
    assert vals["current_liabilities"] == 486200
    codes = {1210, 1600, 1500}
    assert not (set(vals.values()) & codes)
    matched = [v for v in res.values if v.value is not None]
    assert matched and all(v.confidence <= 50 for v in matched)
    assert any("не распознаны" in w.lower() for w in res.warnings)


def test_kod_header_with_embedded_year_does_not_leak_codes_as_a_period_f3():
    """F3: a «Код» column whose header text itself happens to contain a
    year («Код строки 2025») must not be read as a period column even
    though has_year_columns would otherwise be true from the *other*,
    genuine year columns — the explicit «код»-token check on the
    col_period-building loop (added alongside F2/S1's content veto) skips
    it regardless of what the header text otherwise says."""
    csv = (
        "Наименование показателя;Код строки 2025;2024;2023\n"
        "Запасы;1210;312 600;289 400\n"
        "Итого активы;1600;2 456 800;2 298 500\n"
    ).encode()
    res = extract_from_csv(csv)
    vals = _values(res)
    assert vals["inventory"] == 312600
    assert vals["total_assets"] == 2456800
    assert not (set(vals.values()) & {1210, 1600})
    assert res.latest_period == "2024"


def test_three_periods_prefers_same_kind_quarter_pair_and_rejects_the_odd_annual_f4():
    """F4: golden/quarterly_three_periods_prefers_same_kind.csv carries
    THREE periods — Q1 2024, annual 2023, Q1 2023 — where naive
    "ordered[0]/ordered[1]" (sorted purely by recency) would pick Q1 2024 +
    annual 2023 (since 2023-annual sorts above Q1 2023: same year, later
    end-month), but the same-kind rule must instead skip past the annual
    period to pair Q1 2024 with Q1 2023, rejecting "2023" outright. This is
    the one rule item (c) is built around, and (unlike every other fixture
    in this suite, which all have exactly two periods) it is the only test
    where naive latest-two and same-kind-preferred selection disagree."""
    res = extract_from_csv(
        (GOLDEN / "quarterly_three_periods_prefers_same_kind.csv").read_bytes())
    assert res.latest_period == "Q1 2024"
    assert res.previous_period == "Q1 2023"
    assert res.periods == ["Q1 2024", "2023", "Q1 2023"]
    vals = _values(res)
    assert vals["revenue"] == 1245000
    assert vals["total_assets"] == 2456800
    prev = _prev(res)
    assert prev["revenue"] == 1180000  # Q1 2023, NOT the annual 4 780 900
    assert prev["total_assets"] == 2150000
    sel = res.period_selection
    assert sel is not None
    assert sel.chosen == ["Q1 2024", "Q1 2023"]
    assert sel.rejected == ["2023"]
    assert "quarter" in sel.reason


def test_non_comparable_period_pair_raises_a_warning_f7():
    """F7: golden/quarterly_mixed_periods.csv (from the original suite)
    selects Q1 2024 vs. annual 2023 via the "no same-kind match" fallback —
    a genuinely non-comparable pair that still feeds the ratio engine and
    the confidence score's has-previous-period bonus. period_selection's
    `reason` records the fallback in meta, but `warnings` is what a plain
    ExtractionResult reader (the verify step) actually surfaces — it must
    say so too, not just meta."""
    res = extract_from_csv((GOLDEN / "quarterly_mixed_periods.csv").read_bytes())
    assert any("разного типа" in w.lower() for w in res.warnings)


def test_same_kind_period_pair_does_not_raise_the_non_comparable_warning():
    """Negative case for F7: a same-kind pair (the plain annual demo shape)
    must NOT trigger the non-comparable-periods warning — it would be a
    false alarm on the overwhelmingly common case."""
    csv = (
        "Показатель;2024;2023\n"
        "Итого активы;2 456 800;2 298 500\n"
    ).encode()
    res = extract_from_csv(csv)
    assert not any("разного типа" in w.lower() for w in res.warnings)


def test_snippet_reflects_original_document_column_order_f8():
    """F8: for a relocated label column (golden/shuffled_columns.csv, where
    «Код» is column 0 and «Наименование показателя» is column 1), the
    snippet must read in the document's actual left-to-right order
    («1210 | Запасы | 312 600 | 289 400», matching the raw CSV row) rather
    than label-first («Запасы | 1210 | ...», which doesn't match what a
    user sees if they open their own file next to the verify step)."""
    res = extract_from_csv((GOLDEN / "shuffled_columns.csv").read_bytes())
    ev = {v.metric: v for v in res.values}["inventory"]
    assert ev.snippet == "1210 | Запасы | 312 600 | 289 400"
