#!/usr/bin/env python3
"""Export the engine's own methodology to apps/web/lib/methodology-data.json.

This is the trust wedge's public face: every ratio formula, risk-model
formula, threshold, and honesty disclosure it emits is either imported
directly from the real modules (RATIO_DEFS, CATEGORY_LABELS, MIN_AVAILABLE,
_NEUTRAL, health_label(), benchmarks.json) or *recovered by calling the
real functions* — never re-typed as a second copy of a number that already
lives in app/services/*.py. Concretely:

  - Altman thresholds/formula strings: read straight off the RatioResult a
    real altman_z() call returns (formula field + regex over its own
    explanation sentence) for representative synthetic Inputs.
  - Piotroski's F-Score interpretation bands (0.75 / 0.45 in
    piotroski._interpretation): recovered by bisecting the real function's
    output over a fine-grained score/max sweep, not copied from source.
  - Beneish's eight M-Score coefficients and intercept: NOT copied from
    beneish_m()'s source. They're solved for algebraically: the model is
    exactly linear in its eight indices, so calling beneish_m() at a
    baseline Inputs and then at one Inputs per index shifted (holding the
    other seven indices provably unchanged, see _beneish_model's per-index
    perturbation comments) yields eight independent finite differences —
    exact slopes, plus the intercept as a residual. Beneish's flag
    thresholds (-1.78 / -2.22) are recovered the same way Piotroski's are:
    bisecting the real beneish._flag() function.
  - Confidence weights (0.30 completeness / 0.30 extraction / 0.20 ratio
    coverage / +8,+7,+5 bonuses): recovered by calling the real
    compute_confidence() with synthetic inputs engineered so exactly one
    term is non-zero at a time, isolating each coefficient.

Run:
    python scripts/export_methodology.py             # writes the JSON
    python scripts/export_methodology.py --dry-run    # prints, doesn't write

Requires only the stdlib plus this repo's own app package.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
API_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = REPO_ROOT / "apps" / "web" / "lib" / "methodology-data.json"

sys.path.insert(0, str(API_ROOT))

from app.schemas import ExtractedValue, RatioResult, health_label  # noqa: E402
from app.services import beneish as beneish_mod  # noqa: E402
from app.services import piotroski as piotroski_mod  # noqa: E402
from app.services.ratios import RATIO_DEFS, CATEGORY_LABELS, Inputs, altman_z  # noqa: E402
from app.services.scoring import compute_confidence, load_benchmarks  # noqa: E402


# ---------------------------------------------------------------------------
# Ratios
# ---------------------------------------------------------------------------

def _ratios() -> list[dict]:
    return [
        {"key": d.key, "name": d.name, "category": d.category,
         "formula": d.formula, "unit": d.unit}
        for d in sorted(RATIO_DEFS, key=lambda d: d.key)
    ]


def _category_labels() -> dict[str, str]:
    return dict(sorted(CATEGORY_LABELS.items()))


def _category_order() -> list[str]:
    # The real dict's own insertion order (liquidity, leverage,
    # profitability, efficiency, cashflow, market) — the same order every
    # industry's category_weights uses in benchmarks.json and the order the
    # results page already renders categories in. Deterministic because
    # CATEGORY_LABELS is a fixed literal in ratios.py, not because it's
    # re-sorted here.
    return list(CATEGORY_LABELS.keys())


# ---------------------------------------------------------------------------
# Altman Z-Score — real formula strings + thresholds, read off real
# RatioResult objects rather than retyped from ratios.py's literals.
# ---------------------------------------------------------------------------

_ALTMAN_THRESH_RE = re.compile(
    r"> ([\d.]+) — безопасная зона, [\d.]+–[\d.]+ — серая зона, < ([\d.]+) — зона риска"
)
_X2_NOTE_RE = re.compile(r"(Компонент X2.*)")


def _altman_inputs(has_mcap: bool, has_re: bool) -> Inputs:
    latest: dict[str, float] = {
        "total_assets": 2000.0,
        "current_assets": 1200.0,
        "current_liabilities": 700.0,
        "operating_income": 300.0,
        "total_liabilities": 900.0,
        "revenue": 1800.0,
        "shareholders_equity": 1100.0,
    }
    if has_mcap:
        latest["market_cap"] = 2500.0
    if has_re:
        latest["retained_earnings"] = 400.0
    return Inputs(latest=latest, previous={})


def _altman() -> dict:
    public = altman_z(_altman_inputs(has_mcap=True, has_re=True), industry="manufacturing")
    private = altman_z(_altman_inputs(has_mcap=False, has_re=True), industry="manufacturing")
    public_no_x2 = altman_z(_altman_inputs(has_mcap=True, has_re=False), industry="manufacturing")
    banking = altman_z(Inputs(latest={}, previous={}), industry="banking")

    def thresholds(explanation: str) -> dict:
        m = _ALTMAN_THRESH_RE.search(explanation)
        assert m, f"could not parse Altman thresholds out of: {explanation!r}"
        return {"good": float(m.group(1)), "grey": float(m.group(2))}

    x2_match = _X2_NOTE_RE.search(public_no_x2.explanation)
    assert x2_match, f"could not parse X2 disclosure out of: {public_no_x2.explanation!r}"

    return {
        "public": {
            "name": public.name,
            "formula": public.formula,
            "thresholds": thresholds(public.explanation),
        },
        "private": {
            "name": private.name,
            "formula": private.formula,
            "thresholds": thresholds(private.explanation),
        },
        "x2_note": x2_match.group(1),
        "banking_note": banking.explanation,
    }


# ---------------------------------------------------------------------------
# Piotroski F-Score — signal key/name pulled from the real signal
# functions (each one sets key/name before it ever checks data
# availability, so calling every signal fn against an empty Inputs still
# yields the real key/name), bands recovered by bisecting the real
# _interpretation() function rather than copying its 0.75/0.45 literals.
# ---------------------------------------------------------------------------

def _piotroski_signals() -> list[dict]:
    empty = Inputs(latest={}, previous={})
    return [
        {"key": s["key"], "name": s["name"]}
        for s in (fn(empty) for fn in piotroski_mod._SIGNAL_FNS)
    ]


_PIOTROSKI_LABEL_RE = re.compile(r"— (высокая|средняя|слабая) фундаментальная")


def _piotroski_bands() -> list[dict]:
    max_score = 1_000_000

    def label_at(score: int) -> str:
        text = piotroski_mod._interpretation(score, max_score)
        m = _PIOTROSKI_LABEL_RE.search(text)
        assert m, f"could not parse Piotroski label out of: {text!r}"
        return m.group(1)

    boundaries: list[tuple[str, str, float]] = []
    prev_label = label_at(0)
    step = 1000
    score = step
    while score <= max_score:
        cur_label = label_at(score)
        if cur_label != prev_label:
            lo, hi = score - step, score
            for _ in range(30):
                mid = (lo + hi) // 2
                if label_at(mid) == prev_label:
                    lo = mid
                else:
                    hi = mid
            boundaries.append((prev_label, cur_label, round(hi / max_score, 4)))
            prev_label = cur_label
        score += step

    assert len(boundaries) == 2, f"expected 2 Piotroski band boundaries, found {boundaries}"
    edges = [0.0, boundaries[0][2], boundaries[1][2], 1.0]
    labels = [boundaries[0][0], boundaries[1][0], boundaries[1][1]]
    return [{"label": labels[i], "min": edges[i], "max": edges[i + 1]} for i in range(3)]


# ---------------------------------------------------------------------------
# Beneish M-Score — the eight coefficients and the intercept are solved
# algebraically off real beneish_m() calls (see module docstring), never
# retyped from beneish.py's literals. Thresholds recovered by bisecting the
# real beneish._flag().
# ---------------------------------------------------------------------------

def _beneish_baseline() -> tuple[dict, dict]:
    latest = {
        "accounts_receivable": 200.0, "revenue": 1000.0, "cost_of_goods_sold": 700.0,
        "current_assets": 400.0, "net_ppe": 600.0, "total_assets": 1500.0,
        "depreciation_amortization": 100.0, "sga_expense": 150.0,
        "current_liabilities": 300.0, "long_term_debt": 400.0,
        "net_income": 100.0, "operating_cash_flow": 110.0,
    }
    previous = {
        "accounts_receivable": 200.0, "revenue": 1000.0, "cost_of_goods_sold": 700.0,
        "current_assets": 400.0, "net_ppe": 600.0, "total_assets": 1500.0,
        "depreciation_amortization": 100.0, "sga_expense": 150.0,
        "current_liabilities": 300.0, "long_term_debt": 400.0,
    }
    return latest, previous


def _beneish_coefficients() -> tuple[dict[str, float], float]:
    base_latest, base_previous = _beneish_baseline()
    base = beneish_mod.beneish_m(Inputs(latest=base_latest, previous=base_previous))
    idx0, m0 = base["indices"], base["m_score"]
    assert m0 is not None, "baseline Beneish Inputs must yield all 8 indices"

    # Each override touches a field exclusive to one index within the
    # Beneish model (verified index-by-index in the module docstring), so
    # every other one of the 8 indices stays bit-identical to idx0 — the
    # assertions below are the actual proof, not just a comment.
    single_field_perturbations = {
        "DSRI": {"accounts_receivable": 300.0},
        "GMI": {"cost_of_goods_sold": 600.0},
        "AQI": {"current_assets": 500.0},
        "DEPI": {"depreciation_amortization": 150.0},
        "SGAI": {"sga_expense": 200.0},
        "LVGI": {"long_term_debt": 500.0},
        "TATA": {"net_income": 200.0},
    }

    coefficients: dict[str, float] = {}
    for key, overrides in single_field_perturbations.items():
        latest = dict(base_latest)
        latest.update(overrides)
        result = beneish_mod.beneish_m(Inputs(latest=latest, previous=base_previous))
        idx_k = result["indices"]
        for other in beneish_mod._INDEX_ORDER:
            if other == key:
                continue
            assert idx_k[other] == idx0[other], (
                f"perturbing {key} leaked into {other}: {idx_k[other]} != {idx0[other]}"
            )
        coefficients[key] = (result["m_score"] - m0) / (idx_k[key] - idx0[key])

    # SGI = rev_t/rev_p is entangled with DSRI/GMI/SGAI through rev_t — the
    # entanglement is neutralized by co-scaling accounts_receivable_t,
    # cost_of_goods_sold_t and sga_expense_t by the same factor as
    # revenue_t, which leaves each of those three ratios unchanged (proven
    # by the assertions below) while SGI itself scales by that factor.
    k = 1.5
    sgi_latest = dict(base_latest)
    sgi_latest["revenue"] = base_latest["revenue"] * k
    sgi_latest["cost_of_goods_sold"] = base_latest["cost_of_goods_sold"] * k
    sgi_latest["accounts_receivable"] = base_latest["accounts_receivable"] * k
    sgi_latest["sga_expense"] = base_latest["sga_expense"] * k
    sgi_result = beneish_mod.beneish_m(Inputs(latest=sgi_latest, previous=base_previous))
    idx_sgi = sgi_result["indices"]
    for other in ("DSRI", "GMI", "AQI", "DEPI", "SGAI", "LVGI", "TATA"):
        assert idx_sgi[other] == idx0[other], (
            f"SGI co-scaling leaked into {other}: {idx_sgi[other]} != {idx0[other]}"
        )
    coefficients["SGI"] = (sgi_result["m_score"] - m0) / (idx_sgi["SGI"] - idx0["SGI"])

    intercept = m0 - sum(coefficients[key] * idx0[key] for key in coefficients)
    _verify_beneish_linearity(coefficients, intercept)
    return coefficients, intercept


def _verify_beneish_linearity(coefficients: dict[str, float], intercept: float) -> None:
    """The coefficient recovery above only proves the two points it sampled
    per index lie on a line — it can't by itself rule out beneish_m()
    having some non-linear term (a cap, a cross-index interaction) that
    those particular sample points happened not to trigger. This holds the
    recovered affine formula to three fresh Inputs combinations that were
    never part of the derivation — each changes several underlying fields
    at once (the third changes the *previous*-period fields, which no
    single-field perturbation above ever touched), landing on index
    combinations off every derivation sample's axis — and asserts the
    formula's prediction matches the real beneish_m() output to float
    precision. If beneish_m() ever stops being a pure affine function of
    its 8 indices, this fails even though the coefficients above might
    still individually look plausible."""
    verification_points = [
        {  # (1) several latest-period fields shifted together
            "latest": {
                "accounts_receivable": 250.0, "revenue": 1100.0, "cost_of_goods_sold": 750.0,
                "current_assets": 420.0, "net_ppe": 580.0, "total_assets": 1600.0,
                "depreciation_amortization": 120.0, "sga_expense": 140.0,
                "current_liabilities": 320.0, "long_term_debt": 380.0,
                "net_income": 90.0, "operating_cash_flow": 130.0,
            },
            "previous": _beneish_baseline()[1],
        },
        {  # (2) a different combination, several fields shifted the other way
            "latest": {
                "accounts_receivable": 150.0, "revenue": 900.0, "cost_of_goods_sold": 650.0,
                "current_assets": 350.0, "net_ppe": 650.0, "total_assets": 1400.0,
                "depreciation_amortization": 90.0, "sga_expense": 170.0,
                "current_liabilities": 280.0, "long_term_debt": 450.0,
                "net_income": 60.0, "operating_cash_flow": 80.0,
            },
            "previous": _beneish_baseline()[1],
        },
        {  # (3) the *previous* period moves instead — no derivation
            # perturbation above ever varies anything but the latest period.
            "latest": _beneish_baseline()[0],
            "previous": {
                "accounts_receivable": 180.0, "revenue": 950.0, "cost_of_goods_sold": 680.0,
                "current_assets": 380.0, "net_ppe": 590.0, "total_assets": 1450.0,
                "depreciation_amortization": 95.0, "sga_expense": 145.0,
                "current_liabilities": 290.0, "long_term_debt": 420.0,
            },
        },
    ]

    for n, point in enumerate(verification_points, start=1):
        result = beneish_mod.beneish_m(Inputs(latest=point["latest"], previous=point["previous"]))
        indices, m_score = result["indices"], result["m_score"]
        assert m_score is not None, f"linearity check point {n}: fewer than 6 of 8 indices available"
        predicted = intercept + sum(coefficients[k] * indices[k] for k in coefficients)
        assert abs(predicted - m_score) < 1e-6, (
            f"linearity check point {n} failed: recovered formula predicts {predicted!r}, "
            f"real beneish_m() returned {m_score!r} — beneish_m() is no longer a pure affine "
            "function of its 8 indices, or the coefficient recovery above is wrong."
        )


def _flag_boundary(lo_val: float, hi_val: float, lo_flag: str, hi_flag: str) -> float:
    """Bisects the real beneish._flag() between two points already known to
    classify as lo_flag / hi_flag, recovering the exact cutoff it uses."""
    assert beneish_mod._flag(lo_val) == lo_flag
    assert beneish_mod._flag(hi_val) == hi_flag
    lo, hi = lo_val, hi_val
    for _ in range(60):
        mid = (lo + hi) / 2
        if beneish_mod._flag(mid) == lo_flag:
            lo = mid
        else:
            hi = mid
    return round(hi, 4)


def _beneish() -> dict:
    coefficients, intercept = _beneish_coefficients()
    formula = "M = " + f"{intercept:.3f}" + "".join(
        f" {'+' if coefficients[k] >= 0 else '-'} {abs(coefficients[k]):.3f}·{k}"
        for k in beneish_mod._INDEX_ORDER
    )

    high_cut = _flag_boundary(-2.0, -1.0, "grey", "high")
    grey_cut = _flag_boundary(-3.0, -2.0, "low", "grey")

    base_latest, base_previous = _beneish_baseline()
    base = beneish_mod.beneish_m(Inputs(latest=base_latest, previous=base_previous))
    example_substituted = beneish_mod._computed_interpretation(
        base["m_score"], base["flag"], ["LVGI"]
    )
    example_insufficient = beneish_mod._insufficient_interpretation(
        available=["DSRI", "GMI", "AQI", "SGI", "DEPI"],
        missing=["SGAI", "LVGI", "TATA"],
    )

    return {
        "indices": [
            {"key": k, "name": beneish_mod._LABELS[k], "coefficient": round(coefficients[k], 3)}
            for k in beneish_mod._INDEX_ORDER
        ],
        "formula": formula,
        "intercept": round(intercept, 3),
        "policy": {
            "min_available": beneish_mod.MIN_AVAILABLE,
            "total_indices": len(beneish_mod._INDEX_ORDER),
            "neutral_substitution": dict(beneish_mod._NEUTRAL),
            "example_substituted_disclosure": example_substituted,
            "example_insufficient_disclosure": example_insufficient,
        },
        "thresholds": {"high": high_cut, "grey": grey_cut},
    }


# ---------------------------------------------------------------------------
# Health-score bands — bisecting the real schemas.health_label() rather than
# retyping its 25/45/65/80 literals.
# ---------------------------------------------------------------------------

def _health_bands() -> dict:
    boundaries: list[tuple[str, str, float]] = []
    prev_label = health_label(0.0)
    step = 0.5
    score = step
    while score <= 100.0:
        cur_label = health_label(score)
        if cur_label != prev_label:
            lo, hi = score - step, score
            for _ in range(40):
                mid = (lo + hi) / 2
                if health_label(mid) == prev_label:
                    lo = mid
                else:
                    hi = mid
            boundaries.append((prev_label, cur_label, round(hi, 2)))
            prev_label = cur_label
        score += step

    assert len(boundaries) == 4, f"expected 4 health-label boundaries, found {boundaries}"
    edges = [0.0] + [b[2] for b in boundaries] + [100.0]
    labels = [boundaries[0][0]] + [b[1] for b in boundaries]
    bands = [{"label": labels[i], "min": edges[i], "max": edges[i + 1]} for i in range(5)]
    return {"bands": bands, "insufficient_data_label": health_label(None)}


# ---------------------------------------------------------------------------
# Confidence formula — weights/bonuses recovered by calling the real
# compute_confidence() with synthetic inputs engineered so exactly one term
# is non-zero, isolating each coefficient as `total / 100` (or the flat
# bonus amount, for the three boolean flags).
# ---------------------------------------------------------------------------

def _confidence() -> dict:
    def total(values, ratios, has_previous=False, industry_ok=False, audited=False) -> float:
        return compute_confidence(
            values=values, ratios=ratios,
            has_previous=has_previous, industry_ok=industry_ok, audited=audited,
        ).total

    from app.services.metrics import CORE_METRICS

    all_core_values = [
        ExtractedValue(metric=m, original_label=m, value=1.0, confidence=0.0)
        for m in sorted(CORE_METRICS)
    ]
    completeness_weight = total(all_core_values, []) / 100.0

    non_core_value = [
        ExtractedValue(metric="__not_core__", original_label="x", value=1.0, confidence=100.0)
    ]
    extraction_weight = total(non_core_value, []) / 100.0

    one_applicable_ratio = [
        RatioResult(key="k", name="n", category="c", formula="f", applicable=True, value=1.0)
    ]
    ratio_coverage_weight = total([], one_applicable_ratio) / 100.0

    has_previous_bonus = total([], [], has_previous=True)
    industry_ok_bonus = total([], [], industry_ok=True)
    audited_bonus = total([], [], audited=True)

    return {
        "weights": {
            "data_completeness": round(completeness_weight, 2),
            "extraction_confidence": round(extraction_weight, 2),
            "ratio_coverage": round(ratio_coverage_weight, 2),
        },
        "bonuses": {
            "has_previous_period": round(has_previous_bonus, 1),
            "has_industry_benchmarks": round(industry_ok_bonus, 1),
            "audited": round(audited_bonus, 1),
        },
    }


# ---------------------------------------------------------------------------
# Benchmarks — sourced/demo split per industry + unique source citations,
# read straight out of app/data/benchmarks.json via load_benchmarks().
# ---------------------------------------------------------------------------

def _benchmarks() -> dict:
    data = load_benchmarks()
    per_industry = []
    sources: dict[tuple, None] = {}
    for ind_id, cfg in sorted(data["industries"].items()):
        ratios = cfg.get("ratios", {})
        sourced = sum(1 for bm in ratios.values() if bm.get("method") != "demo")
        demo = sum(1 for bm in ratios.values() if bm.get("method") == "demo")
        per_industry.append({
            "id": ind_id, "name": cfg["name"],
            "sourced_count": sourced, "demo_count": demo,
        })
        for bm in ratios.values():
            if bm.get("method") != "demo" and bm.get("source"):
                key = (bm["source"], bm.get("as_of", ""), bm.get("source_url", ""))
                sources[key] = None

    return {
        "per_industry": per_industry,
        "sources": [
            {"source": s, "as_of": a, "url": u}
            for (s, a, u) in sorted(sources.keys())
        ],
        "band_method_note": data.get("_disclaimer", ""),
    }


# ---------------------------------------------------------------------------
# Assembly
# ---------------------------------------------------------------------------

def _git_short_sha() -> str:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=REPO_ROOT, capture_output=True, text=True, timeout=5, check=True,
        )
        return out.stdout.strip()
    except Exception:
        return "unknown"


def build_methodology() -> dict:
    return {
        "ratios": _ratios(),
        "category_labels": _category_labels(),
        "category_order": _category_order(),
        "altman": _altman(),
        "piotroski": {"signals": _piotroski_signals(), "bands": _piotroski_bands()},
        "beneish": _beneish(),
        "health_bands": _health_bands(),
        "confidence": _confidence(),
        "benchmarks": _benchmarks(),
        "generated_from": _git_short_sha(),
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                  formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true",
                     help="print the JSON; do not write methodology-data.json")
    ap.add_argument("--output-path", type=Path, default=OUTPUT_PATH)
    args = ap.parse_args()

    doc = build_methodology()
    text = json.dumps(doc, ensure_ascii=False, indent=2, sort_keys=True) + "\n"

    if args.dry_run:
        print(text)
        return 0

    args.output_path.write_text(text, encoding="utf-8")
    print(f"Wrote {args.output_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
