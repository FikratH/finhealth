import pytest
from app.schemas import RatioStatus, CategoryScore
from app.services.ratios import Inputs, compute_all
from app.services.scoring import apply_benchmarks, load_benchmarks, _score_against_benchmark, overall_score


def test_money_metrics_are_informational_not_scored():
    i = Inputs(latest={"operating_cash_flow": 287300, "capital_expenditures": 96500,
                       "total_debt": 540000, "cash": 185400}, previous={})
    ratios = apply_benchmarks(compute_all(i), "manufacturing")
    by = {r.key: r for r in ratios}
    for key in ("free_cash_flow", "net_debt"):
        assert by[key].status == RatioStatus.na
        assert by[key].score is None
        assert "справочная" in by[key].explanation.lower()


def test_benchmarks_contain_no_money_unit_ranges():
    data = load_benchmarks()
    for ind_id, cfg in data["industries"].items():
        assert "free_cash_flow" not in cfg["ratios"], ind_id


def test_benchmarks_schema_is_validated():
    from app.services.scoring import _validate_benchmarks
    with pytest.raises(ValueError):
        _validate_benchmarks({"industries": {"x": {"name": "X", "category_weights": {},
                              "ratios": {"roa": {"weight": 1, "direction": "sideways",
                                                 "good": [0, 1], "acceptable": [0, 1]}}}}})


def test_completeness_measured_against_core_dictionary_not_payload():
    from app.schemas import AnalysisRequest, ExtractedValue, Scale
    from app.services.analysis import run_analysis
    vals = [ExtractedValue(metric=m, original_label=m, value=100.0)
            for m in ("revenue", "net_income", "total_assets",
                      "current_assets", "current_liabilities")]
    res = run_analysis(AnalysisRequest(industry="manufacturing",
                                       scale=Scale.units, values=vals))
    assert res.confidence.data_completeness < 50  # 5 of ~19 core metrics, not 100


def test_direction_higher_boundaries():
    bm = {"direction": "higher", "good": [2.0, 3.0], "acceptable": [1.0, 3.0]}
    assert _score_against_benchmark(2.5, bm)[1] == RatioStatus.good
    assert _score_against_benchmark(1.5, bm)[1] == RatioStatus.attention
    score, status = _score_against_benchmark(0.5, bm)
    assert status == RatioStatus.critical and 0 <= score <= 50


def test_direction_lower_boundaries():
    bm = {"direction": "lower", "good": [0, 1.0], "acceptable": [0, 2.0]}
    assert _score_against_benchmark(0.8, bm)[1] == RatioStatus.good
    assert _score_against_benchmark(1.5, bm)[1] == RatioStatus.attention
    assert _score_against_benchmark(3.0, bm)[1] == RatioStatus.critical


def test_direction_range_boundaries():
    bm = {"direction": "range", "good": [1.5, 2.5], "acceptable": [1.0, 3.5]}
    assert _score_against_benchmark(2.0, bm)[1] == RatioStatus.good
    assert _score_against_benchmark(1.2, bm)[1] == RatioStatus.attention
    assert _score_against_benchmark(5.0, bm)[1] == RatioStatus.critical


def test_overall_score_renormalizes_weights():
    cats = [CategoryScore(category="liquidity", label="L", score=80.0, weight=0.5),
            CategoryScore(category="market", label="M", score=None, weight=0.5)]
    score, notes = overall_score(cats)
    assert score == 80.0          # only the available category counts
    assert notes                  # renormalization disclosed


# --- Damodaran-derived benchmarks (Plan 2 / Task 6) ------------------------

def test_every_benchmark_entry_has_a_method():
    data = load_benchmarks()
    for ind_id, cfg in data["industries"].items():
        for rk, bm in cfg["ratios"].items():
            assert bm.get("method"), f"{ind_id}.{rk} is missing a method field"


def test_damodaran_sourced_entries_carry_full_citation():
    data = load_benchmarks()
    for ind_id, cfg in data["industries"].items():
        for rk, bm in cfg["ratios"].items():
            if bm.get("method") == "band-around-center-v1":
                for field in ("source", "source_url", "as_of"):
                    assert bm.get(field), f"{ind_id}.{rk} missing {field}"


def test_saas_gross_margin_exceeds_manufacturing():
    # Software margins should structurally exceed heavy-industry margins.
    data = load_benchmarks()
    saas_lo = data["industries"]["saas"]["ratios"]["gross_margin"]["good"][0]
    mfg_lo = data["industries"]["manufacturing"]["ratios"]["gross_margin"]["good"][0]
    assert saas_lo > mfg_lo


def test_manufacturing_inventory_turnover_center_is_plausible():
    data = load_benchmarks()
    bm = data["industries"]["manufacturing"]["ratios"]["inventory_turnover"]
    assert bm["method"] == "band-around-center-v1"
    # good = [center * 0.85, center * 1.8] for direction "higher" (band-around-center-v1)
    center = bm["good"][0] / 0.85
    assert 2 <= center <= 20


def test_benchmarks_still_validate_after_damodaran_merge():
    # load_benchmarks() runs _validate_benchmarks(); this just re-asserts it
    # doesn't raise against the live (non-mocked) benchmarks.json.
    data = load_benchmarks()
    assert len(data["industries"]) == 10
