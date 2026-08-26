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
