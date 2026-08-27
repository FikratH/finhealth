"""LLM narrative layer — prose AROUND already-computed numbers, never a
source of numbers itself.

Provider-agnostic (any OpenAI-compatible endpoint via `OPENAI_BASE_URL`),
optional (the app is fully functional without a key — see
`NarrativeUnavailable`), and deterministic-preserving: the prompt contract
below forbids the model from computing, contradicting, or forecasting
anything. `main.py` is the only caller; it turns `NarrativeUnavailable` into
a 503 and any other failure into a 502 — an LLM/provider error must never
surface as a raw 500.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone

from openai import OpenAI

DEFAULT_MODEL = "gpt-5-mini"


class NarrativeUnavailable(Exception):
    """Raised when OPENAI_API_KEY isn't configured. The caller maps this to
    a 503 with a stable RU message; the rest of the product — score,
    ratios, risk radar, recommendations — is entirely unaffected."""


class NarrativeError(Exception):
    """Raised when the provider call fails, or succeeds but the response
    isn't the strict {"ru": ..., "en": ...} JSON the prompt asks for. The
    caller maps this to a 502 rather than letting it propagate raw."""


# The binding prompt contract (RU): explains ALREADY-COMPUTED indicators to
# an SMB owner in plain business Russian, and produces an English version
# of the same text. Forbidden, explicitly: computing new numbers,
# contradicting the given statuses/scores, giving guarantees/forecasts/
# investment advice, or mentioning being an AI beyond the mandatory
# disclosure (which the frontend renders itself — the model doesn't need to
# write it). Numbers referenced must match the given data exactly.
SYSTEM_PROMPT = (
    "Ты — аналитик сервиса «Тонус», который объясняет владельцу малого или "
    "среднего бизнеса на простом деловом русском языке финансовые "
    "показатели, которые УЖЕ РАССЧИТАНЫ финансовым движком заранее и "
    "переданы тебе в виде готовых данных. Тебе СТРОГО ЗАПРЕЩЕНО: "
    "вычислять любые новые числа или изменять переданные значения; "
    "противоречить переданным статусам, оценкам и уровням риска; "
    "давать гарантии, обещания результатов, финансовые прогнозы или "
    "инвестиционные советы; упоминать, что ты являешься ИИ или языковой "
    "моделью. Каждое число, которое ты упоминаешь, должно ТОЧНО "
    "соответствовать переданным данным (округление для читаемости "
    "допустимо, но не меняй порядок величины и не придумывай новые "
    "показатели). Подготовь такой же по смыслу текст на английском языке "
    "для поля \"en\". Ответь СТРОГО в формате JSON вида "
    "{\"ru\": \"...\", \"en\": \"...\"} без каких-либо иных полей, "
    "комментариев или текста вне JSON. Каждый из двух текстов — 2-3 "
    "абзаца: (1) текущее состояние компании, (2) главные риски, "
    "(3) приоритетные действия."
)


def _compact_ratio(ratio: dict) -> dict:
    return {
        "key": ratio.get("key"),
        "name": ratio.get("name"),
        "value": ratio.get("value"),
        "unit": ratio.get("unit"),
        "status": ratio.get("status"),
    }


def _compact_recommendation(rec: dict) -> dict:
    return {
        "problem": rec.get("problem"),
        "action": rec.get("action"),
        "priority": rec.get("priority"),
    }


def _compact_risk_radar(risk_radar: dict | None) -> dict | None:
    if not risk_radar:
        return None
    altman = risk_radar.get("altman")
    piotroski = risk_radar.get("piotroski") or {}
    beneish = risk_radar.get("beneish") or {}
    dupont = risk_radar.get("dupont")
    return {
        "altman": (
            {"value": altman.get("value"), "status": altman.get("status")}
            if altman else None
        ),
        "piotroski": {
            "score": piotroski.get("score"),
            "max": piotroski.get("max"),
            "interpretation": piotroski.get("interpretation"),
        },
        "beneish": {
            "m_score": beneish.get("m_score"),
            "flag": beneish.get("flag"),
            "interpretation": beneish.get("interpretation"),
        },
        "dupont": {"roe": dupont.get("roe")} if dupont else None,
    }


def _build_prompt(analysis: dict) -> tuple[str, str]:
    """Builds (system, user) messages. The user message is a COMPACT JSON
    projection of the analysis — score/statuses/recommendations only. It
    deliberately excludes `source_values`, any `snippet`, and raw document
    text: the model never sees the underlying financial statement, only the
    numbers the engine already computed from it."""
    compact = {
        "overall_score": analysis.get("overall_score"),
        "health_label": analysis.get("health_label"),
        "category_scores": [
            {"category": c.get("category"), "label": c.get("label"), "score": c.get("score")}
            for c in analysis.get("category_scores", [])
        ],
        "ratios": [_compact_ratio(r) for r in analysis.get("ratios", [])],
        "risk_radar": _compact_risk_radar(analysis.get("risk_radar")),
        "recommendations": [
            _compact_recommendation(r) for r in analysis.get("recommendations", [])
        ],
    }
    user = json.dumps(compact, ensure_ascii=False)
    return SYSTEM_PROMPT, user


def _call_llm(system: str, user: str, model: str) -> str:
    base_url = os.environ.get("OPENAI_BASE_URL") or None
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"], base_url=base_url)
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        response_format={"type": "json_object"},
    )
    return response.choices[0].message.content


def generate_narrative(analysis: dict, locale_hint: str = "ru") -> dict:
    """Generates {"text_ru", "text_en", "model", "generated_at"} for an
    already-computed analysis payload. Raises `NarrativeUnavailable` when no
    key is configured, `NarrativeError` on any provider/parse failure —
    `main.py` maps these to 503/502 respectively and never lets either (or
    any other exception from this function) reach the client as a raw 500.
    """
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise NarrativeUnavailable("OPENAI_API_KEY is not configured")

    model = os.environ.get("OPENAI_MODEL") or DEFAULT_MODEL
    system, user = _build_prompt(analysis)

    try:
        raw = _call_llm(system, user, model)
    except Exception as e:  # provider/network error — never propagate raw
        raise NarrativeError(f"LLM call failed: {e}") from e

    try:
        parsed = json.loads(raw)
        text_ru = parsed["ru"]
        text_en = parsed["en"]
        if not isinstance(text_ru, str) or not isinstance(text_en, str):
            raise ValueError("ru/en must be strings")
    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as e:
        raise NarrativeError(f"malformed LLM response: {e}") from e

    return {
        "text_ru": text_ru,
        "text_en": text_en,
        "model": model,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
