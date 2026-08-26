import copy
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.schemas import AnalysisRequest, ExtractedValue, Scale
from app.services.analysis import run_analysis
from tests.test_beneish import FULL_LATEST as BENEISH_FULL_LATEST
from tests.test_beneish import FULL_PREVIOUS as BENEISH_FULL_PREVIOUS

client = TestClient(app)
DEMO = Path(__file__).resolve().parent.parent / "demo" / "demo_company.csv"


def _val(metric, value, **kw):
    return ExtractedValue(metric=metric, original_label=metric, value=value, **kw)


# ---------------------------------------------------------------------------
# risk_radar wiring (Task 5): demo-shaped two-period figures — mirrors
# demo/demo_company.csv (see tests/test_api.py::test_extraction_of_demo_file)
# but built directly as ExtractedValues so this stays a unit test on
# run_analysis rather than round-tripping through upload/extract.
# The demo has no long_term_debt / shares_outstanding (drops Piotroski
# signal 5/7, still >= 6 computable) and no net_ppe / sga_expense /
# depreciation_amortization (Beneish has only 4 of 8 indices -> null).
# ---------------------------------------------------------------------------
DEMO_LATEST = {
    "revenue": 3245900, "cost_of_goods_sold": 2271100, "gross_profit": 974800,
    "operating_income": 356400, "interest_expense": 148200, "net_income": 148500,
    "total_assets": 2456800, "current_assets": 808750, "cash": 185400,
    "short_term_investments": 42000, "accounts_receivable": 268750,
    "inventory": 312600, "total_liabilities": 1026200, "current_liabilities": 486200,
    "accounts_payable": 198300, "total_debt": 540000, "shareholders_equity": 1430600,
    "operating_cash_flow": 287300, "capital_expenditures": 96500,
}
DEMO_PREVIOUS = {
    "revenue": 2987400, "cost_of_goods_sold": 2122300, "gross_profit": 865100,
    "operating_income": 298700, "interest_expense": 139700, "net_income": 118300,
    "total_assets": 2298500, "current_assets": 767900, "cash": 142300,
    "short_term_investments": 35000, "accounts_receivable": 301200,
    "inventory": 289400, "total_liabilities": 1051700, "current_liabilities": 441700,
    "accounts_payable": 176500, "total_debt": 610000, "shareholders_equity": 1246800,
    "operating_cash_flow": 241600, "capital_expenditures": 84200,
}


def _demo_shaped_request():
    return AnalysisRequest(
        industry="manufacturing", scale=Scale.units,
        values=[_val(k, v) for k, v in DEMO_LATEST.items()],
        previous_values=[_val(k, v) for k, v in DEMO_PREVIOUS.items()])


def test_risk_radar_present_piotroski_computable_beneish_null_on_demo_shape():
    res = run_analysis(_demo_shaped_request())
    assert res.risk_radar is not None
    assert res.risk_radar.piotroski.max >= 6
    assert res.risk_radar.beneish.m_score is None
    assert any(w.code == "beneish" for w in res.warnings)


def test_risk_radar_beneish_computes_m_score_with_rich_two_period_data():
    req = AnalysisRequest(
        industry="manufacturing", scale=Scale.units,
        values=[_val(k, v) for k, v in BENEISH_FULL_LATEST.items()],
        previous_values=[_val(k, v) for k, v in BENEISH_FULL_PREVIOUS.items()])
    res = run_analysis(req)
    assert isinstance(res.risk_radar.beneish.m_score, float)
    assert res.risk_radar.beneish.flag is not None


def _upload_and_extract():
    with open(DEMO, "rb") as f:
        up = client.post("/api/upload", files={"file": ("demo_company.csv", f, "text/csv")})
    assert up.status_code == 200, up.text
    upload_id = up.json()["upload_id"]
    ex = client.post("/api/extract", json={"upload_id": upload_id})
    assert ex.status_code == 200, ex.text
    return ex.json()


def test_risk_radar_serializes_with_all_four_keys_in_analyze_response():
    ex = _upload_and_extract()
    req = {
        "upload_id": ex["upload_id"], "industry": "manufacturing",
        "currency": ex["currency"], "scale": ex["scale"],
        "latest_period": ex["latest_period"], "previous_period": ex["previous_period"],
        "audited": ex["audited"], "values": copy.deepcopy(ex["values"]),
        "previous_values": copy.deepcopy(ex["previous_values"]),
    }
    resp = client.post("/api/analyze", json=req)
    assert resp.status_code == 200, resp.text
    radar = resp.json()["risk_radar"]
    assert set(radar.keys()) >= {"altman", "piotroski", "beneish", "dupont"}


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
