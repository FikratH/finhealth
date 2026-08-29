"""Founder feedback R1: "Although I was in English, the industry is still
in Russian" — GET /api/industries returned RU-only names, so the EN locale
combobox/chips rendered Cyrillic regardless of the visitor's chosen
language. Fixed additively: every industry gains `name_en`/`note_en`
alongside the existing RU `name`/`note` (never replacing them — see
docs/api-contract-v1.md's additive-changes policy), and analyses bake in
`industry_name_en` the same way they already bake in `industry_name`
(app/services/analysis.py, app/routers/my.py) so the results page's and
"Мои анализы" history's industry chips can render EN too.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi.testclient import TestClient

from app import storage
from app.main import app
from app.schemas import AnalysisRequest, ExtractedValue, Scale
from app.services.analysis import run_analysis
from app.services.scoring import list_industries, load_benchmarks

client = TestClient(app)

TEST_SECRET = "test-only-secret-do-not-use-in-prod"


def _val(metric, value, **kw):
    return ExtractedValue(metric=metric, original_label=metric, value=value, **kw)


def _token(sub: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": sub, "iss": "tonus-web", "aud": "tonus-api",
              "iat": now, "exp": now + timedelta(hours=1)}
    return jwt.encode(payload, TEST_SECRET, algorithm="HS256")


def _auth(sub: str) -> dict:
    return {"Authorization": f"Bearer {_token(sub)}"}


# --------------------------- GET /api/industries ---------------------------

def test_industries_endpoint_carries_name_en_and_note_en():
    data = client.get("/api/industries").json()
    by_id = {i["id"]: i for i in data["industries"]}
    assert by_id["manufacturing"]["name"] == "Производство"
    assert by_id["manufacturing"]["name_en"] == "Manufacturing"
    assert by_id["manufacturing"]["note_en"]
    assert by_id["saas"]["name_en"] == "Software and SaaS"


def test_ru_name_and_note_still_present_unchanged():
    """Additive means additive: `name`/`note` (RU) must not regress for any
    caller that only ever read those two fields."""
    data = client.get("/api/industries").json()
    by_id = {i["id"]: i for i in data["industries"]}
    assert by_id["retail"]["name"] == "Розничная торговля и e-commerce"
    assert by_id["banking"]["note"].startswith("Классические Current/Quick")


def test_every_industry_has_a_real_en_translation_not_a_silent_fallback():
    """Guards against a future industry being added to benchmarks.json
    without its EN counterpart — list_industries() would silently fall back
    to the RU string rather than erroring, so this regression test asserts
    every shipped industry today actually has a distinct translation."""
    data = client.get("/api/industries").json()
    for ind in data["industries"]:
        assert ind["name_en"] != ind["name"], ind["id"]
        assert ind["note_en"] != ind["note"], ind["id"]


# ------------------- GET /api/industries/{id}/benchmarks -------------------

def test_benchmarks_endpoint_includes_name_en():
    resp = client.get("/api/industries/saas/benchmarks")
    assert resp.status_code == 200, resp.text
    assert resp.json()["name_en"] == "Software and SaaS"


# ------------------------------ scoring unit --------------------------------

def test_list_industries_falls_back_to_ru_when_translation_missing(monkeypatch):
    """Direct unit test of the fallback branch in scoring.list_industries()
    — an industry entry missing name_en/note_en degrades to the RU value
    rather than raising or rendering blank."""
    load_benchmarks.cache_clear()
    fake = {"industries": {"untranslated": {"name": "Тест", "note": "Заметка"}}}
    monkeypatch.setattr("app.services.scoring.load_benchmarks", lambda: fake)
    try:
        result = list_industries()
    finally:
        load_benchmarks.cache_clear()
    assert result == [{"id": "untranslated", "name": "Тест", "name_en": "Тест",
                       "note": "Заметка", "note_en": "Заметка"}]


# --------------------------- run_analysis / /api/analyze --------------------

def test_run_analysis_bakes_industry_name_en():
    req = AnalysisRequest(industry="manufacturing", scale=Scale.units,
                          values=[_val("revenue", 100.0)])
    res = run_analysis(req)
    assert res.industry_name == "Производство"
    assert res.industry_name_en == "Manufacturing"


def test_analyze_endpoint_response_includes_industry_name_en():
    req = {
        "industry": "saas", "scale": "units",
        "values": [{"metric": "revenue", "original_label": "revenue", "value": 100.0}],
    }
    resp = client.post("/api/analyze", json=req)
    assert resp.status_code == 200, resp.text
    assert resp.json()["industry_name_en"] == "Software and SaaS"


def test_get_analysis_roundtrip_preserves_industry_name_en():
    req = {
        "industry": "banking", "scale": "units",
        "values": [{"metric": "revenue", "original_label": "revenue", "value": 100.0}],
    }
    created = client.post("/api/analyze", json=req).json()
    fetched = client.get(f"/api/analysis/{created['analysis_id']}").json()
    assert fetched["industry_name_en"] == "Banking and financial services"


# ------------------------------ GET /api/my/analyses -------------------------

def test_my_analyses_projection_carries_industry_name_en(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    storage.save_analysis("new-style", "2026-08-29T00:00:00Z", {
        "analysis_id": "new-style", "industry_name": "Производство",
        "industry_name_en": "Manufacturing", "overall_score": 70.0,
        "health_label": "Хорошее состояние",
    }, user_id="user-en")

    resp = client.get("/api/my/analyses", headers=_auth("user-en"))
    assert resp.status_code == 200, resp.text
    row = resp.json()["analyses"][0]
    assert row["industry_name_en"] == "Manufacturing"


def test_my_analyses_projection_falls_back_for_pre_existing_rows(monkeypatch):
    """A row saved before industry_name_en existed has no such key in its
    stored payload at all — the projection must still return a usable
    string (the RU name) rather than an empty chip."""
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    storage.save_analysis("old-style", "2026-08-01T00:00:00Z", {
        "analysis_id": "old-style", "industry_name": "Розница",
        "overall_score": 50.0, "health_label": "Удовлетворительное состояние",
    }, user_id="user-old")

    resp = client.get("/api/my/analyses", headers=_auth("user-old"))
    assert resp.status_code == 200, resp.text
    row = resp.json()["analyses"][0]
    assert row["industry_name_en"] == "Розница"
