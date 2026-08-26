"""Piotroski F-Score: nine binary fundamental-strength signals.

Pure arithmetic over two periods of `Inputs` (see .ratios) — no language
models. Each of the nine signals is gated independently on the inputs it
needs; a signal whose inputs are missing reports value=None and a `detail`
explaining what was missing. Missing inputs are never zero-filled, and a
None signal is excluded from both the score and the max — matching the
convention already used for ordinary ratios in ratios.py.

`piotroski_f()` returns a plain dict for now: {score, max, signals,
interpretation}. A dedicated response schema arrives in a later task.
"""
from __future__ import annotations

from typing import Callable, Optional

from .ratios import Inputs

_LABELS = {
    "net_income": "чистая прибыль",
    "total_assets": "активы",
    "operating_cash_flow": "операционный денежный поток",
    "long_term_debt": "долгосрочный долг",
    "current_assets": "оборотные активы",
    "current_liabilities": "краткосрочные обязательства",
    "shares_outstanding": "количество акций в обращении",
    "revenue": "выручка",
    "gross_profit": "валовая прибыль",
    "cost_of_goods_sold": "себестоимость",
}


def _fmt(v: float) -> str:
    return f"{v:,.0f}".replace(",", " ")


def _missing(*keys: str) -> str:
    labels = " и ".join(_LABELS.get(k, k) for k in keys)
    return f"Не рассчитано: отсутствуют данные — {labels}."


def _signal(key: str, name: str, value: Optional[bool], detail: str) -> dict:
    return {"key": key, "name": name, "value": value, "detail": detail}


def _s1_roa_positive(i: Inputs) -> dict:
    key, name = "roa_positive", "Положительная рентабельность активов"
    ni, ta_t = i.g("net_income"), i.g("total_assets")
    if ni is None or ta_t is None:
        return _signal(key, name, None, _missing("net_income", "total_assets"))
    avg_ta = i.avg("total_assets")
    if avg_ta == 0:
        return _signal(key, name, None, "Средние активы равны нулю — сигнал не определён.")
    roa = ni / avg_ta
    note = ""
    if i.p("total_assets") is None:
        note = (" Активы предыдущего периода не указаны — использованы активы "
                "текущего периода вместо среднего.")
    detail = f"ROA = {_fmt(ni)} / {_fmt(avg_ta)} = {roa:.4f} ({'> 0' if roa > 0 else '<= 0'}).{note}"
    return _signal(key, name, roa > 0, detail)


def _s2_cfo_positive(i: Inputs) -> dict:
    key, name = "cfo_positive", "Положительный операционный денежный поток"
    ocf = i.g("operating_cash_flow")
    if ocf is None:
        return _signal(key, name, None, _missing("operating_cash_flow"))
    detail = f"OCF = {_fmt(ocf)} ({'> 0' if ocf > 0 else '<= 0'})."
    return _signal(key, name, ocf > 0, detail)


def _s3_roa_improved(i: Inputs) -> dict:
    key, name = "roa_improved", "Рост рентабельности активов"
    ni_t, ta_t, ni_p, ta_p = i.g("net_income"), i.g("total_assets"), i.p("net_income"), i.p("total_assets")
    if None in (ni_t, ta_t, ni_p, ta_p):
        return _signal(key, name, None,
                        _missing("net_income", "total_assets") + " (текущий и/или предыдущий период)")
    if ta_t == 0 or ta_p == 0:
        return _signal(key, name, None, "Активы на конец периода равны нулю — сигнал не определён.")
    roa_t, roa_p = ni_t / ta_t, ni_p / ta_p
    detail = (f"ROA(тек.) = {_fmt(ni_t)}/{_fmt(ta_t)} = {roa_t:.4f}; "
              f"ROA(пред.) = {_fmt(ni_p)}/{_fmt(ta_p)} = {roa_p:.4f}. "
              "Использованы активы на конец периода (не средние).")
    return _signal(key, name, roa_t > roa_p, detail)


def _s4_accruals(i: Inputs) -> dict:
    key, name = "accruals", "Операционный денежный поток превышает чистую прибыль"
    ocf, ni = i.g("operating_cash_flow"), i.g("net_income")
    if ocf is None or ni is None:
        return _signal(key, name, None, _missing("operating_cash_flow", "net_income"))
    detail = f"OCF ({_fmt(ocf)}) {'>' if ocf > ni else '<='} NI ({_fmt(ni)})."
    return _signal(key, name, ocf > ni, detail)


def _s5_leverage_down(i: Inputs) -> dict:
    key, name = "leverage_down", "Снижение долговой нагрузки"
    ltd_t, ta_t, ltd_p, ta_p = i.g("long_term_debt"), i.g("total_assets"), i.p("long_term_debt"), i.p("total_assets")
    if ltd_t is None and ltd_p is None:
        return _signal(key, name, None,
                        "Долгосрочный долг не указан ни за один период — сигнал не рассчитывается "
                        "(значение не приравнивается к нулю).")
    if None in (ltd_t, ta_t, ltd_p, ta_p):
        return _signal(key, name, None,
                        _missing("long_term_debt", "total_assets") + " (текущий и/или предыдущий период)")
    if ta_t == 0 or ta_p == 0:
        return _signal(key, name, None, "Активы равны нулю — сигнал не определён.")
    lev_t, lev_p = ltd_t / ta_t, ltd_p / ta_p
    detail = (f"Долг/активы (тек.) = {_fmt(ltd_t)}/{_fmt(ta_t)} = {lev_t:.4f}; "
              f"долг/активы (пред.) = {_fmt(ltd_p)}/{_fmt(ta_p)} = {lev_p:.4f}.")
    return _signal(key, name, lev_t < lev_p, detail)


def _s6_liquidity_up(i: Inputs) -> dict:
    key, name = "liquidity_up", "Рост текущей ликвидности"
    ca_t, cl_t, ca_p, cl_p = (i.g("current_assets"), i.g("current_liabilities"),
                               i.p("current_assets"), i.p("current_liabilities"))
    if None in (ca_t, cl_t, ca_p, cl_p):
        return _signal(key, name, None,
                        _missing("current_assets", "current_liabilities") + " (текущий и/или предыдущий период)")
    if cl_t == 0 or cl_p == 0:
        return _signal(key, name, None, "Краткосрочные обязательства равны нулю — сигнал не определён.")
    cr_t, cr_p = ca_t / cl_t, ca_p / cl_p
    detail = f"Текущая ликвидность: {cr_t:.4f} (тек. период) vs {cr_p:.4f} (пред. период)."
    return _signal(key, name, cr_t > cr_p, detail)


def _s7_no_dilution(i: Inputs) -> dict:
    key, name = "no_dilution", "Отсутствие размытия акций"
    sh_t, sh_p = i.g("shares_outstanding"), i.p("shares_outstanding")
    if sh_t is None or sh_p is None:
        return _signal(key, name, None,
                        _missing("shares_outstanding") + " (текущий и/или предыдущий период)")
    detail = f"Акции в обращении: {_fmt(sh_t)} (тек.) vs {_fmt(sh_p)} (пред.)."
    return _signal(key, name, sh_t <= sh_p, detail)


def _gross_profit(get: Callable[[str], Optional[float]]) -> tuple[Optional[float], bool]:
    """Returns (gross_profit, was_derived). `get` is i.g or i.p."""
    gp = get("gross_profit")
    if gp is not None:
        return gp, False
    rev, cogs = get("revenue"), get("cost_of_goods_sold")
    if rev is not None and cogs is not None:
        return rev - cogs, True
    return None, False


def _s8_gross_margin_up(i: Inputs) -> dict:
    key, name = "gross_margin_up", "Рост валовой рентабельности"
    rev_t, rev_p = i.g("revenue"), i.p("revenue")
    if rev_t is None or rev_p is None:
        return _signal(key, name, None, _missing("revenue") + " (текущий и/или предыдущий период)")
    if rev_t == 0 or rev_p == 0:
        return _signal(key, name, None, "Выручка равна нулю — сигнал не определён.")
    gp_t, derived_t = _gross_profit(i.g)
    gp_p, derived_p = _gross_profit(i.p)
    if gp_t is None or gp_p is None:
        return _signal(key, name, None,
                        _missing("gross_profit", "cost_of_goods_sold") + " (текущий и/или предыдущий период)")
    gm_t, gm_p = gp_t / rev_t, gp_p / rev_p
    note = ""
    if derived_t or derived_p:
        which = " и ".join(p for p, d in (("текущий", derived_t), ("предыдущий", derived_p)) if d)
        note = (f" Валовая прибыль ({which} период) не указана явно и получена "
                "как выручка − себестоимость.")
    detail = f"Валовая маржа: {gm_t:.4f} (тек.) vs {gm_p:.4f} (пред.).{note}"
    return _signal(key, name, gm_t > gm_p, detail)


def _s9_turnover_up(i: Inputs) -> dict:
    key, name = "turnover_up", "Рост оборачиваемости активов"
    rev_t, ta_t, rev_p, ta_p = i.g("revenue"), i.g("total_assets"), i.p("revenue"), i.p("total_assets")
    if None in (rev_t, ta_t, rev_p, ta_p):
        return _signal(key, name, None,
                        _missing("revenue", "total_assets") + " (текущий и/или предыдущий период)")
    if ta_t == 0 or ta_p == 0:
        return _signal(key, name, None, "Активы равны нулю — сигнал не определён.")
    to_t, to_p = rev_t / ta_t, rev_p / ta_p
    detail = f"Оборачиваемость активов: {to_t:.4f} (тек.) vs {to_p:.4f} (пред.)."
    return _signal(key, name, to_t > to_p, detail)


_SIGNAL_FNS: list[Callable[[Inputs], dict]] = [
    _s1_roa_positive,
    _s2_cfo_positive,
    _s3_roa_improved,
    _s4_accruals,
    _s5_leverage_down,
    _s6_liquidity_up,
    _s7_no_dilution,
    _s8_gross_margin_up,
    _s9_turnover_up,
]


def _interpretation(score: int, max_score: int) -> str:
    if max_score == 0:
        return "Недостаточно данных для F-Score"
    ratio = score / max_score
    if ratio >= 0.75:
        label = "высокая"
    elif ratio >= 0.45:
        label = "средняя"
    else:
        label = "слабая"
    text = f"F-Score {score}/{max_score} — {label} фундаментальная устойчивость"
    if max_score < 9:
        text += f" (по {max_score} из 9 доступных сигналов)"
    return text + "."


def piotroski_f(i: Inputs) -> dict:
    signals = [fn(i) for fn in _SIGNAL_FNS]
    computable = [s for s in signals if s["value"] is not None]
    score = sum(1 for s in computable if s["value"] is True)
    max_score = len(computable)
    return {
        "score": score,
        "max": max_score,
        "signals": signals,
        "interpretation": _interpretation(score, max_score),
    }
