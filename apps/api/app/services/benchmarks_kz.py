"""KZ benchmark overlay lookup (Plan 7 / Task 5).

A second, additive benchmark source — see scripts/build_benchmarks_kz.py
for provenance. This module only answers "is there a citable KZ reference
point for (industry, ratio)?"; it never touches scoring. The global
(Damodaran-derived) band in benchmarks.json keeps deciding every ratio's
traffic-light verdict — apply_benchmarks (scoring.py) attaches whatever
this returns to RatioResult.benchmark_kz purely as display data.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Optional

BENCHMARKS_KZ_PATH = Path(__file__).resolve().parent.parent / "data" / "benchmarks_kz.json"

# The "all" bucket is an economy-wide (non-financial-corporate) aggregate
# that explicitly excludes banks/insurers (see build_benchmarks_kz.py) — it
# must never stand in for a missing entry on a FINANCIAL industry.
#
# Round-1 fix, Finding 9: this used to be a denylist ({"banking"}) — safe
# today only because "banking" happens to be the sole financial industry
# among the app's current ten (see app/data/benchmarks.json's
# `industries` keys). Adding a future financial-sector industry id there
# (insurance, fintech lending, ...) would have silently inherited the
# non-financial aggregate — the exact mistake this exclusion exists to
# prevent, re-armed for the next editor. An ALLOWLIST fails safe instead:
# a brand-new industry id gets no KZ fallback at all (honest silence)
# until someone deliberately adds it here, rather than silently getting
# one it may not deserve.
_ECONOMY_WIDE_KEY = "all"
_ALLOWED_FALLBACK_INDUSTRIES = {
    "saas", "retail", "manufacturing", "healthcare", "energy",
    "realestate", "telecom", "transport", "aerospace_defense",
}


@lru_cache(maxsize=1)
def load_benchmarks_kz() -> dict:
    with open(BENCHMARKS_KZ_PATH, encoding="utf-8") as f:
        return json.load(f)


def get_kz_benchmark(industry_id: str, ratio_key: str) -> Optional[dict]:
    """Returns the raw KZ entry dict ({value, note, source, source_url,
    as_of, method}) for this (industry, ratio), or None when no honest
    citation exists — coverage is deliberately partial, never padded."""
    industries = load_benchmarks_kz().get("industries", {})
    own = industries.get(industry_id, {}).get("ratios", {})
    if ratio_key in own:
        return own[ratio_key]
    if industry_id not in _ALLOWED_FALLBACK_INDUSTRIES:
        return None
    fallback = industries.get(_ECONOMY_WIDE_KEY, {}).get("ratios", {})
    return fallback.get(ratio_key)
