"""Analysis orchestrator: user-verified values → ratios → scoring → report."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from ..schemas import (SCALE_MULTIPLIER, AnalysisRequest, AnalysisResult,
                       BeneishResult, DuPontResult, ExtractedValue,
                       PiotroskiResult, RiskRadar, Scale, Warning_,
                       health_label)
from . import metrics as M
from .beneish import beneish_m
from .piotroski import piotroski_f
from .ratios import Inputs, altman_z, compute_all, dupont, has_market_data
from .recommendations import build_recommendations
from .scoring import (apply_benchmarks, category_scores, compute_confidence,
                      get_industry, overall_score, strengths_and_risks)

NON_SCALED_METRICS = {"share_price", "eps", "shares_outstanding"}


def _to_absolute(values: list[ExtractedValue]) -> dict[str, Optional[float]]:
    out: dict[str, Optional[float]] = {}
    for v in values:
        if v.value is None:
            out.setdefault(v.metric, None)
            continue
        mult = SCALE_MULTIPLIER[v.scale or Scale.units]
        # per-share and per-unit metrics are not scaled
        if v.metric in NON_SCALED_METRICS:
            mult = 1
        value = abs(v.value) if v.metric in M.EXPENSE_MAGNITUDE_METRICS else v.value
        out[v.metric] = value * mult
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

    piotroski = PiotroskiResult(**piotroski_f(inputs))
    beneish = BeneishResult(**beneish_m(inputs))
    # dupont() only guards avg equity <= 0, while ratios._roe additionally
    # excludes a negative ending equity even when the average is positive —
    # the two can diverge on a company recovering from a negative-equity year.
    dupont_dict = dupont(inputs)
    dupont_result = DuPontResult(**dupont_dict) if dupont_dict is not None else None
    altman_ratio = next((r for r in ratios if r.key == "altman_z"), None)
    risk_radar = RiskRadar(altman=altman_ratio, piotroski=piotroski,
                            beneish=beneish, dupont=dupont_result)

    warnings: list[Warning_] = [Warning_(code="score", message=n) for n in score_notes]
    for r in ratios:
        for w in r.warnings:
            warnings.append(Warning_(code=r.key, message=w))
    if not has_market_data(inputs):
        warnings.append(Warning_(
            code="market",
            message="Рыночные данные отсутствуют — рыночные мультипликаторы (P/E, P/B, EV/EBITDA) не рассчитывались."))
    if beneish.m_score is None:
        warnings.append(Warning_(
            code="beneish",
            message="M-Score Бениша не рассчитан: модели требуются данные за два периода и "
                    "дополнительные метрики (основные средства, амортизация, коммерческие/"
                    "управленческие расходы), которых недостаточно в извлечённых данных."))
    warnings.append(Warning_(
        code="benchmarks",
        message="Часть отраслевых ориентиров основана на данных Damodaran (NYU Stern, "
                "янв. 2026); остальные являются демонстрационными и помечены соответствующим "
                "образом."))

    has_prev = bool(previous)
    confidence = compute_confidence(
        values=req.values, ratios=ratios, has_previous=has_prev,
        industry_ok=bool(industry_cfg.get("ratios")), audited=req.audited)

    strengths, risks = strengths_and_risks(ratios)
    recs = build_recommendations(ratios)
    missing = [M.METRICS[v.metric]["name"] for v in req.values
               if v.value is None and v.metric in M.METRICS]

    return AnalysisResult(
        analysis_id=uuid.uuid4().hex,
        created_at=datetime.now(timezone.utc).isoformat(),
        industry=req.industry,
        industry_name=industry_cfg["name"],
        industry_name_en=industry_cfg.get("name_en", industry_cfg["name"]),
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
        risk_radar=risk_radar,
        # Latest-period values only, post scale-defaulting (the loop above),
        # otherwise verbatim — req.values are already sign-normalized
        # magnitudes from extraction, so no further transform is needed for
        # provenance display.
        source_values=req.values,
    )
