"""Industry-aware scoring: ratio status, category scores, overall score,
analysis confidence. Missing data is excluded and weights are renormalized —
a missing metric is never scored as zero.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Optional

from ..schemas import (CategoryScore, ConfidenceBreakdown, IndustryBenchmark,
                       RatioResult, RatioStatus)
from .ratios import CATEGORY_LABELS

BENCHMARKS_PATH = Path(__file__).resolve().parent.parent / "data" / "benchmarks.json"


@lru_cache(maxsize=1)
def load_benchmarks() -> dict:
    with open(BENCHMARKS_PATH, encoding="utf-8") as f:
        return json.load(f)


def list_industries() -> list[dict]:
    data = load_benchmarks()["industries"]
    return [{"id": k, "name": v["name"], "note": v.get("note", "")}
            for k, v in data.items()]


def get_industry(industry_id: str) -> dict:
    data = load_benchmarks()["industries"]
    if industry_id not in data:
        raise KeyError(industry_id)
    return data[industry_id]


def _score_against_benchmark(value: float, bm: dict) -> tuple[float, RatioStatus]:
    """Map a ratio value to 0..100 and a traffic-light status."""
    g_lo, g_hi = bm["good"]
    a_lo, a_hi = bm["acceptable"]
    direction = bm["direction"]

    def clamp(x, lo=0.0, hi=100.0):
        return max(lo, min(hi, x))

    if direction == "higher":
        if value >= g_lo:
            # inside/above good: 85..100, capped
            span = max(g_hi - g_lo, 1e-9)
            return clamp(85 + 15 * min((value - g_lo) / span, 1.0)), RatioStatus.good
        if value >= a_lo:
            span = max(g_lo - a_lo, 1e-9)
            return clamp(55 + 30 * (value - a_lo) / span), RatioStatus.attention
        # below acceptable
        if a_lo == 0:
            return 20.0, RatioStatus.critical
        return clamp(50 * max(value, 0) / a_lo, 0, 50), RatioStatus.critical
    if direction == "lower":
        if value <= g_hi:
            return 95.0, RatioStatus.good
        if value <= a_hi:
            span = max(a_hi - g_hi, 1e-9)
            return clamp(55 + 30 * (a_hi - value) / span), RatioStatus.attention
        overshoot = (value - a_hi) / max(abs(a_hi), 1e-9)
        return clamp(40 - 40 * min(overshoot, 1.0), 0, 40), RatioStatus.critical
    # range: optimum is inside [g_lo, g_hi]
    if g_lo <= value <= g_hi:
        return 92.0, RatioStatus.good
    if a_lo <= value <= a_hi:
        if value < g_lo:
            span = max(g_lo - a_lo, 1e-9)
            return 55 + 30 * (value - a_lo) / span, RatioStatus.attention
        span = max(a_hi - g_hi, 1e-9)
        return 55 + 30 * (a_hi - value) / span, RatioStatus.attention
    return 25.0, RatioStatus.critical


def apply_benchmarks(ratios: list[RatioResult], industry_id: str) -> list[RatioResult]:
    cfg = get_industry(industry_id)
    excluded = set(cfg.get("excluded_ratios", []))
    bm_map: dict = cfg.get("ratios", {})
    unit_fmt = {"x": "", "%": "%", "money": ""}
    for r in ratios:
        if r.key in excluded:
            r.applicable = False
            r.status = RatioStatus.na
            r.explanation = (r.explanation or
                             f"Показатель исключён для отрасли «{cfg['name']}»: "
                             f"{cfg.get('note', 'не характерен для бизнес-модели отрасли.')}")
            continue
        bm = bm_map.get(r.key)
        if bm:
            r.benchmark = IndustryBenchmark(
                ratio=r.key, weight=bm["weight"], direction=bm["direction"],
                good=bm["good"], acceptable=bm["acceptable"], note=bm.get("note", ""))
        if r.value is None:
            r.status = RatioStatus.na
            if not r.explanation:
                missing = [k for k, v in r.inputs.items() if v is None]
                r.explanation = ("Недостаточно данных: не найдены значения "
                                 + ", ".join(missing) + "." if missing else
                                 "Недостаточно данных для расчёта.")
            continue
        if bm is None or r.key == "net_debt" or r.key == "ev" or r.unit == "money":
            # informational values (money amounts) are not scored
            r.status = RatioStatus.na if r.key in {"net_debt", "ev", "free_cash_flow"} and False else r.status
            if r.key in {"net_debt", "ev"}:
                r.status = RatioStatus.na
                r.explanation = "Справочная величина, не участвует в балльной оценке."
                continue
        if bm is None:
            if r.key != "altman_z":
                r.status = RatioStatus.na
            continue
        score, status = _score_against_benchmark(r.value, bm)
        r.score = round(score, 1)
        r.status = status
        u = unit_fmt.get(r.unit, "")
        lo, hi = bm["good"]
        rng = (f"≥ {lo:g}{u}" if hi >= 1e12 else
               f"≤ {hi:g}{u}" if lo <= -1e10 or (bm["direction"] == "lower" and lo == 0)
               else f"{lo:g}–{hi:g}{u}")
        verdict = {"good": "в пределах отраслевого ориентира",
                   "attention": "вне желательного диапазона — требует внимания",
                   "critical": "существенно вне отраслевого ориентира"}[status.value]
        r.explanation = (f"Значение {r.value:.2f}{u}. Демонстрационный отраслевой "
                         f"диапазон: {rng}. Вывод: {verdict}."
                         + (f" {bm.get('note')}" if bm.get("note") else ""))
    return ratios


def category_scores(ratios: list[RatioResult], industry_id: str) -> list[CategoryScore]:
    cfg = get_industry(industry_id)
    weights: dict[str, float] = dict(cfg["category_weights"])
    out: list[CategoryScore] = []
    for cat, base_weight in weights.items():
        scored = [r for r in ratios
                  if r.category == cat and r.applicable and r.score is not None
                  and r.benchmark is not None]
        if not scored or base_weight == 0:
            out.append(CategoryScore(category=cat, label=CATEGORY_LABELS[cat],
                                     score=None, weight=base_weight, ratios_used=0))
            continue
        wsum = sum(r.benchmark.weight for r in scored)
        val = sum(r.score * r.benchmark.weight for r in scored) / wsum
        out.append(CategoryScore(category=cat, label=CATEGORY_LABELS[cat],
                                 score=round(val, 1), weight=base_weight,
                                 ratios_used=len(scored)))
    return out


def overall_score(cats: list[CategoryScore]) -> tuple[float, list[str]]:
    """Weighted average over available categories with weight renormalization."""
    available = [c for c in cats if c.score is not None and c.weight > 0]
    notes: list[str] = []
    if not available:
        return 0.0, ["Недостаточно данных ни для одной категории оценки."]
    total_w = sum(c.weight for c in available)
    score = sum(c.score * c.weight for c in available) / total_w
    skipped = [c.label for c in cats if c.score is None and c.weight > 0]
    if skipped:
        notes.append("Категории без данных исключены из расчёта, веса перенормированы: "
                     + ", ".join(skipped) + ".")
    return round(score, 1), notes


def compute_confidence(*, values, ratios: list[RatioResult], has_previous: bool,
                       industry_ok: bool, audited: bool) -> ConfidenceBreakdown:
    present = [v for v in values if v.value is not None]
    completeness = len(present) / max(len(values), 1) * 100
    extraction_conf = (sum(v.confidence for v in present) / len(present)) if present else 0
    manual = sum(1 for v in present if v.manually_edited)
    # manually verified values are treated as fully trusted
    if present:
        extraction_conf = (sum(100 if v.manually_edited else v.confidence
                               for v in present) / len(present))
    computed = [r for r in ratios if r.applicable and r.value is not None]
    applicable = [r for r in ratios if r.applicable]
    ratio_coverage = len(computed) / max(len(applicable), 1) * 100

    total = (0.30 * completeness + 0.30 * extraction_conf + 0.20 * ratio_coverage
             + (8 if has_previous else 0) + (7 if industry_ok else 0)
             + (5 if audited else 0))
    notes = []
    if not has_previous:
        notes.append("Нет сравнительного периода: средние значения заменены конечными, точность ROA/ROE и оборачиваемости снижена.")
    if manual:
        notes.append(f"Вручную проверено/исправлено значений: {manual} — эти значения считаются подтверждёнными.")
    if audited:
        notes.append("В документе обнаружено упоминание аудита отчётности.")
    missing = [v.metric for v in values if v.value is None]
    if missing:
        notes.append("Для повышения точности добавьте: " + ", ".join(missing[:8])
                     + ("…" if len(missing) > 8 else "") + ".")
    return ConfidenceBreakdown(
        total=round(min(total, 100), 1),
        data_completeness=round(completeness, 1),
        extraction_confidence=round(extraction_conf, 1),
        manual_corrections=manual,
        has_previous_period=has_previous,
        has_industry_benchmarks=industry_ok,
        audited=audited,
        notes=notes,
    )


def strengths_and_risks(ratios: list[RatioResult]) -> tuple[list[str], list[str]]:
    strengths, risks = [], []
    for r in ratios:
        if not r.applicable or r.value is None or r.benchmark is None:
            continue
        if r.status == RatioStatus.good and r.score is not None and r.score >= 85:
            strengths.append(f"{r.name}: {r.value:.2f}{'%' if r.unit == '%' else ''} — {r.explanation.split('Вывод:')[0].strip()}")
        if r.status == RatioStatus.critical:
            risks.append(f"{r.name}: {r.value:.2f}{'%' if r.unit == '%' else ''} — вне отраслевого ориентира.")
    return strengths[:5], risks[:5]
