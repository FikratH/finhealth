import copy
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.schemas import AnalysisRequest, AnalysisResult, ExtractedValue, Scale
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


# --- Method-aware benchmark wording (fix wave / F1) -------------------------
# manufacturing.net_margin is Damodaran-sourced (method=band-around-center-v1);
# manufacturing.current_ratio is still method=demo. Both ship in the same
# analysis, so the explanation text must reflect each ratio's own provenance.

def test_damodaran_sourced_ratio_explanation_cites_source_not_demo():
    res = run_analysis(_demo_shaped_request())
    net_margin = next(r for r in res.ratios if r.key == "net_margin")
    assert "Damodaran" in net_margin.explanation
    assert "Демонстрационный" not in net_margin.explanation


def test_demo_method_ratio_explanation_still_says_demonstrational():
    res = run_analysis(_demo_shaped_request())
    current_ratio = next(r for r in res.ratios if r.key == "current_ratio")
    assert "Демонстрационный" in current_ratio.explanation


def test_benchmarks_warning_discloses_mixed_sourcing():
    res = run_analysis(_demo_shaped_request())
    bm_warning = next(w for w in res.warnings if w.code == "benchmarks")
    assert "Damodaran" in bm_warning.message
    assert "демонстрационными" in bm_warning.message


def test_default_disclaimer_leads_with_professional_advice_notice():
    res = run_analysis(_demo_shaped_request())
    assert res.disclaimer.startswith(
        "Сервис не заменяет профессиональную финансовую консультацию.")
    assert "Damodaran" in res.disclaimer
    assert "демонстрационными" in res.disclaimer
    # Phase-7 final wave, MF2: the disclaimer used to name only Damodaran-
    # or-demo, silently omitting the third source category (KZ marks)
    # the Phase 7 delta introduced — a skeptical reader would conclude
    # every «ориентир РК» figure is demo data. Now names it explicitly.
    assert "Нацбанк" in res.disclaimer


# --- Provenance: source_values (Plan 4 / Task 3) ----------------------------

def test_source_values_mirrors_request_values_latest_period_only():
    req = _demo_shaped_request()
    res = run_analysis(req)
    assert len(res.source_values) == len(req.values)
    assert {sv.metric for sv in res.source_values} == {v.metric for v in req.values}
    # DEMO_LATEST and DEMO_PREVIOUS share the same metric keys with
    # different figures — assert the stored value is the *latest* one
    # (3245900), not the previous period's (2987400), proving
    # source_values tracks req.values and not req.previous_values.
    revenue_sv = next(sv for sv in res.source_values if sv.metric == "revenue")
    assert revenue_sv.value == 3245900


def test_source_values_carry_original_label_source_snippet_confidence_and_manual_flag():
    req = AnalysisRequest(
        industry="manufacturing", scale=Scale.units,
        values=[ExtractedValue(
            metric="revenue", original_label="Выручка от реализации", value=100_000,
            source="CSV, строка 3", confidence=92, snippet="100 000",
            manually_edited=True)])
    res = run_analysis(req)
    sv = res.source_values[0]
    assert sv.original_label == "Выручка от реализации"
    assert sv.source == "CSV, строка 3"
    assert sv.snippet == "100 000"
    assert sv.confidence == 92
    assert sv.manually_edited is True


def test_source_values_absent_key_on_old_stored_payload_still_parses_as_empty():
    # GET /api/analysis/{id} returns the raw stored JSON verbatim (no
    # re-validation) — this test instead guards the schema itself: a
    # payload persisted before this field existed, fed back through
    # AnalysisResult (e.g. any future migration/validation path), must
    # still parse rather than raise, defaulting to [].
    payload = run_analysis(_demo_shaped_request()).model_dump(mode="json")
    del payload["source_values"]
    result = AnalysisResult(**payload)
    assert result.source_values == []
