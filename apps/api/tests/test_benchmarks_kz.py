"""Tests for the KZ benchmark overlay (Plan 7 / Task 5).

Two things must hold simultaneously: (1) the overlay is genuinely wired in
and resolves the way benchmarks_kz.py documents (own-industry entries,
"all" fallback for non-banking industries, banking never inherits "all"),
and (2) it is truly additive — every existing verdict (status/score/
explanation) is byte-for-byte identical whether or not a KZ entry exists.
"""
import pytest

from app.services.benchmarks_kz import get_kz_benchmark, load_benchmarks_kz
from app.services.ratios import Inputs, compute_all
from app.services import scoring
from app.services.scoring import apply_benchmarks


def test_kz_benchmarks_file_loads_and_every_entry_is_fully_cited():
    data = load_benchmarks_kz()
    assert set(data["industries"]) == {"all", "banking"}
    total = 0
    for ind_id, cfg in data["industries"].items():
        for rk, bm in cfg["ratios"].items():
            total += 1
            for field in ("value", "source", "source_url", "as_of", "method"):
                assert bm.get(field) not in (None, ""), f"{ind_id}.{rk}.{field}"
    assert total >= 8, "plan's own honesty bar: ship fewer only if truly nothing more is citable"


def test_get_kz_benchmark_resolves_banking_own_entry():
    bm = get_kz_benchmark("banking", "roe")
    assert bm is not None
    assert bm["value"] == pytest.approx(36.84)
    assert "банк" in bm["note"].lower()


def test_get_kz_benchmark_falls_back_to_economy_wide_for_non_banking():
    # manufacturing has no entry of its own — resolves to the "all" bucket,
    # the same real economy-wide figure every other non-banking industry
    # would get.
    manu = get_kz_benchmark("manufacturing", "net_margin")
    saas = get_kz_benchmark("saas", "net_margin")
    assert manu is not None and saas is not None
    assert manu == saas
    assert manu["value"] == pytest.approx(14.98)


def test_banking_never_inherits_the_economy_wide_bucket():
    # "all" is explicitly non-financial-corporate data (excludes banks);
    # banking has no net_margin entry of its own, so this must be None,
    # never silently borrowed from "all".
    assert get_kz_benchmark("banking", "net_margin") is None
    assert get_kz_benchmark("banking", "operating_margin") is None
    assert get_kz_benchmark("banking", "interest_coverage") is None


def test_unknown_ratio_returns_none_coverage_is_partial_not_padded():
    assert get_kz_benchmark("manufacturing", "current_ratio") is None
    assert get_kz_benchmark("manufacturing", "cash_ratio") is None
    assert get_kz_benchmark("saas", "pe") is None


def test_unknown_industry_still_falls_back_to_all():
    assert get_kz_benchmark("not_a_real_industry", "roe") is not None


# --- Additive wiring: verdicts are byte-for-byte unchanged ------------------

def _demo_inputs() -> Inputs:
    return Inputs(
        latest={
            "current_assets": 950000, "current_liabilities": 572000,
            "cash": 185400, "short_term_investments": 0,
            "accounts_receivable": 285000000 / 1000,  # arbitrary, just needs a value
            "total_debt": 540000, "shareholders_equity": 1200000,
            "total_liabilities": 900000, "total_assets": 2456800,
            "revenue": 3245900, "net_income": 356400, "operating_income": 420000,
            "interest_expense": 148200, "ebitda": 500000,
        },
        previous={"total_assets": 2298500, "shareholders_equity": 1100000},
    )


def test_apply_benchmarks_attaches_kz_without_changing_score_status_or_explanation(monkeypatch):
    # Same ratio set, scored twice — once with the real KZ lookup, once
    # with it forced to always return None — must produce identical
    # status/score/explanation for every ratio. Only benchmark_kz differs.
    i = _demo_inputs()

    ratios_with_kz = apply_benchmarks(compute_all(i), "manufacturing")
    with_kz = {r.key: (r.status, r.score, r.explanation) for r in ratios_with_kz}
    had_any_kz = any(r.benchmark_kz is not None for r in ratios_with_kz)
    assert had_any_kz, "fixture should exercise at least one KZ-covered ratio"

    monkeypatch.setattr(scoring, "get_kz_benchmark", lambda *_: None)
    ratios_without_kz = apply_benchmarks(compute_all(i), "manufacturing")
    without_kz = {r.key: (r.status, r.score, r.explanation) for r in ratios_without_kz}
    assert all(r.benchmark_kz is None for r in ratios_without_kz)

    assert with_kz == without_kz


def test_banking_industry_gets_its_own_kz_marks_not_all_bucket():
    i = _demo_inputs()
    ratios = apply_benchmarks(compute_all(i), "banking")
    by_key = {r.key: r for r in ratios}
    assert by_key["roe"].benchmark_kz is not None
    assert by_key["roe"].benchmark_kz.source.endswith("(банки)")
    # net_margin has no banking-specific KZ entry and must not silently
    # inherit the non-financial "all" bucket.
    assert by_key["net_margin"].benchmark_kz is None


def test_ratio_result_schema_defaults_benchmark_kz_to_none():
    from app.schemas import RatioResult
    r = RatioResult(key="x", name="X", category="liquidity", formula="")
    assert r.benchmark_kz is None
