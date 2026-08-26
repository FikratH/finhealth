"""Analysis orchestrator: user-verified values → ratios → scoring → report."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from ..schemas import (SCALE_MULTIPLIER, AnalysisRequest, AnalysisResult,
                       ExtractedValue, Warning_, health_label)
from . import metrics as M
from .ratios import Inputs, altman_z, compute_all, has_market_data
from .recommendations import build_recommendations
from .scoring import (apply_benchmarks, category_scores, compute_confidence,
                      get_industry, overall_score, strengths_and_risks)


def _to_absolute(values: list[ExtractedValue]) -> dict[str, Optional[float]]:
    out: dict[str, Optional[float]] = {}
    for v in values:
        if v.value is None:
            out.setdefault(v.metric, None)
            continue
        mult = SCALE_MULTIPLIER[v.scale]
        # per-share and per-unit metrics are not scaled
        if v.metric in {"share_price", "eps"}:
            mult = 1
        out[v.metric] = v.value * mult
    return out


def run_analysis(req: AnalysisRequest) -> AnalysisResult:
    industry_cfg = get_industry(req.industry)  # raises KeyError for unknown industry

    # honor the request-level scale as a default for values without one
    for v in req.values + req.previous_values:
        if v.scale is None:
            v.scale = req.scale

    latest = _to_absolute(req.values)
    previous = _to_absolute(req.previous_values)
    inputs = Inputs(latest=latest, previous=previous)

    ratios = compute_all(inputs)
    z = altman_z(inputs, req.industry)
    if z is not None:
        ratios.append(z)
    ratios = apply_benchmarks(ratios, req.industry)

    cats = category_scores(ratios, req.industry)
    score, score_notes = overall_score(cats)

    warnings: list[Warning_] = [Warning_(code="score", message=n) for n in score_notes]
    for r in ratios:
        for w in r.warnings:
            warnings.append(Warning_(code=r.key, message=w))
    if not has_market_data(inputs):
        warnings.append(Warning_(
            code="market",
            message="Рыночные данные отсутствуют — рыночные мультипликаторы (P/E, P/B, EV/EBITDA) не рассчитывались."))
    warnings.append(Warning_(
        code="benchmarks",
        message="Отраслевые диапазоны в текущем прототипе являются демонстрационными "
                "и должны быть заменены на проверенные данные из надёжных отраслевых источников."))

    has_prev = bool(previous)
    confidence = compute_confidence(
        values=req.values, ratios=ratios, has_previous=has_prev,
        industry_ok=True, audited=req.audited)

    strengths, risks = strengths_and_risks(ratios)
    recs = build_recommendations(ratios)
    missing = [M.METRICS[v.metric]["name"] for v in req.values
               if v.value is None and v.metric in M.METRICS]

    return AnalysisResult(
        analysis_id=uuid.uuid4().hex,
        created_at=datetime.now(timezone.utc).isoformat(),
        industry=req.industry,
        industry_name=industry_cfg["name"],
        currency=req.currency,
        scale=req.scale,
        latest_period=req.latest_period,
        previous_period=req.previous_period,
        overall_score=score,
        health_label=health_label(score),
        category_scores=cats,
        ratios=ratios,
        strengths=strengths,
        risks=risks,
        recommendations=recs,
        warnings=warnings,
        confidence=confidence,
        missing_metrics=missing,
    )
