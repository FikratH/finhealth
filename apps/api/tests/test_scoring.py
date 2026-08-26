import pytest
from app.schemas import RatioStatus
from app.services.ratios import Inputs, compute_all
from app.services.scoring import apply_benchmarks, load_benchmarks


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
