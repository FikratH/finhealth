"""Deterministic financial ratio calculations.

Pure arithmetic only — no language models. Every ratio declares its formula,
the inputs it used and the reasons it could not be computed. Missing inputs
never turn into zeros: the ratio is reported as N/A instead.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional

from ..schemas import RatioResult, RatioStatus


def safe_div(a: Optional[float], b: Optional[float]) -> Optional[float]:
    if a is None or b is None:
        return None
    if b == 0:
        return None
    return a / b


def average(current: Optional[float], previous: Optional[float]) -> Optional[float]:
    if current is None:
        return None
    if previous is None:
        return current
    return (current + previous) / 2


@dataclass
class Inputs:
    """Metric values normalized to absolute units (scale already applied)."""
    latest: dict[str, Optional[float]]
    previous: dict[str, Optional[float]]

    def g(self, key: str) -> Optional[float]:
        return self.latest.get(key)

    def p(self, key: str) -> Optional[float]:
        return self.previous.get(key)

    def avg(self, key: str) -> Optional[float]:
        return average(self.g(key), self.p(key))


@dataclass
class RatioDef:
    key: str
    name: str
    category: str
    formula: str
    unit: str
    compute: Callable[[Inputs], tuple[Optional[float], dict, list[str]]]
    requires_market_data: bool = False


def _mk(value, inputs: dict, warnings: list[str] | None = None):
    return value, inputs, warnings or []


def _current_ratio(i: Inputs):
    ca, cl = i.g("current_assets"), i.g("current_liabilities")
    w = []
    if cl == 0:
        w.append("Краткосрочные обязательства равны нулю — коэффициент не определён.")
    return _mk(safe_div(ca, cl), {"current_assets": ca, "current_liabilities": cl}, w)


def _quick_ratio(i: Inputs):
    cash, sti, ar, cl = i.g("cash"), i.g("short_term_investments"), i.g("accounts_receivable"), i.g("current_liabilities")
    if cash is None and ar is None:
        return _mk(None, {"cash": cash, "short_term_investments": sti,
                          "accounts_receivable": ar, "current_liabilities": cl})
    numer = (cash or 0) + (sti or 0) + (ar or 0)
    w = []
    if sti is None:
        w.append("Краткосрочные фин. вложения не найдены и приняты равными нулю в числителе Quick Ratio.")
    return _mk(safe_div(numer, cl), {"cash": cash, "short_term_investments": sti,
                                     "accounts_receivable": ar, "current_liabilities": cl}, w)


def _cash_ratio(i: Inputs):
    cash, sti, cl = i.g("cash"), i.g("short_term_investments"), i.g("current_liabilities")
    if cash is None:
        return _mk(None, {"cash": cash, "short_term_investments": sti, "current_liabilities": cl})
    return _mk(safe_div((cash or 0) + (sti or 0), cl),
               {"cash": cash, "short_term_investments": sti, "current_liabilities": cl})


def _ocf_ratio(i: Inputs):
    ocf, cl = i.g("operating_cash_flow"), i.g("current_liabilities")
    return _mk(safe_div(ocf, cl), {"operating_cash_flow": ocf, "current_liabilities": cl})


def _debt_to_equity(i: Inputs):
    d, e = i.g("total_debt"), i.g("shareholders_equity")
    w = []
    if e is not None and e < 0:
        w.append("Собственный капитал отрицателен — Debt-to-Equity не интерпретируем, показан как N/A.")
        return _mk(None, {"total_debt": d, "shareholders_equity": e}, w)
    return _mk(safe_div(d, e), {"total_debt": d, "shareholders_equity": e}, w)


def _liab_to_equity(i: Inputs):
    l, e = i.g("total_liabilities"), i.g("shareholders_equity")
    if e is not None and e < 0:
        return _mk(None, {"total_liabilities": l, "shareholders_equity": e},
                   ["Собственный капитал отрицателен — коэффициент не интерпретируем."])
    return _mk(safe_div(l, e), {"total_liabilities": l, "shareholders_equity": e})


def _debt_ratio(i: Inputs):
    l, a = i.g("total_liabilities"), i.g("total_assets")
    return _mk(safe_div(l, a), {"total_liabilities": l, "total_assets": a})


def _interest_coverage(i: Inputs):
    ebit, ie = i.g("operating_income"), i.g("interest_expense")
    w = []
    if ie == 0:
        w.append("Процентные расходы равны нулю — покрытие процентов не рассчитывается.")
    return _mk(safe_div(ebit, abs(ie) if ie else ie),
               {"ebit": ebit, "interest_expense": ie}, w)


def _net_debt(i: Inputs):
    d, c = i.g("total_debt"), i.g("cash")
    if d is None or c is None:
        return _mk(None, {"total_debt": d, "cash": c})
    return _mk(d - c, {"total_debt": d, "cash": c})


def _net_debt_ebitda(i: Inputs):
    d, c, e = i.g("total_debt"), i.g("cash"), i.g("ebitda")
    nd = None if (d is None or c is None) else d - c
    w = []
    if e is not None and e <= 0:
        w.append("EBITDA не положительна — Net Debt / EBITDA не интерпретируем.")
        return _mk(None, {"net_debt": nd, "ebitda": e}, w)
    return _mk(safe_div(nd, e), {"net_debt": nd, "ebitda": e}, w)


def _margin(numer_key: str):
    def f(i: Inputs):
        n, r = i.g(numer_key), i.g("revenue")
        v = safe_div(n, r)
        return _mk(None if v is None else v * 100, {numer_key: n, "revenue": r})
    return f


def _roa(i: Inputs):
    ni = i.g("net_income")
    avg_assets = i.avg("total_assets")
    w = []
    if i.p("total_assets") is None and i.g("total_assets") is not None:
        w.append("Нет данных предыдущего периода: ROA рассчитан по активам на конец периода (точность снижена).")
    v = safe_div(ni, avg_assets)
    return _mk(None if v is None else v * 100,
               {"net_income": ni, "average_total_assets": avg_assets}, w)


def _roe(i: Inputs):
    ni = i.g("net_income")
    e = i.g("shareholders_equity")
    avg_e = i.avg("shareholders_equity")
    w = []
    if e is not None and e < 0:
        return _mk(None, {"net_income": ni, "average_shareholders_equity": avg_e},
                   ["Собственный капитал отрицателен — ROE не интерпретируем."])
    if i.p("shareholders_equity") is None and e is not None:
        w.append("Нет данных предыдущего периода: ROE рассчитан по капиталу на конец периода (точность снижена).")
    v = safe_div(ni, avg_e)
    return _mk(None if v is None else v * 100,
               {"net_income": ni, "average_shareholders_equity": avg_e}, w)


def _asset_turnover(i: Inputs):
    r, a = i.g("revenue"), i.avg("total_assets")
    w = []
    if i.p("total_assets") is None and i.g("total_assets") is not None:
        w.append("Использованы активы на конец периода вместо средних.")
    return _mk(safe_div(r, a), {"revenue": r, "average_total_assets": a}, w)


def _turnover(numer_key: str, denom_key: str, denom_label: str):
    def f(i: Inputs):
        n, d = i.g(numer_key), i.avg(denom_key)
        w = []
        if i.p(denom_key) is None and i.g(denom_key) is not None:
            w.append(f"Использовано значение «{denom_label}» на конец периода вместо среднего.")
        return _mk(safe_div(n, d), {numer_key: n, f"average_{denom_key}": d}, w)
    return f


def _fcf(i: Inputs):
    ocf, capex = i.g("operating_cash_flow"), i.g("capital_expenditures")
    if ocf is None or capex is None:
        return _mk(None, {"operating_cash_flow": ocf, "capital_expenditures": capex})
    return _mk(ocf - abs(capex), {"operating_cash_flow": ocf, "capital_expenditures": capex})


def _fcf_margin(i: Inputs):
    ocf, capex, r = i.g("operating_cash_flow"), i.g("capital_expenditures"), i.g("revenue")
    fcf = None if (ocf is None or capex is None) else ocf - abs(capex)
    v = safe_div(fcf, r)
    return _mk(None if v is None else v * 100, {"free_cash_flow": fcf, "revenue": r})


def _cash_conversion(i: Inputs):
    ocf, ni = i.g("operating_cash_flow"), i.g("net_income")
    w = []
    if ni is not None and ni <= 0:
        w.append("Чистая прибыль не положительна — Cash Conversion не интерпретируем.")
        return _mk(None, {"operating_cash_flow": ocf, "net_income": ni}, w)
    return _mk(safe_div(ocf, ni), {"operating_cash_flow": ocf, "net_income": ni}, w)


def _market_cap(i: Inputs) -> Optional[float]:
    mc = i.g("market_cap")
    if mc is not None:
        return mc
    price, shares = i.g("share_price"), i.g("shares_outstanding")
    if price is not None and shares is not None:
        return price * shares
    return None


def _pe(i: Inputs):
    mc, ni = _market_cap(i), i.g("net_income")
    price, eps = i.g("share_price"), i.g("eps")
    if mc is not None and ni not in (None, 0):
        if ni < 0:
            return _mk(None, {"market_cap": mc, "net_income": ni},
                       ["Чистая прибыль отрицательна — P/E не интерпретируем."])
        return _mk(mc / ni, {"market_cap": mc, "net_income": ni})
    if price is not None and eps not in (None, 0):
        if eps < 0:
            return _mk(None, {"share_price": price, "eps": eps},
                       ["EPS отрицателен — P/E не интерпретируем."])
        return _mk(price / eps, {"share_price": price, "eps": eps})
    return _mk(None, {"market_cap": mc, "net_income": ni, "share_price": price, "eps": eps})


def _pb(i: Inputs):
    mc, e = _market_cap(i), i.g("shareholders_equity")
    if e is not None and e <= 0:
        return _mk(None, {"market_cap": mc, "shareholders_equity": e},
                   ["Собственный капитал не положителен — P/B не интерпретируем."])
    return _mk(safe_div(mc, e), {"market_cap": mc, "shareholders_equity": e})


def _ev(i: Inputs):
    mc, d, c = _market_cap(i), i.g("total_debt"), i.g("cash")
    if mc is None or d is None or c is None:
        return _mk(None, {"market_cap": mc, "total_debt": d, "cash": c})
    return _mk(mc + d - c, {"market_cap": mc, "total_debt": d, "cash": c})


def _ev_ebitda(i: Inputs):
    mc, d, c, e = _market_cap(i), i.g("total_debt"), i.g("cash"), i.g("ebitda")
    ev = None if (mc is None or d is None or c is None) else mc + d - c
    if e is not None and e <= 0:
        return _mk(None, {"enterprise_value": ev, "ebitda": e},
                   ["EBITDA не положительна — EV/EBITDA не интерпретируем."])
    return _mk(safe_div(ev, e), {"enterprise_value": ev, "ebitda": e})


RATIO_DEFS: list[RatioDef] = [
    RatioDef("current_ratio", "Current Ratio", "liquidity",
             "current_assets / current_liabilities", "x", _current_ratio),
    RatioDef("quick_ratio", "Quick Ratio", "liquidity",
             "(cash + short_term_investments + accounts_receivable) / current_liabilities",
             "x", _quick_ratio),
    RatioDef("cash_ratio", "Cash Ratio", "liquidity",
             "(cash + short_term_investments) / current_liabilities", "x", _cash_ratio),
    RatioDef("ocf_ratio", "Operating Cash Flow Ratio", "liquidity",
             "operating_cash_flow / current_liabilities", "x", _ocf_ratio),

    RatioDef("debt_to_equity", "Debt-to-Equity", "leverage",
             "total_debt / shareholders_equity", "x", _debt_to_equity),
    RatioDef("liabilities_to_equity", "Liabilities-to-Equity", "leverage",
             "total_liabilities / shareholders_equity", "x", _liab_to_equity),
    RatioDef("debt_ratio", "Debt Ratio", "leverage",
             "total_liabilities / total_assets", "x", _debt_ratio),
    RatioDef("interest_coverage", "Interest Coverage", "leverage",
             "EBIT / interest_expense", "x", _interest_coverage),
    RatioDef("net_debt", "Net Debt", "leverage",
             "total_debt - cash", "money", _net_debt),
    RatioDef("net_debt_to_ebitda", "Net Debt / EBITDA", "leverage",
             "(total_debt - cash) / EBITDA", "x", _net_debt_ebitda),

    RatioDef("gross_margin", "Gross Margin", "profitability",
             "gross_profit / revenue", "%", _margin("gross_profit")),
    RatioDef("operating_margin", "Operating Margin", "profitability",
             "operating_income / revenue", "%", _margin("operating_income")),
    RatioDef("ebitda_margin", "EBITDA Margin", "profitability",
             "EBITDA / revenue", "%", _margin("ebitda")),
    RatioDef("net_margin", "Net Profit Margin", "profitability",
             "net_income / revenue", "%", _margin("net_income")),
    RatioDef("roa", "Return on Assets", "profitability",
             "net_income / average_total_assets", "%", _roa),
    RatioDef("roe", "Return on Equity", "profitability",
             "net_income / average_shareholders_equity", "%", _roe),

    RatioDef("asset_turnover", "Asset Turnover", "efficiency",
             "revenue / average_total_assets", "x", _asset_turnover),
    RatioDef("inventory_turnover", "Inventory Turnover", "efficiency",
             "cost_of_goods_sold / average_inventory", "x",
             _turnover("cost_of_goods_sold", "inventory", "Запасы")),
    RatioDef("receivables_turnover", "Receivables Turnover", "efficiency",
             "revenue / average_accounts_receivable", "x",
             _turnover("revenue", "accounts_receivable", "Дебиторская задолженность")),
    RatioDef("payables_turnover", "Payables Turnover", "efficiency",
             "cost_of_goods_sold / average_accounts_payable", "x",
             _turnover("cost_of_goods_sold", "accounts_payable", "Кредиторская задолженность")),

    RatioDef("free_cash_flow", "Free Cash Flow", "cashflow",
             "operating_cash_flow - capital_expenditures", "money", _fcf),
    RatioDef("fcf_margin", "FCF Margin", "cashflow",
             "free_cash_flow / revenue", "%", _fcf_margin),
    RatioDef("cash_conversion", "Cash Conversion", "cashflow",
             "operating_cash_flow / net_income", "x", _cash_conversion),

    RatioDef("pe", "P/E Ratio", "market",
             "market_capitalization / net_income", "x", _pe, requires_market_data=True),
    RatioDef("pb", "P/B Ratio", "market",
             "market_capitalization / shareholders_equity", "x", _pb, requires_market_data=True),
    RatioDef("ev", "Enterprise Value", "market",
             "market_capitalization + total_debt - cash", "money", _ev, requires_market_data=True),
    RatioDef("ev_ebitda", "EV/EBITDA", "market",
             "enterprise_value / EBITDA", "x", _ev_ebitda, requires_market_data=True),
]

CATEGORY_LABELS = {
    "liquidity": "Ликвидность",
    "leverage": "Долговая нагрузка",
    "profitability": "Рентабельность",
    "efficiency": "Операционная эффективность",
    "cashflow": "Денежные потоки",
    "market": "Рыночная оценка",
}


def has_market_data(i: Inputs) -> bool:
    return _market_cap(i) is not None or (
        i.g("share_price") is not None and i.g("eps") is not None
    )


def compute_all(i: Inputs) -> list[RatioResult]:
    market = has_market_data(i)
    results: list[RatioResult] = []
    for d in RATIO_DEFS:
        if d.requires_market_data and not market:
            results.append(RatioResult(
                key=d.key, name=d.name, category=d.category, formula=d.formula,
                unit=d.unit, value=None, status=RatioStatus.na, applicable=False,
                explanation="Рыночные данные (капитализация или цена акции) отсутствуют — "
                            "показатель не рассчитывается для непубличной компании.",
            ))
            continue
        value, used_inputs, warnings = d.compute(i)
        sub = ""
        if value is not None:
            parts = " ; ".join(
                f"{k} = {v:,.0f}".replace(",", " ") if isinstance(v, float) and abs(v) >= 1000
                else f"{k} = {v}" for k, v in used_inputs.items())
            sub = f"{d.formula}  →  {parts}"
        results.append(RatioResult(
            key=d.key, name=d.name, category=d.category, formula=d.formula,
            unit=d.unit, inputs=used_inputs, substitution=sub, value=value,
            status=RatioStatus.na, warnings=warnings,
        ))
    return results


# ---------------------------------------------------------------------------
# Altman Z-Score (original model for public manufacturing-type companies;
# Z'' variant would be needed for private/other firms — out of MVP scope).
# Never applied to banks / financial institutions.
# ---------------------------------------------------------------------------
def altman_z(i: Inputs, industry: str) -> Optional[RatioResult]:
    if industry in {"banking"}:
        return RatioResult(
            key="altman_z", name="Altman Z-Score", category="leverage",
            formula="1.2·X1 + 1.4·X2 + 3.3·X3 + 0.6·X4 + 1.0·X5",
            value=None, status=RatioStatus.na, applicable=False,
            explanation="Модель Altman Z-Score не применима к банкам и финансовым "
                        "организациям без отдельной адаптированной модели.",
        )
    ta = i.g("total_assets")
    wc = None
    if i.g("current_assets") is not None and i.g("current_liabilities") is not None:
        wc = i.g("current_assets") - i.g("current_liabilities")
    ebit = i.g("operating_income")
    equity_or_mcap = _market_cap(i) or i.g("shareholders_equity")
    tl = i.g("total_liabilities")
    rev = i.g("revenue")
    ni = i.g("net_income")  # proxy for retained earnings is NOT used — see below
    needed = [ta, wc, ebit, equity_or_mcap, tl, rev]
    if any(v is None for v in needed) or ta == 0 or tl == 0:
        return RatioResult(
            key="altman_z", name="Altman Z-Score", category="leverage",
            formula="1.2·X1 + 1.4·X2 + 3.3·X3 + 0.6·X4 + 1.0·X5",
            value=None, status=RatioStatus.na, applicable=True,
            explanation="Недостаточно данных для расчёта Altman Z-Score "
                        "(нужны оборотный капитал, EBIT, обязательства, выручка, активы).",
        )
    # X2 requires retained earnings which the dictionary does not extract;
    # per "do not invent data" we omit X2 and clearly disclose it.
    z = (1.2 * (wc / ta) + 3.3 * (ebit / ta) + 0.6 * (equity_or_mcap / tl)
         + 1.0 * (rev / ta))
    status = (RatioStatus.good if z > 2.99
              else RatioStatus.attention if z >= 1.81 else RatioStatus.critical)
    _ = ni
    return RatioResult(
        key="altman_z", name="Altman Z-Score (без X2)", category="leverage",
        formula="1.2·(WC/TA) + 3.3·(EBIT/TA) + 0.6·(Equity/TL) + 1.0·(Rev/TA)",
        inputs={"working_capital": wc, "total_assets": ta, "ebit": ebit,
                "equity_or_market_cap": equity_or_mcap, "total_liabilities": tl,
                "revenue": rev},
        value=z, status=status, applicable=True,
        explanation="Компонент X2 (нераспределённая прибыль / активы) исключён, "
                    "так как нераспределённая прибыль не извлекается в MVP; "
                    "значение занижено относительно полной модели. "
                    "Ориентиры полной модели: > 2.99 — безопасная зона, "
                    "1.81–2.99 — серая зона, < 1.81 — зона риска.",
        warnings=["Упрощённый расчёт: без компонента X2."],
    )
