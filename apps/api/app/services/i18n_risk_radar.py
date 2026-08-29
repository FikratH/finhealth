"""English localization for AnalysisResult.risk_radar (Altman Z-Score,
Piotroski F-Score, Beneish M-Score). Split out from i18n.py (P7-style file
cap discipline — see extraction_headers.py's own split for the precedent)
since the three models' string surfaces are independent of the main ratio/
recommendation/warning localization there.

Same rule as i18n.py: prefer recomputing from structured numeric fields
(BeneishResult.m_score/flag/substituted/indices and PiotroskiResult.score/
max are ALL structured — their interpretation strings are 100% recomputed,
never parsed) over parsing stored RU text. The one place that can't avoid
parsing is PiotroskiSignal.detail: the nine signals' numeric readouts
(ROA, OCF, leverage ratios, ...) are only ever recorded as already-
rendered strings (no raw inputs are stored per-signal), so
`_translate_piotroski_detail` regex-extracts the NUMBERS our own
`piotroski._fmt()` produced and re-emits them, verbatim, inside an English
template — the numbers are relocated, never re-derived or guessed. A
signal whose stored detail doesn't match any known shape (a future
piotroski.py wording change this table hasn't been updated for) falls
back to the original RU detail rather than guessing or crashing.
"""
from __future__ import annotations

import re
from typing import Optional

from . import i18n as I

# ---------------------------------------------------------------------------
# Altman Z-Score
# ---------------------------------------------------------------------------
_ALTMAN_NAME_EN = {
    "Altman Z-Score": "Altman Z-Score",
    "Altman Z (публичная модель)": "Altman Z (public-company model)",
    "Altman Z (публичная модель, без X2)": "Altman Z (public-company model, no X2)",
    "Altman Z′ (частная компания)": "Altman Z′ (private company)",
    "Altman Z′ (частная компания, без X2)": "Altman Z′ (private company, no X2)",
}

_ALTMAN_STATIC_EXPLANATION_EN = {
    "Модель Altman Z-Score не применима к банкам и финансовым "
    "организациям без отдельной адаптированной модели.":
        "The Altman Z-Score model does not apply to banks and financial "
        "institutions without a separately adapted model.",
    "Недостаточно данных для расчёта Altman Z-Score "
    "(нужны оборотный капитал, EBIT, обязательства, выручка, активы).":
        "Insufficient data to compute the Altman Z-Score (working capital, "
        "EBIT, liabilities, revenue, and total assets are required).",
}


def altman_name_en(name: str) -> str:
    return _ALTMAN_NAME_EN.get(name, name)


def build_altman_explanation_en(ratio: dict) -> str:
    """See ratios.altman_z for the RU original this mirrors. `good_cut`/
    `grey_cut`/`has_x2` are all re-derived from fields already on the
    stored ratio (the model-variant `name` and whether `inputs` carries a
    `retained_earnings` key) rather than needing new storage."""
    stored = ratio.get("explanation", "")
    static = _ALTMAN_STATIC_EXPLANATION_EN.get(stored)
    if static is not None:
        return static
    if ratio.get("value") is None:
        return stored  # an unrecognized not-applicable/insufficient shape

    name = ratio.get("name", "")
    has_x2 = "retained_earnings" in (ratio.get("inputs") or {})
    is_private = "′" in name
    good_cut, grey_cut = (2.9, 1.23) if is_private else (2.99, 1.81)
    if has_x2:
        return (f"Model thresholds: > {good_cut} — safe zone, {grey_cut}–{good_cut} — "
                f"grey zone, < {grey_cut} — distress zone. The X2 component (retained "
                f"earnings / total assets) is included in the calculation.")
    return (f"Model thresholds: > {good_cut} — safe zone, {grey_cut}–{good_cut} — "
            f"grey zone, < {grey_cut} — distress zone. The X2 component is excluded "
            f"(retained earnings was not extracted); the value is understated.")


def localize_altman(ratio: dict) -> dict:
    out = dict(ratio)
    out["name"] = altman_name_en(ratio.get("name", ""))
    out["explanation"] = build_altman_explanation_en(ratio)
    out["warnings"] = I.localize_ratio_warnings(ratio.get("warnings") or [])
    return out


# ---------------------------------------------------------------------------
# Piotroski F-Score
# ---------------------------------------------------------------------------
_PIOTROSKI_NAME_EN = {
    "roa_positive": "Positive return on assets",
    "cfo_positive": "Positive operating cash flow",
    "roa_improved": "Return on assets improved",
    "accruals": "Operating cash flow exceeds net income",
    "leverage_down": "Leverage decreased",
    "liquidity_up": "Current ratio improved",
    "no_dilution": "No share dilution",
    "gross_margin_up": "Gross margin improved",
    "turnover_up": "Asset turnover improved",
}

# Every _missing(...) call site in piotroski.py always passes the same
# literal keys, so each of these is a fixed, exact string — a closed
# vocabulary dictionary, not a template with unbounded inputs. Keyed by
# the actual RU strings piotroski.py's own `_missing()`/static text
# produces (mirrored here via `_ru_missing`, not `_missing_en` above,
# which builds the EN *values*, not the RU lookup keys).
_RU_LABEL = {
    "net_income": "чистая прибыль", "total_assets": "активы",
    "operating_cash_flow": "операционный денежный поток",
    "long_term_debt": "долгосрочный долг", "current_assets": "оборотные активы",
    "current_liabilities": "краткосрочные обязательства",
    "shares_outstanding": "количество акций в обращении", "revenue": "выручка",
    "gross_profit": "валовая прибыль", "cost_of_goods_sold": "себестоимость",
}


def _ru_missing(*keys: str) -> str:
    return f"Не рассчитано: отсутствуют данные — {' и '.join(_RU_LABEL[k] for k in keys)}."


PIOTROSKI_STATIC_DETAIL_EN: dict[str, str] = {
    _ru_missing("net_income", "total_assets"):
        "Not computed: missing data — net income and total assets.",
    "Средние активы равны нулю — сигнал не определён.":
        "Average assets are zero — the signal is undefined.",
    _ru_missing("operating_cash_flow"):
        "Not computed: missing data — operating cash flow.",
    _ru_missing("net_income", "total_assets") + " (текущий и/или предыдущий период)":
        "Not computed: missing data — net income and total assets. "
        "(current and/or prior period)",
    "Активы на конец периода равны нулю — сигнал не определён.":
        "Period-end assets are zero — the signal is undefined.",
    _ru_missing("operating_cash_flow", "net_income"):
        "Not computed: missing data — operating cash flow and net income.",
    "Долгосрочный долг не указан ни за один период — сигнал не рассчитывается "
    "(значение не приравнивается к нулю).":
        "Long-term debt was not provided for either period — the signal is not "
        "computed (the value is not assumed to be zero).",
    _ru_missing("long_term_debt", "total_assets") + " (текущий и/или предыдущий период)":
        "Not computed: missing data — long-term debt and total assets. "
        "(current and/or prior period)",
    "Активы равны нулю — сигнал не определён.":
        "Assets are zero — the signal is undefined.",
    _ru_missing("current_assets", "current_liabilities") + " (текущий и/или предыдущий период)":
        "Not computed: missing data — current assets and current liabilities. "
        "(current and/or prior period)",
    "Краткосрочные обязательства равны нулю — сигнал не определён.":
        "Current liabilities are zero — the signal is undefined.",
    _ru_missing("shares_outstanding") + " (текущий и/или предыдущий период)":
        "Not computed: missing data — shares outstanding. (current and/or prior period)",
    _ru_missing("revenue") + " (текущий и/или предыдущий период)":
        "Not computed: missing data — revenue. (current and/or prior period)",
    "Выручка равна нулю — сигнал не определён.":
        "Revenue is zero — the signal is undefined.",
    _ru_missing("gross_profit", "cost_of_goods_sold") + " (текущий и/или предыдущий период)":
        "Not computed: missing data — gross profit and cost of goods sold. "
        "(current and/or prior period)",
    _ru_missing("revenue", "total_assets") + " (текущий и/или предыдущий период)":
        "Not computed: missing data — revenue and total assets. "
        "(current and/or prior period)",
}

_NUM = r"-?\d[\d ]*(?:\.\d+)?"  # piotroski._fmt()'s space-grouped integers
_DEC4 = r"-?\d+\.\d{4}"

_S1_RE = re.compile(
    rf"^ROA = (?P<ni>{_NUM}) / (?P<ta>{_NUM}) = (?P<roa>{_DEC4}) \((?P<cmp>> 0|<= 0)\)\."
    r"(?P<note> Активы предыдущего периода не указаны — использованы активы "
    r"текущего периода вместо среднего\.)?$")
_S2_RE = re.compile(rf"^OCF = (?P<ocf>{_NUM}) \((?P<cmp>> 0|<= 0)\)\.$")
_S3_RE = re.compile(
    rf"^ROA\(тек\.\) = (?P<ni_t>{_NUM})/(?P<ta_t>{_NUM}) = (?P<roa_t>{_DEC4}); "
    rf"ROA\(пред\.\) = (?P<ni_p>{_NUM})/(?P<ta_p>{_NUM}) = (?P<roa_p>{_DEC4})\. "
    r"Использованы активы на конец периода \(не средние\)\.$")
_S4_RE = re.compile(
    rf"^OCF \((?P<ocf>{_NUM})\) (?P<cmp>>|<=) NI \((?P<ni>{_NUM})\)\.$")
_S5_RE = re.compile(
    rf"^Долг/активы \(тек\.\) = (?P<ltd_t>{_NUM})/(?P<ta_t>{_NUM}) = (?P<lev_t>{_DEC4}); "
    rf"долг/активы \(пред\.\) = (?P<ltd_p>{_NUM})/(?P<ta_p>{_NUM}) = (?P<lev_p>{_DEC4})\.$")
_S6_RE = re.compile(
    rf"^Текущая ликвидность: (?P<cr_t>{_DEC4}) \(тек\. период\) vs "
    rf"(?P<cr_p>{_DEC4}) \(пред\. период\)\.$")
_S7_RE = re.compile(
    rf"^Акции в обращении: (?P<sh_t>{_NUM}) \(тек\.\) vs (?P<sh_p>{_NUM}) \(пред\.\)\.$")
_S8_RE = re.compile(
    rf"^Валовая маржа: (?P<gm_t>{_DEC4}) \(тек\.\) vs (?P<gm_p>{_DEC4}) \(пред\.\)\."
    r"(?P<note> Валовая прибыль \((?P<which>текущий и предыдущий|текущий|предыдущий)"
    r" период\) не указана явно и получена как выручка − себестоимость\.)?$")
_S9_RE = re.compile(
    rf"^Оборачиваемость активов: (?P<to_t>{_DEC4}) \(тек\.\) vs "
    rf"(?P<to_p>{_DEC4}) \(пред\.\)\.$")

_WHICH_EN = {"текущий": "current", "предыдущий": "prior",
            "текущий и предыдущий": "current and prior"}
_CMP_EN = {"> 0": "> 0", "<= 0": "<= 0", ">": ">", "<=": "<="}


def _translate_piotroski_detail(key: str, detail: str) -> str:
    """Regex-extracts the numbers `detail` already contains and re-emits
    them inside an English template — see this module's docstring. Any
    detail string that doesn't match a known static or computed shape for
    this signal key falls back to the original RU text unchanged."""
    static = PIOTROSKI_STATIC_DETAIL_EN.get(detail)
    if static is not None:
        return static

    m = _S1_RE.match(detail) if key == "roa_positive" else None
    if m:
        note = (" Prior-period assets were not provided — used current-period "
               "assets instead of the average.") if m.group("note") else ""
        return (f"ROA = {m['ni']} / {m['ta']} = {m['roa']} "
                f"({_CMP_EN[m['cmp']]}).{note}")

    m = _S2_RE.match(detail) if key == "cfo_positive" else None
    if m:
        return f"OCF = {m['ocf']} ({_CMP_EN[m['cmp']]})."

    m = _S3_RE.match(detail) if key == "roa_improved" else None
    if m:
        return (f"ROA(current) = {m['ni_t']}/{m['ta_t']} = {m['roa_t']}; "
                f"ROA(prior) = {m['ni_p']}/{m['ta_p']} = {m['roa_p']}. "
                f"Used period-end assets (not the average).")

    m = _S4_RE.match(detail) if key == "accruals" else None
    if m:
        return f"OCF ({m['ocf']}) {_CMP_EN[m['cmp']]} NI ({m['ni']})."

    m = _S5_RE.match(detail) if key == "leverage_down" else None
    if m:
        return (f"Debt/assets (current) = {m['ltd_t']}/{m['ta_t']} = {m['lev_t']}; "
                f"debt/assets (prior) = {m['ltd_p']}/{m['ta_p']} = {m['lev_p']}.")

    m = _S6_RE.match(detail) if key == "liquidity_up" else None
    if m:
        return (f"Current liquidity: {m['cr_t']} (current period) vs "
                f"{m['cr_p']} (prior period).")

    m = _S7_RE.match(detail) if key == "no_dilution" else None
    if m:
        return f"Shares outstanding: {m['sh_t']} (current) vs {m['sh_p']} (prior)."

    m = _S8_RE.match(detail) if key == "gross_margin_up" else None
    if m:
        note = ""
        if m.group("note"):
            which_en = _WHICH_EN.get(m["which"], m["which"])
            note = (f" Gross profit for the {which_en} period was not stated "
                    f"explicitly and was derived as revenue minus cost of goods sold.")
        return f"Gross margin: {m['gm_t']} (current) vs {m['gm_p']} (prior).{note}"

    m = _S9_RE.match(detail) if key == "turnover_up" else None
    if m:
        return f"Asset turnover: {m['to_t']} (current) vs {m['to_p']} (prior)."

    return detail  # unrecognized shape — RU fallback, never a crash


def _piotroski_interpretation_en(score: int, max_score: int) -> str:
    """Fully recomputed from PiotroskiResult.score/max — mirrors
    piotroski._interpretation exactly, no parsing involved."""
    if max_score == 0:
        return "Insufficient data for the F-Score"
    ratio = score / max_score
    label = "high" if ratio >= 0.75 else "moderate" if ratio >= 0.45 else "weak"
    text = f"F-Score {score}/{max_score} — {label} fundamental strength"
    if max_score < 9:
        text += f" (based on {max_score} of 9 available signals)"
    return text + "."


def localize_piotroski(piotroski: dict) -> dict:
    out = dict(piotroski)
    out["signals"] = [
        {**s, "name": _PIOTROSKI_NAME_EN.get(s.get("key"), s.get("name")),
         "detail": _translate_piotroski_detail(s.get("key", ""), s.get("detail", ""))}
        for s in piotroski.get("signals", [])
    ]
    out["interpretation"] = _piotroski_interpretation_en(
        piotroski.get("score", 0), piotroski.get("max", 0))
    return out


# ---------------------------------------------------------------------------
# Beneish M-Score — fully recomputed from BeneishResult.m_score/flag/
# substituted/indices, all structured fields; no parsing anywhere here.
# ---------------------------------------------------------------------------
_BENEISH_INDEX_ORDER = ["DSRI", "GMI", "AQI", "SGI", "DEPI", "SGAI", "LVGI", "TATA"]
_BENEISH_LABEL_EN = {
    "DSRI": "DSRI (days sales in receivables index)",
    "GMI": "GMI (gross margin index)",
    "AQI": "AQI (asset quality index)",
    "SGI": "SGI (sales growth index)",
    "DEPI": "DEPI (depreciation index)",
    "SGAI": "SGAI (SG&A expense index)",
    "LVGI": "LVGI (leverage index)",
    "TATA": "TATA (total accruals to total assets)",
}
_BENEISH_MIN_AVAILABLE = 6
_BENEISH_ZONE_EN = {
    "high": "is statistically associated with patterns typical of earnings manipulation",
    "grey": "falls in a grey zone — there is no clear statistical association with such patterns",
    "low": "is statistically associated with a low likelihood of such patterns",
}


def _beneish_interpretation_en(beneish: dict) -> str:
    m_score = beneish.get("m_score")
    indices = beneish.get("indices") or {}
    if m_score is None:
        available = [k for k in _BENEISH_INDEX_ORDER if indices.get(k) is not None]
        missing = [k for k in _BENEISH_INDEX_ORDER if indices.get(k) is None]
        # F4 fix: .get(k, k) — an index key this table doesn't recognize
        # (a future beneish.py addition this module hasn't been updated
        # for) must fall back to the raw key, never KeyError the whole
        # EN path into a 500.
        names = ", ".join(_BENEISH_LABEL_EN.get(k, k) for k in missing)
        return (f"The Beneish M-Score was not calculated: {len(available)} of 8 indices "
                f"are available (a minimum of {_BENEISH_MIN_AVAILABLE} is required). "
                f"Could not compute: {names}.")
    flag = beneish.get("flag")
    zone = _BENEISH_ZONE_EN.get(flag, flag)
    text = f"M-Score = {m_score:.4f}. The value {zone}."
    substituted = beneish.get("substituted") or []
    if substituted:
        names = ", ".join(_BENEISH_LABEL_EN.get(k, k) for k in substituted)
        text += f" Indices without data were replaced with a neutral value: {names}."
    return text


def localize_beneish(beneish: dict) -> dict:
    out = dict(beneish)
    out["interpretation"] = _beneish_interpretation_en(beneish)
    return out


# ---------------------------------------------------------------------------
def localize_risk_radar(risk_radar: dict) -> dict:
    out = dict(risk_radar)
    if risk_radar.get("altman"):
        out["altman"] = localize_altman(risk_radar["altman"])
    if risk_radar.get("piotroski"):
        out["piotroski"] = localize_piotroski(risk_radar["piotroski"])
    if risk_radar.get("beneish"):
        out["beneish"] = localize_beneish(risk_radar["beneish"])
    return out
