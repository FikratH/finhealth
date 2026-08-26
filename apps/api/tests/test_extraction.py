"""Table mapping: header choice, Код column, best-match dedup (findings 1, 2, 3, 15)."""
from pathlib import Path

from app.services.extraction import extract_from_csv

GOLDEN = Path(__file__).resolve().parent / "golden"


def _values(result):
    return {v.metric: v.value for v in result.values if v.value is not None}


def test_kod_column_is_not_a_value_column():
    res = extract_from_csv((GOLDEN / "rsbu_kod_column.csv").read_bytes())
    vals = _values(res)
    assert vals["inventory"] == 312600
    assert vals["current_assets"] == 808750
    assert vals["total_assets"] == 2456800
    assert vals["current_liabilities"] == 486200
    prev = {v.metric: v.value for v in res.previous_values}
    assert prev["total_assets"] == 2298500


def test_title_row_does_not_eat_the_header():
    res = extract_from_csv((GOLDEN / "title_row.csv").read_bytes())
    assert res.latest_period == "2024"
    assert res.previous_period == "2023"
    assert _values(res)["total_assets"] == 2456800
    assert {v.metric: v.value for v in res.previous_values}["total_assets"] == 2298500


def test_exact_total_beats_earlier_fuzzy_match():
    csv = (
        "Показатель;2024;2023\n"
        "Итого активы раздела;99;98\n"
        "Итого активы;2 456 800;2 298 500\n"
    ).encode()
    res = extract_from_csv(csv)
    assert _values(res)["total_assets"] == 2456800
    ev = {v.metric: v for v in res.values}["total_assets"]
    assert ev.value == 2456800 and ev.confidence == 95.0


def test_expense_signs_are_normalized_positive():
    csv = (
        "Показатель;2024;2023\n"
        "Доход от реализации;3 245 900;2 987 400\n"
        "Себестоимость реализованной продукции;(2 271 100);(2 122 300)\n"
        "Проценты к уплате;(148 200);(139 700)\n"
    ).encode()
    res = extract_from_csv(csv)
    vals = _values(res)
    assert vals["cost_of_goods_sold"] == 2271100
    assert vals["interest_expense"] == 148200
    assert any("знак" in w.lower() for w in res.warnings)


def test_kz_no_year_header_maps_kod_and_period_columns_by_label():
    res = extract_from_csv((GOLDEN / "rsbu_kod_no_year_header.csv").read_bytes())
    vals = _values(res)
    assert vals["inventory"] == 312600
    assert vals["current_assets"] == 808750
    assert vals["total_assets"] == 2456800
    assert vals["current_liabilities"] == 486200
    prev = {v.metric: v.value for v in res.previous_values}
    assert prev["total_assets"] == 2298500
    codes = {1210, 1200, 1600, 1500}
    assert not (set(vals.values()) & codes)
    assert not (set(prev.values()) & codes)


def test_headerless_two_numeric_column_table_triggers_safety_net():
    csv = (
        "Запасы;1210;312 600\n"
        "Итого активы;1600;2 456 800\n"
    ).encode()
    res = extract_from_csv(csv)
    assert any("не распознаны" in w.lower() for w in res.warnings)
    matched = [v for v in res.values if v.value is not None]
    assert matched
    assert all(v.confidence <= 50 for v in matched)


def test_duplicate_parenthesized_value_across_sections_no_false_dup_warning():
    csv = (
        "Показатель;2024;2023\n"
        "Себестоимость реализованной продукции;(2 271 100);(2 122 300)\n"
        "Себестоимость продаж;(2 271 100);(2 122 300)\n"
    ).encode()
    res = extract_from_csv(csv)
    vals = _values(res)
    assert vals["cost_of_goods_sold"] == 2271100
    assert not any("дублирующ" in w.lower() for w in res.warnings)


def test_advanced_metrics_net_ppe():
    """Test extraction of net_ppe (Основные средства) metric."""
    csv = (
        "Показатель;2024;2023\n"
        "Основные средства;850 000;830 000\n"
    ).encode()
    res = extract_from_csv(csv)
    vals = _values(res)
    assert vals["net_ppe"] == 850000
    prev = {v.metric: v.value for v in res.previous_values}
    assert prev["net_ppe"] == 830000


def test_advanced_metrics_sga_expense_with_sign_warning():
    """Test extraction of sga_expense (Управленческие расходы) with parenthesized negatives."""
    csv = (
        "Показатель;2024;2023\n"
        "Управленческие расходы;(120 000);(110 000)\n"
    ).encode()
    res = extract_from_csv(csv)
    vals = _values(res)
    assert vals["sga_expense"] == 120000
    prev = {v.metric: v.value for v in res.previous_values}
    assert prev["sga_expense"] == 110000
    assert any("знак" in w.lower() for w in res.warnings)
