"""Tests for the LLM narrative layer (Plan 4 / Task 5). No real network
calls: the openai client is monkeypatched with a fake that records what it
was called with and returns a scripted response."""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import storage
from app.main import app
from app.services import narrative as narrative_service

client = TestClient(app)

VALID_JSON_CONTENT = '{"ru": "Состояние стабильное.", "en": "The state is stable."}'


def _fake_openai(captured_calls, content=VALID_JSON_CONTENT, error=None):
    """Returns a fake replacement for narrative.OpenAI. `captured_calls`
    collects every kwargs dict passed to chat.completions.create(), so
    tests can assert on the exact prompt sent. `error`, if given, is raised
    instead of returning a response (simulates a provider/network failure)."""

    class FakeCompletions:
        def create(self, **kwargs):
            captured_calls.append(kwargs)
            if error is not None:
                raise error
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
            )

    class FakeChat:
        def __init__(self):
            self.completions = FakeCompletions()

    class FakeClient:
        def __init__(self, *args, **kwargs):
            self.chat = FakeChat()

    return FakeClient


def _seed_analysis(analysis_id="an_narrative_test", **overrides):
    payload = {
        "analysis_id": analysis_id,
        "created_at": "2026-08-27T00:00:00+00:00",
        "industry": "manufacturing",
        "industry_name": "Производство",
        "currency": "KZT",
        "scale": "thousands",
        "latest_period": "2024",
        "previous_period": "2023",
        "overall_score": 85.1,
        "health_label": "Сильное состояние",
        "category_scores": [
            {"category": "liquidity", "label": "Ликвидность", "score": 88.8,
             "weight": 0.2, "ratios_used": 4},
        ],
        "ratios": [
            {"key": "current_ratio", "name": "Current Ratio", "category": "liquidity",
             "formula": "current_assets / current_liabilities", "inputs": {},
             "substitution": "", "value": 1.66, "unit": "x", "status": "good",
             "score": 92.0, "benchmark": None, "explanation": "", "applicable": True,
             "warnings": []},
        ],
        "strengths": ["Current Ratio: 1.66"],
        "risks": [],
        "recommendations": [
            {"problem": "Долговая нагрузка выше ориентира.", "ratio": "Debt-to-Equity",
             "current_value": 0.38, "benchmark_hint": "≤ 0.303", "action": "Снизить долг.",
             "expected_effect": "Ниже риск.", "tradeoffs": "Размытие долей.",
             "priority": "high", "difficulty": "high"},
        ],
        "warnings": [],
        "confidence": {"total": 95.3, "data_completeness": 95.0,
                       "extraction_confidence": 95.0, "manual_corrections": 0,
                       "has_previous_period": True, "has_industry_benchmarks": True,
                       "audited": True, "notes": []},
        "missing_metrics": [],
        "risk_radar": {
            "altman": None,
            "piotroski": {"score": 6, "max": 7, "signals": [], "interpretation": "6/7"},
            "beneish": {"m_score": None, "indices": {}, "flag": None,
                       "substituted": [], "interpretation": "не рассчитан"},
            "dupont": {"net_margin": 4.58, "asset_turnover": 1.37,
                      "equity_multiplier": 1.78, "roe": 11.09},
        },
        "source_values": [
            {"metric": "revenue", "original_label": "Выручка", "value": 3245900000.0,
             "currency": "KZT", "scale": "units", "period": "2024",
             "source": "CSV, строка 2", "confidence": 98,
             "snippet": "Выручка от реализации | 3 245 900 | 2 987 400",
             "manually_edited": False},
        ],
        "disclaimer": "Сервис не заменяет профессиональную финансовую консультацию.",
    }
    payload.update(overrides)
    storage.save_analysis(analysis_id, payload["created_at"], payload)
    return payload


def test_404_for_unknown_analysis_id(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    resp = client.post("/api/analysis/does-not-exist/narrative")
    assert resp.status_code == 404


def test_503_when_no_api_key_configured(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    _seed_analysis("an_no_key")
    resp = client.post("/api/analysis/an_no_key/narrative")
    assert resp.status_code == 503
    body = resp.json()["detail"]
    assert body["code"] == "narrative_unavailable"
    assert body["message"]  # RU message present


def test_prompt_contains_contract_and_exact_score_excludes_snippets(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    calls = []
    monkeypatch.setattr(narrative_service, "OpenAI", _fake_openai(calls))
    payload = _seed_analysis("an_prompt_check")

    resp = client.post("/api/analysis/an_prompt_check/narrative")
    assert resp.status_code == 200, resp.text

    assert len(calls) == 1
    messages = calls[0]["messages"]
    system_msg = next(m["content"] for m in messages if m["role"] == "system")
    user_msg = next(m["content"] for m in messages if m["role"] == "user")

    # The binding contract: forbidden to compute, forbidden to contradict,
    # no guarantees/forecasts, disclosure-only AI mention.
    assert "ЗАПРЕЩЕНО" in system_msg
    assert "вычислять" in system_msg
    assert "гарантии" in system_msg or "прогнозы" in system_msg

    # The exact score/status values reach the model verbatim.
    assert str(payload["overall_score"]) in user_msg
    assert payload["health_label"] in user_msg
    assert "current_ratio" in user_msg

    # No raw document text or provenance ever reaches the model.
    assert "snippet" in payload["source_values"][0]  # sanity: fixture has one
    assert "source_values" not in user_msg
    assert "snippet" not in user_msg
    assert "Выручка от реализации" not in user_msg


def test_success_parses_stores_and_returns_narrative(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setenv("OPENAI_MODEL", "gpt-5-mini")
    calls = []
    monkeypatch.setattr(narrative_service, "OpenAI", _fake_openai(calls))
    _seed_analysis("an_success")

    resp = client.post("/api/analysis/an_success/narrative")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["text_ru"] == "Состояние стабильное."
    assert body["text_en"] == "The state is stable."
    assert body["model"] == "gpt-5-mini"
    assert body["generated_at"]

    # Regression: merging narrative into the payload must not drop existing
    # keys — risk_radar (and everything else) survives the round trip.
    got = client.get("/api/analysis/an_success").json()
    assert got["narrative"] == body
    assert got["risk_radar"]["piotroski"]["score"] == 6
    assert got["overall_score"] == 85.1


def test_cached_response_does_not_call_the_llm_again(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    calls = []
    monkeypatch.setattr(narrative_service, "OpenAI", _fake_openai(calls))
    _seed_analysis("an_cached")

    first = client.post("/api/analysis/an_cached/narrative")
    assert first.status_code == 200
    assert len(calls) == 1

    second = client.post("/api/analysis/an_cached/narrative")
    assert second.status_code == 200
    assert second.json() == first.json()
    assert len(calls) == 1  # no additional LLM call


def test_refresh_bypasses_cache(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    calls = []
    monkeypatch.setattr(narrative_service, "OpenAI", _fake_openai(calls))
    _seed_analysis("an_refresh")

    first = client.post("/api/analysis/an_refresh/narrative")
    assert first.status_code == 200
    assert len(calls) == 1

    second = client.post("/api/analysis/an_refresh/narrative?refresh=1")
    assert second.status_code == 200
    assert len(calls) == 2  # regenerated, not served from cache


def test_502_on_provider_error_never_leaks_a_raw_500(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    calls = []
    monkeypatch.setattr(
        narrative_service, "OpenAI", _fake_openai(calls, error=RuntimeError("network down"))
    )
    _seed_analysis("an_provider_error")

    resp = client.post("/api/analysis/an_provider_error/narrative")
    assert resp.status_code == 502
    assert resp.json()["detail"]["code"] == "narrative_failed"


def test_502_on_malformed_llm_response(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    calls = []
    monkeypatch.setattr(narrative_service, "OpenAI", _fake_openai(calls, content="not json"))
    _seed_analysis("an_malformed")

    resp = client.post("/api/analysis/an_malformed/narrative")
    assert resp.status_code == 502
    assert resp.json()["detail"]["code"] == "narrative_failed"
