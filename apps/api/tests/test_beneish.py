"""Beneish M-Score: eight-index availability-aware manipulation-risk model.

Policy under test: M is computed only when >= 6 of the 8 indices are
available; the remaining 0-2 missing indices are substituted with their
neutral value (1.0, except TATA which neutralizes to 0.0) and disclosed via
`substituted`. Fewer than 6 available indices -> m_score is None with a
reason. Flag thresholds: M > -1.78 -> "high"; -2.22 < M <= -1.78 -> "grey";
M <= -2.22 -> "low".
"""
from app.services.beneish import _flag, beneish_m
from app.services.ratios import Inputs

INDEX_ORDER = ["DSRI", "GMI", "AQI", "SGI", "DEPI", "SGAI", "LVGI", "TATA"]


# ---------------------------------------------------------------------------
# Fixture (a): full two-period data, all 8 indices computable.
#
# The test recomputes every index and the final M from these same raw
# inputs using the published formula (never a hardcoded M), and asserts
# equality to the service's output within 1e-9.
# ---------------------------------------------------------------------------
FULL_LATEST = {
    "revenue": 3000, "cost_of_goods_sold": 1800, "net_income": 300,
    "total_assets": 2500, "current_assets": 900, "current_liabilities": 500,
    "accounts_receivable": 400, "net_ppe": 1000, "long_term_debt": 600,
    "depreciation_amortization": 120, "sga_expense": 300,
    "operating_cash_flow": 50,
}
FULL_PREVIOUS = {
    "revenue": 2500, "cost_of_goods_sold": 1550, "net_income": 120,
    "total_assets": 2200, "current_assets": 800, "current_liabilities": 450,
    "accounts_receivable": 300, "net_ppe": 900, "long_term_debt": 550,
    "depreciation_amortization": 100, "sga_expense": 275,
    "operating_cash_flow": 130,
}


def _expected_indices(latest, previous):
    """Hand-rolled reimplementation of the eight published formulas,
    independent of the service's internal helpers, so the test does not
    just re-check the implementation against itself for guard logic --
    only the arithmetic is shared by construction (there's only one
    published formula per index)."""
    rev_t, cogs_t, ni_t = latest["revenue"], latest["cost_of_goods_sold"], latest["net_income"]
    ta_t, ca_t, cl_t = latest["total_assets"], latest["current_assets"], latest["current_liabilities"]
    ar_t, ppe_t, ltd_t = latest["accounts_receivable"], latest["net_ppe"], latest["long_term_debt"]
    da_t, sga_t, ocf_t = latest["depreciation_amortization"], latest["sga_expense"], latest["operating_cash_flow"]

    rev_p, cogs_p = previous["revenue"], previous["cost_of_goods_sold"]
    ta_p, ca_p, cl_p = previous["total_assets"], previous["current_assets"], previous["current_liabilities"]
    ar_p, ppe_p, ltd_p = previous["accounts_receivable"], previous["net_ppe"], previous["long_term_debt"]
    da_p, sga_p = previous["depreciation_amortization"], previous["sga_expense"]

    dsri = (ar_t / rev_t) / (ar_p / rev_p)
    gm_t = (rev_t - cogs_t) / rev_t
    gm_p = (rev_p - cogs_p) / rev_p
    gmi = gm_p / gm_t
    q_t = 1 - (ca_t + ppe_t) / ta_t
    q_p = 1 - (ca_p + ppe_p) / ta_p
    aqi = q_t / q_p
    sgi = rev_t / rev_p
    rate_t = da_t / (da_t + ppe_t)
    rate_p = da_p / (da_p + ppe_p)
    depi = rate_p / rate_t
    sgai = (sga_t / rev_t) / (sga_p / rev_p)
    lev_t = (cl_t + ltd_t) / ta_t
    lev_p = (cl_p + ltd_p) / ta_p
    lvgi = lev_t / lev_p
    tata = (ni_t - ocf_t) / ta_t

    return {"DSRI": dsri, "GMI": gmi, "AQI": aqi, "SGI": sgi, "DEPI": depi,
            "SGAI": sgai, "LVGI": lvgi, "TATA": tata}


def _expected_m(indices: dict) -> float:
    return (-4.84
            + 0.920 * indices["DSRI"]
            + 0.528 * indices["GMI"]
            + 0.404 * indices["AQI"]
            + 0.892 * indices["SGI"]
            + 0.115 * indices["DEPI"]
            - 0.172 * indices["SGAI"]
            + 4.679 * indices["TATA"]
            - 0.327 * indices["LVGI"])


def test_full_data_indices_and_m_score_match_published_formula():
    i = Inputs(latest=FULL_LATEST, previous=FULL_PREVIOUS)
    res = beneish_m(i)

    expected_indices = _expected_indices(FULL_LATEST, FULL_PREVIOUS)
    for key in INDEX_ORDER:
        assert res["indices"][key] is not None, key
        assert abs(res["indices"][key] - expected_indices[key]) < 1e-9, key

    expected_m = _expected_m(expected_indices)
    assert res["m_score"] is not None
    assert abs(res["m_score"] - expected_m) < 1e-9

    assert res["substituted"] == []

    # flag correctness, derived from the same expected_m via the published
    # thresholds (independent check, not copy of service internals)
    if expected_m > -1.78:
        expected_flag = "high"
    elif expected_m > -2.22:
        expected_flag = "grey"
    else:
        expected_flag = "low"
    assert res["flag"] == expected_flag
    assert expected_m > -1.78  # fixture is constructed to land in the "high" zone
    assert res["flag"] == "high"


def test_full_data_interpretation_speaks_of_association_not_accusation():
    i = Inputs(latest=FULL_LATEST, previous=FULL_PREVIOUS)
    res = beneish_m(i)
    text = res["interpretation"].lower()
    assert "манипуляц" in text
    # must not read as an accusation of manipulation
    assert "мошенничеств" not in text
    assert "фальсификац" not in text


# ---------------------------------------------------------------------------
# Fixture (b): sparse data -> only 5 of 8 indices computable
# (DSRI, GMI, SGI, SGAI, TATA available; AQI, DEPI, LVGI unavailable because
# current_assets/net_ppe, depreciation_amortization, and
# current_liabilities/long_term_debt are never supplied).
# ---------------------------------------------------------------------------
SPARSE_LATEST = {
    "revenue": 1000, "cost_of_goods_sold": 600, "accounts_receivable": 150,
    "net_income": 80, "operating_cash_flow": 60, "total_assets": 900,
    "sga_expense": 100,
}
SPARSE_PREVIOUS = {
    "revenue": 900, "cost_of_goods_sold": 560, "accounts_receivable": 120,
    "sga_expense": 90,
}


def test_sparse_data_below_six_indices_yields_null_m_score_with_reason():
    i = Inputs(latest=SPARSE_LATEST, previous=SPARSE_PREVIOUS)
    res = beneish_m(i)

    for key in ("DSRI", "GMI", "SGI", "SGAI", "TATA"):
        assert res["indices"][key] is not None, key
    for key in ("AQI", "DEPI", "LVGI"):
        assert res["indices"][key] is None, key

    assert res["m_score"] is None
    assert res["flag"] is None
    assert res["substituted"] == []
    assert "5" in res["interpretation"]  # discloses how many were available
    assert "AQI" in res["interpretation"] or "DEPI" in res["interpretation"] \
        or "LVGI" in res["interpretation"]  # names at least one unavailable index


# ---------------------------------------------------------------------------
# Fixture (d): exactly 6 of 8 available -> the missing 2 are neutrally
# substituted (1.0, TATA 0.0) and disclosed in `substituted`.
# Built from the sparse fixture plus AQI's required fields, still missing
# DEPI and LVGI.
# ---------------------------------------------------------------------------
SIX_LATEST = dict(SPARSE_LATEST, current_assets=400, net_ppe=300)
SIX_PREVIOUS = dict(SPARSE_PREVIOUS, current_assets=350, net_ppe=280, total_assets=800)


def test_exactly_six_available_substitutes_neutral_values_for_the_rest():
    i = Inputs(latest=SIX_LATEST, previous=SIX_PREVIOUS)
    res = beneish_m(i)

    for key in ("DSRI", "GMI", "AQI", "SGI", "SGAI", "TATA"):
        assert res["indices"][key] is not None, key
    for key in ("DEPI", "LVGI"):
        assert res["indices"][key] is None, key

    assert sorted(res["substituted"]) == ["DEPI", "LVGI"]
    assert res["m_score"] is not None

    # Recompute M from the six real indices the service returned (their
    # arithmetic is independently checked against the published formula by
    # the full-data fixture above) plus the required neutral substitutes
    # for the two unavailable ones (1.0 each -- neither is TATA).
    expected_indices = dict(res["indices"])
    expected_indices["DEPI"] = 1.0
    expected_indices["LVGI"] = 1.0
    expected_m = _expected_m(expected_indices)
    assert abs(res["m_score"] - expected_m) < 1e-9


# ---------------------------------------------------------------------------
# Flag boundary tests -- the flag function tested directly with exact
# values, independent of index computation.
# ---------------------------------------------------------------------------
def test_flag_boundaries():
    assert _flag(-1.7799) == "high"
    assert _flag(-1.78) == "grey"       # M > -1.78 is False at exact boundary
    assert _flag(-1.7801) == "grey"
    assert _flag(-2.2199) == "grey"
    assert _flag(-2.22) == "low"        # M <= -2.22 at exact boundary
    assert _flag(-2.2201) == "low"
    assert _flag(0.0) == "high"
    assert _flag(-10.0) == "low"
