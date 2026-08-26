"""Beneish M-Score: eight-index availability-aware model of accrual and
margin patterns statistically associated with earnings manipulation.

Pure arithmetic over two periods of `Inputs` (see .ratios) -- no language
models. Each of the eight indices is gated independently on the inputs it
needs, matching the convention already used for ordinary ratios and the
Piotroski F-Score: a missing input never turns into zero, the index is
reported as None with the reason implicit in what is unavailable, and the
final score reacts to availability rather than silently guessing.

Expense inputs (cost_of_goods_sold, sga_expense, depreciation_amortization)
arrive already normalized to positive magnitudes upstream (see
EXPENSE_MAGNITUDE_METRICS in metrics.py), so the formulas below use them
directly without re-applying abs().

`beneish_m()` returns a plain dict for now: {m_score, indices, flag,
substituted, interpretation}. A dedicated response schema arrives in a
later task.
"""
from __future__ import annotations

from typing import Optional

from .ratios import Inputs

_NEUTRAL = {
    "DSRI": 1.0, "GMI": 1.0, "AQI": 1.0, "SGI": 1.0,
    "DEPI": 1.0, "SGAI": 1.0, "LVGI": 1.0, "TATA": 0.0,
}

_LABELS = {
    "DSRI": "DSRI (индекс дебиторской задолженности к выручке)",
    "GMI": "GMI (индекс валовой маржи)",
    "AQI": "AQI (индекс качества активов)",
    "SGI": "SGI (индекс роста выручки)",
    "DEPI": "DEPI (индекс нормы амортизации)",
    "SGAI": "SGAI (индекс коммерческих и управленческих расходов)",
    "LVGI": "LVGI (индекс долговой нагрузки)",
    "TATA": "TATA (начисления к активам)",
}

MIN_AVAILABLE = 6


def _dsri(i: Inputs) -> Optional[float]:
    ar_t, rev_t = i.g("accounts_receivable"), i.g("revenue")
    ar_p, rev_p = i.p("accounts_receivable"), i.p("revenue")
    if None in (ar_t, rev_t, ar_p, rev_p):
        return None
    if rev_t == 0 or rev_p == 0:
        return None
    denom = ar_p / rev_p
    if denom == 0:
        return None
    return (ar_t / rev_t) / denom


def _gmi(i: Inputs) -> Optional[float]:
    rev_t, cogs_t = i.g("revenue"), i.g("cost_of_goods_sold")
    rev_p, cogs_p = i.p("revenue"), i.p("cost_of_goods_sold")
    if None in (rev_t, cogs_t, rev_p, cogs_p):
        return None
    if rev_t == 0 or rev_p == 0:
        return None
    gm_t = (rev_t - cogs_t) / rev_t
    gm_p = (rev_p - cogs_p) / rev_p
    if gm_t <= 0:
        return None
    return gm_p / gm_t


def _aqi(i: Inputs) -> Optional[float]:
    ca_t, ppe_t, ta_t = i.g("current_assets"), i.g("net_ppe"), i.g("total_assets")
    ca_p, ppe_p, ta_p = i.p("current_assets"), i.p("net_ppe"), i.p("total_assets")
    if None in (ca_t, ppe_t, ta_t, ca_p, ppe_p, ta_p):
        return None
    if ta_t == 0 or ta_p == 0:
        return None
    q_t = 1 - (ca_t + ppe_t) / ta_t
    q_p = 1 - (ca_p + ppe_p) / ta_p
    if q_t <= 0 or q_p <= 0:
        return None
    return q_t / q_p


def _sgi(i: Inputs) -> Optional[float]:
    rev_t, rev_p = i.g("revenue"), i.p("revenue")
    if rev_t is None or rev_p is None or rev_p == 0:
        return None
    return rev_t / rev_p


def _depi(i: Inputs) -> Optional[float]:
    da_t, ppe_t = i.g("depreciation_amortization"), i.g("net_ppe")
    da_p, ppe_p = i.p("depreciation_amortization"), i.p("net_ppe")
    if None in (da_t, ppe_t, da_p, ppe_p):
        return None
    denom_t = da_t + ppe_t
    denom_p = da_p + ppe_p
    if denom_t == 0 or denom_p == 0:
        return None
    rate_t = da_t / denom_t
    rate_p = da_p / denom_p
    if rate_t == 0:
        return None
    return rate_p / rate_t


def _sgai(i: Inputs) -> Optional[float]:
    sga_t, rev_t = i.g("sga_expense"), i.g("revenue")
    sga_p, rev_p = i.p("sga_expense"), i.p("revenue")
    if None in (sga_t, rev_t, sga_p, rev_p):
        return None
    if rev_t == 0 or rev_p == 0:
        return None
    denom = sga_p / rev_p
    if denom == 0:
        return None
    return (sga_t / rev_t) / denom


def _lvgi(i: Inputs) -> Optional[float]:
    cl_t, ltd_t, ta_t = i.g("current_liabilities"), i.g("long_term_debt"), i.g("total_assets")
    cl_p, ltd_p, ta_p = i.p("current_liabilities"), i.p("long_term_debt"), i.p("total_assets")
    if None in (cl_t, ltd_t, ta_t, cl_p, ltd_p, ta_p):
        return None
    if ta_t == 0 or ta_p == 0:
        return None
    lev_t = (cl_t + ltd_t) / ta_t
    lev_p = (cl_p + ltd_p) / ta_p
    if lev_p == 0:
        return None
    return lev_t / lev_p


def _tata(i: Inputs) -> Optional[float]:
    ni_t, ocf_t, ta_t = i.g("net_income"), i.g("operating_cash_flow"), i.g("total_assets")
    if None in (ni_t, ocf_t, ta_t):
        return None
    if ta_t == 0:
        return None
    return (ni_t - ocf_t) / ta_t


_INDEX_FNS = {
    "DSRI": _dsri, "GMI": _gmi, "AQI": _aqi, "SGI": _sgi,
    "DEPI": _depi, "SGAI": _sgai, "LVGI": _lvgi, "TATA": _tata,
}
_INDEX_ORDER = ["DSRI", "GMI", "AQI", "SGI", "DEPI", "SGAI", "LVGI", "TATA"]


def _flag(m: float) -> str:
    if m > -1.78:
        return "high"
    if m > -2.22:
        return "grey"
    return "low"


def _insufficient_interpretation(available: list[str], missing: list[str]) -> str:
    names = ", ".join(_LABELS[k] for k in missing)
    return (f"M-Score Бениша не рассчитан: доступно {len(available)} из 8 индексов "
            f"(требуется минимум {MIN_AVAILABLE}). Не удалось вычислить: {names}.")


def _computed_interpretation(m: float, flag: str, substituted: list[str]) -> str:
    zone = {
        "high": "статистически ассоциируется с паттернами, характерными для манипуляций с отчётностью",
        "grey": "находится в пограничной зоне — однозначной статистической ассоциации с такими паттернами нет",
        "low": "статистически ассоциируется с низкой вероятностью подобных паттернов в отчётности",
    }[flag]
    text = f"M-Score = {m:.4f}. Значение {zone}."
    if substituted:
        names = ", ".join(_LABELS[k] for k in substituted)
        text += f" Индексы без данных заменены нейтральным значением: {names}."
    return text


def beneish_m(i: Inputs) -> dict:
    indices: dict[str, Optional[float]] = {key: _INDEX_FNS[key](i) for key in _INDEX_ORDER}
    available = [k for k in _INDEX_ORDER if indices[k] is not None]
    missing = [k for k in _INDEX_ORDER if indices[k] is None]

    if len(available) < MIN_AVAILABLE:
        return {
            "m_score": None,
            "indices": indices,
            "flag": None,
            "substituted": [],
            "interpretation": _insufficient_interpretation(available, missing),
        }

    values = {k: (indices[k] if indices[k] is not None else _NEUTRAL[k]) for k in _INDEX_ORDER}
    m = (-4.84
         + 0.920 * values["DSRI"]
         + 0.528 * values["GMI"]
         + 0.404 * values["AQI"]
         + 0.892 * values["SGI"]
         + 0.115 * values["DEPI"]
         - 0.172 * values["SGAI"]
         + 4.679 * values["TATA"]
         - 0.327 * values["LVGI"])
    flag = _flag(m)

    return {
        "m_score": m,
        "indices": indices,
        "flag": flag,
        "substituted": missing,
        "interpretation": _computed_interpretation(m, flag, missing),
    }
