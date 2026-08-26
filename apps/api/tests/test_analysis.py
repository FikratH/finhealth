from app.schemas import AnalysisRequest, ExtractedValue, Scale
from app.services.analysis import run_analysis


def _val(metric, value, **kw):
    return ExtractedValue(metric=metric, original_label=metric, value=value, **kw)


def test_request_scale_applies_to_values_without_scale():
    req = AnalysisRequest(
        industry="manufacturing", scale=Scale.millions,
        values=[_val("revenue", 3245.9), _val("net_income", 148.5),
                _val("total_assets", 2456.8)])
    res = run_analysis(req)
    roa = next(r for r in res.ratios if r.key == "roa")
    assert roa.inputs["net_income"] == 148_500_000


def test_per_share_metrics_are_never_scaled():
    req = AnalysisRequest(
        industry="manufacturing", scale=Scale.thousands,
        values=[_val("net_income", 100_000), _val("share_price", 10),
                _val("shares_outstanding", 1_000_000), _val("shareholders_equity", 500_000)])
    res = run_analysis(req)
    pb = next(r for r in res.ratios if r.key == "pb")
    # mc = 10 * 1_000_000 (unscaled) ; equity = 500_000 * 1000
    assert abs(pb.value - (10 * 1_000_000) / (500_000 * 1000)) < 1e-9


def test_no_data_reports_insufficient_not_critical():
    req = AnalysisRequest(industry="manufacturing", scale=Scale.units, values=[])
    res = run_analysis(req)
    assert res.overall_score is None
    assert "недостаточно данных" in res.health_label.lower()
    assert "критическое" not in res.health_label.lower()
