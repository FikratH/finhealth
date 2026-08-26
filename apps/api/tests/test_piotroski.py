"""Piotroski F-Score: nine-signal availability-aware scoring.

Every signal is independently gated on the inputs it needs. A signal that
cannot be computed reports value=None and is excluded from both the score
and the max — never zero-filled (see app/services/ratios.py for the same
convention on ordinary ratios).
"""
from app.services.piotroski import piotroski_f
from app.services.ratios import Inputs

SIGNAL_ORDER = [
    "roa_positive", "cfo_positive", "roa_improved", "accruals",
    "leverage_down", "liquidity_up", "no_dilution", "gross_margin_up",
    "turnover_up",
]


def sig(result, key):
    return next(s for s in result["signals"] if s["key"] == key)


# ---------------------------------------------------------------------------
# Fixture (a): full two-period data. Hand-derived signal-by-signal below.
#
# latest (t):  net_income=120   total_assets=1100  operating_cash_flow=90
#              current_assets=350  current_liabilities=250
#              long_term_debt=200  shares_outstanding=5000
#              revenue=3000  cost_of_goods_sold=1900  (no gross_profit given
#              -> must be derived as revenue - cogs = 1100)
# previous (p): net_income=100  total_assets=1000  operating_cash_flow=150
#              current_assets=300  current_liabilities=200
#              long_term_debt=150  shares_outstanding=4800
#              revenue=2500  cost_of_goods_sold=1600  (derived gp = 900)
#
# 1. roa_positive:  avgTA = (1100+1000)/2 = 1050
#                    NI_t/avgTA = 120/1050 = 0.11429 > 0            -> True
# 2. cfo_positive:   OCF_t = 90 > 0                                  -> True
# 3. roa_improved:   NI_t/TA_t = 120/1100 = 0.10909
#                    NI_p/TA_p = 100/1000 = 0.10000
#                    0.10909 > 0.10000                               -> True
# 4. accruals:       OCF_t(90) > NI_t(120)? 90 > 120 is False        -> False
# 5. leverage_down:  LTD_t/TA_t = 200/1100 = 0.18182
#                    LTD_p/TA_p = 150/1000 = 0.15000
#                    0.18182 < 0.15000 is False                      -> False
# 6. liquidity_up:   CR_t = 350/250 = 1.40
#                    CR_p = 300/200 = 1.50
#                    1.40 > 1.50 is False                            -> False
# 7. no_dilution:    shares_t(5000) <= shares_p(4800)? False         -> False
# 8. gross_margin_up: GP_t = 3000-1900 = 1100 -> GM_t = 1100/3000 = 0.36667
#                     GP_p = 2500-1600 = 900  -> GM_p = 900/2500 = 0.36000
#                     0.36667 > 0.36000                              -> True
# 9. turnover_up:    Rev_t/TA_t = 3000/1100 = 2.72727
#                    Rev_p/TA_p = 2500/1000 = 2.50000
#                    2.72727 > 2.50000                               -> True
#
# True signals: 1, 2, 3, 8, 9 -> score = 5, max = 9 (all computable)
# ratio = 5/9 = 0.5556 -> >= 0.45 and < 0.75 -> "средняя"
# ---------------------------------------------------------------------------
FULL_LATEST = {
    "net_income": 120, "total_assets": 1100, "operating_cash_flow": 90,
    "current_assets": 350, "current_liabilities": 250,
    "long_term_debt": 200, "shares_outstanding": 5000,
    "revenue": 3000, "cost_of_goods_sold": 1900,
}
FULL_PREVIOUS = {
    "net_income": 100, "total_assets": 1000, "operating_cash_flow": 150,
    "current_assets": 300, "current_liabilities": 200,
    "long_term_debt": 150, "shares_outstanding": 4800,
    "revenue": 2500, "cost_of_goods_sold": 1600,
}


def test_full_data_signal_by_signal():
    i = Inputs(latest=FULL_LATEST, previous=FULL_PREVIOUS)
    res = piotroski_f(i)

    assert [s["key"] for s in res["signals"]] == SIGNAL_ORDER
    assert len(res["signals"]) == 9

    expected = {
        "roa_positive": True, "cfo_positive": True, "roa_improved": True,
        "accruals": False, "leverage_down": False, "liquidity_up": False,
        "no_dilution": False, "gross_margin_up": True, "turnover_up": True,
    }
    for key, want in expected.items():
        assert sig(res, key)["value"] is want, key

    assert res["score"] == 5
    assert res["max"] == 9
    assert "5/9" in res["interpretation"]
    assert "средняя" in res["interpretation"]
    assert "по" not in res["interpretation"]  # max == 9 -> no disclosure clause


def test_gross_margin_derivation_is_disclosed():
    i = Inputs(latest=FULL_LATEST, previous=FULL_PREVIOUS)
    res = piotroski_f(i)
    detail = sig(res, "gross_margin_up")["detail"].lower()
    assert "себестоим" in detail or "выручка" in detail


# ---------------------------------------------------------------------------
# Fixture (b): previous period entirely missing.
# Only signals needing latest-only data survive:
#   1. roa_positive: avg() falls back to current TA when previous is absent
#      (matches ratios.py convention) -> NI/TA = 50/500 = 0.1 > 0 -> True
#   2. cfo_positive: OCF = 80 > 0 -> True
#   4. accruals: OCF(80) > NI(50) -> True
# All others require i.p(...) values that don't exist -> None.
# score = 3, max = 3.
# ---------------------------------------------------------------------------
def test_missing_previous_period_limits_computable_signals():
    i = Inputs(
        latest={"net_income": 50, "total_assets": 500, "operating_cash_flow": 80},
        previous={},
    )
    res = piotroski_f(i)

    for key in ("roa_positive", "cfo_positive", "accruals"):
        assert sig(res, key)["value"] is True, key

    for key in ("roa_improved", "leverage_down", "liquidity_up",
                "no_dilution", "gross_margin_up", "turnover_up"):
        assert sig(res, key)["value"] is None, key
        assert sig(res, key)["detail"]  # explains what's missing

    assert res["score"] == 3
    assert res["max"] == 3
    assert "(по 3 из 9 доступных сигналов)" in res["interpretation"]


# ---------------------------------------------------------------------------
# Fixture (c): no data at all.
# ---------------------------------------------------------------------------
def test_empty_inputs_yield_zero_score_and_insufficient_data_message():
    i = Inputs(latest={}, previous={})
    res = piotroski_f(i)

    assert len(res["signals"]) == 9
    assert all(s["value"] is None for s in res["signals"])
    assert all(s["detail"] for s in res["signals"])
    assert res["score"] == 0
    assert res["max"] == 0
    assert res["interpretation"] == "Недостаточно данных для F-Score"


# ---------------------------------------------------------------------------
# Fixture (d): shares_outstanding unknown for the latest period only.
# Everything else matches fixture (a); only no_dilution should drop out.
# score stays 5 (no_dilution was False in (a), so removing it from the
# denominator doesn't change the True count); max drops from 9 to 8.
# ---------------------------------------------------------------------------
def test_unknown_shares_excludes_dilution_signal_only():
    latest = dict(FULL_LATEST)
    del latest["shares_outstanding"]
    i = Inputs(latest=latest, previous=FULL_PREVIOUS)
    res = piotroski_f(i)

    dilution = sig(res, "no_dilution")
    assert dilution["value"] is None
    assert dilution["detail"]

    # every other signal computes exactly as in the full-data fixture
    expected = {
        "roa_positive": True, "cfo_positive": True, "roa_improved": True,
        "accruals": False, "leverage_down": False, "liquidity_up": False,
        "gross_margin_up": True, "turnover_up": True,
    }
    for key, want in expected.items():
        assert sig(res, key)["value"] is want, key

    assert res["score"] == 5
    assert res["max"] == 8
    assert "(по 8 из 9 доступных сигналов)" in res["interpretation"]
