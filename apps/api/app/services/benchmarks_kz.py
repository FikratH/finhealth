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
# must never stand in for a missing "banking" entry. Every other industry
# falls back to it when it has no entry of its own.
_ECONOMY_WIDE_KEY = "all"
_EXCLUDED_FROM_FALLBACK = {"banking"}


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
    if industry_id in _EXCLUDED_FROM_FALLBACK:
        return None
    fallback = industries.get(_ECONOMY_WIDE_KEY, {}).get("ratios", {})
    return fallback.get(ratio_key)
