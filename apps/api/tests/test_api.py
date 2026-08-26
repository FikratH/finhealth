import copy
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
DEMO = Path(__file__).resolve().parent.parent / "demo" / "demo_company.csv"


def _upload_and_extract():
    with open(DEMO, "rb") as f:
        up = client.post("/api/upload",
                         files={"file": ("demo_company.csv", f, "text/csv")})
    assert up.status_code == 200, up.text
    upload_id = up.json()["upload_id"]
    ex = client.post("/api/extract", json={"upload_id": upload_id})
    assert ex.status_code == 200, ex.text
    return ex.json()


def test_health():
    assert client.get("/api/health").json() == {"status": "ok"}


def test_industries_list():
    data = client.get("/api/industries").json()
    ids = {i["id"] for i in data["industries"]}
    assert {"saas", "banking", "manufacturing"} <= ids
    assert len(ids) == 10


def test_benchmarks_endpoint():
    resp = client.get("/api/industries/saas/benchmarks")
    assert resp.status_code == 200
    assert "inventory_turnover" in resp.json()["excluded_ratios"]
    assert client.get("/api/industries/nope/benchmarks").status_code == 404


def test_extraction_of_demo_file():
    ex = _upload_and_extract()
    assert ex["latest_period"] == "2024"
    assert ex["previous_period"] == "2023"
    assert ex["scale"] == "thousands"
    assert ex["currency"] == "KZT"
    assert ex["audited"] is True
    by = {v["metric"]: v for v in ex["values"]}
    assert by["revenue"]["value"] == 3245900
    assert by["cost_of_goods_sold"]["value"] == -2271100  # parentheses negative
    assert by["current_assets"]["value"] == 808750        # «Итого по разделу II»
    assert by["ebitda"]["value"] is None                  # missing => N/A, not 0
    assert by["revenue"]["source"]                        # traceable source
    prev = {v["metric"]: v for v in ex["previous_values"]}
    assert prev["revenue"]["value"] == 2987400
    # file must be deleted after extraction
    second = client.post("/api/extract", json={"upload_id": ex["upload_id"]})
    assert second.status_code == 404


def _analysis_request(ex, industry="manufacturing"):
    vals = copy.deepcopy(ex["values"])
    for v in vals:
        if v["metric"] == "cost_of_goods_sold" and v["value"] is not None:
            v["value"] = abs(v["value"])
        if v["metric"] == "interest_expense" and v["value"] is not None:
            v["value"] = abs(v["value"])
        if v["metric"] == "capital_expenditures" and v["value"] is not None:
            v["value"] = abs(v["value"])
    prev = copy.deepcopy(ex["previous_values"])
    for v in prev:
        if v["value"] is not None and v["metric"] in (
                "cost_of_goods_sold", "interest_expense", "capital_expenditures"):
            v["value"] = abs(v["value"])
    return {
        "upload_id": ex["upload_id"], "industry": industry,
        "currency": ex["currency"], "scale": ex["scale"],
        "latest_period": ex["latest_period"], "previous_period": ex["previous_period"],
        "audited": ex["audited"], "values": vals, "previous_values": prev,
    }


def test_full_analysis_flow():
    ex = _upload_and_extract()
    resp = client.post("/api/analyze", json=_analysis_request(ex))
    assert resp.status_code == 200, resp.text
    res = resp.json()
    assert 0 <= res["overall_score"] <= 100
    assert res["health_label"]
    ratios = {r["key"]: r for r in res["ratios"]}
    # deterministic check: CR = 808750 / 486200
    assert abs(ratios["current_ratio"]["value"] - 808750 / 486200) < 1e-6
    # P/E must be absent for a private company
    assert ratios["pe"]["value"] is None and ratios["pe"]["applicable"] is False
    # missing EBITDA => margins N/A, not zero
    assert ratios["ebitda_margin"]["value"] is None
    assert res["confidence"]["total"] > 0
    assert any("демонстрационными" in w["message"] for w in res["warnings"])
    # persistence
    got = client.get(f"/api/analysis/{res['analysis_id']}")
    assert got.status_code == 200
    assert client.delete(f"/api/analysis/{res['analysis_id']}").status_code == 200
    assert client.get(f"/api/analysis/{res['analysis_id']}").status_code == 404


def test_bank_weighted_differently_from_saas():
    ex = _upload_and_extract()
    saas = client.post("/api/analyze", json=_analysis_request(ex, "saas")).json()
    bank = client.post("/api/analyze", json=_analysis_request(ex, "banking")).json()
    assert saas["overall_score"] != bank["overall_score"]
    bank_ratios = {r["key"]: r for r in bank["ratios"]}
    assert bank_ratios["current_ratio"]["applicable"] is False
    assert bank_ratios["altman_z"]["applicable"] is False  # never for banks
    saas_ratios = {r["key"]: r for r in saas["ratios"]}
    assert saas_ratios["current_ratio"]["applicable"] is True


def test_manual_edit_changes_result():
    ex = _upload_and_extract()
    base = client.post("/api/analyze", json=_analysis_request(ex)).json()
    edited_req = _analysis_request(ex)
    for v in edited_req["values"]:
        if v["metric"] == "current_liabilities":
            v["value"] = v["value"] * 3  # user corrects the extracted number
            v["manually_edited"] = True
    edited = client.post("/api/analyze", json=edited_req).json()
    b = {r["key"]: r for r in base["ratios"]}
    e = {r["key"]: r for r in edited["ratios"]}
    assert e["current_ratio"]["value"] < b["current_ratio"]["value"]
    assert edited["overall_score"] != base["overall_score"]
    assert edited["confidence"]["manual_corrections"] == 1


def test_upload_rejects_garbage():
    resp = client.post("/api/upload",
                       files={"file": ("x.bin", b"\x00\x01\x02\x03" * 10, "application/octet-stream")})
    assert resp.status_code == 415
    resp = client.post("/api/upload", files={"file": ("x.csv", b"", "text/csv")})
    assert resp.status_code == 400


@pytest.mark.parametrize("industry", ["saas", "retail", "banking"])
def test_unknown_and_known_industries(industry):
    ex = _upload_and_extract()
    ok = client.post("/api/analyze", json=_analysis_request(ex, industry))
    assert ok.status_code == 200
    bad = client.post("/api/analyze", json=_analysis_request(ex, "unknown"))
    assert bad.status_code == 400
