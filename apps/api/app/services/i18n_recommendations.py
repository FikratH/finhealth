"""English recommendations + strengths/risks, recomputed from a localized
analysis's `ratios` list. Split out from i18n.py (P7-style file-size cap —
see extraction_headers.py's own split for the precedent): this table is
the single largest piece of the i18n surface (15 rule categories, each up
to two sides, five text fields per side — genuine financial-register
English prose, not machine translation) and belongs on its own.

Never a translation of the stored `recommendations`/`strengths`/`risks`
arrays — recomputed wholesale from `ratios` (value/unit/status/benchmark/
key/name, present on every analysis old or new), mirroring
recommendations.build_recommendations and scoring.strengths_and_risks'
selection/ordering/truncation logic exactly, one rule category at a time.
"""
from __future__ import annotations

from typing import Optional

_RULES_EN: dict[str, dict] = {
    "current_ratio": {
        "low": dict(
            problem="Current liquidity is below the industry benchmark: current liabilities "
                    "are not adequately covered by current assets.",
            action="Consider reducing short-term debt: refinance part of the short-term debt "
                   "into longer maturities, renegotiate payment schedules with suppliers, "
                   "and free up cash tied up in working capital.",
            effect="A higher Current Ratio and reduced risk of cash-flow gaps.",
            tradeoffs="Refinancing into longer-term debt is usually more expensive; stretching "
                      "out payments to suppliers can worsen purchasing terms.",
            priority="high", difficulty="medium"),
        "high": dict(
            problem="Current liquidity is noticeably above the industry norm — working "
                    "capital may be sitting idle.",
            action="Review the structure of current assets: excess inventory or cash could "
                   "instead be used to pay down debt, invest, or pay dividends.",
            effect="Higher return on capital without losing solvency.",
            tradeoffs="Shrinking the liquidity cushion reduces resilience to demand shocks "
                      "and supply disruptions.",
            priority="low", difficulty="low"),
    },
    "quick_ratio": {
        "low": dict(
            problem="Quick liquidity is below the benchmark: without selling inventory, the "
                    "company may not be able to cover its current liabilities.",
            action="Improve receivables management (shorter payment terms, active collection "
                   "of overdue amounts, factoring) and maintain a larger cash balance.",
            effect="A stronger ability to meet obligations without liquidating inventory.",
            tradeoffs="Tightening payment terms can reduce sales; factoring has a cost.",
            priority="high", difficulty="medium"),
    },
    "ocf_ratio": {
        "low": dict(
            problem="Operating cash flow provides weak coverage of current liabilities.",
            action="Improve cash-flow management: a payment calendar, faster collections, "
                   "and renegotiated terms with suppliers and customers.",
            effect="Reduced reliance on external financing for day-to-day operations.",
            tradeoffs="Speeding up collections may require offering early-payment discounts.",
            priority="medium", difficulty="medium"),
    },
    "debt_to_equity": {
        "high": dict(
            problem="Debt relative to equity is above the industry benchmark.",
            action="Consider gradually paying down debt out of free cash flow, refinancing "
                   "expensive debt, and selling non-core assets; raising new equity capital "
                   "is another option.",
            effect="Lower interest expense and financial risk.",
            tradeoffs="Issuing new shares can lower leverage but dilutes existing "
                      "shareholders; selling assets can reduce future income.",
            priority="high", difficulty="high"),
    },
    "debt_ratio": {
        "high": dict(
            problem="The share of liabilities in total assets is above the industry benchmark.",
            action="Revisit the financing structure: prioritize repaying short-term and "
                   "expensive debt, and limit new borrowing.",
            effect="Improved credit metrics and access to financing.",
            tradeoffs="Limiting borrowing can slow down the investment program.",
            priority="medium", difficulty="medium"),
    },
    "interest_coverage": {
        "low": dict(
            problem="Operating profit provides weak coverage of interest expense.",
            action="Refinance expensive debt at a lower rate and/or work on operating "
                   "margins (reviewing costs, pricing, and product mix).",
            effect="A larger safety margin for servicing debt.",
            tradeoffs="Refinancing may require collateral and covenants; cutting costs can "
                      "affect growth.",
            priority="high", difficulty="high"),
    },
    "net_debt_to_ebitda": {
        "high": dict(
            problem="Net debt to EBITDA is above the industry benchmark — a common trigger "
                    "for bank covenants.",
            action="Direct free cash flow toward reducing net debt; consider cutting capital "
                   "expenditures and revisiting the dividend policy while debt is being "
                   "reduced.",
            effect="A return to a zone comfortable for lenders and lower borrowing costs.",
            tradeoffs="Cutting CapEx and dividends can slow growth and hurt shareholder "
                      "sentiment.",
            priority="high", difficulty="medium"),
    },
    "gross_margin": {
        "low": dict(
            problem="Gross margin is below the industry benchmark.",
            action="Revisit pricing, purchasing terms, and cost structure; analyze margins "
                   "by product and drop persistently loss-making lines.",
            effect="Higher gross profit without needing to grow revenue.",
            tradeoffs="Raising prices can reduce volumes; switching suppliers carries "
                      "operational risk.",
            priority="high", difficulty="medium"),
    },
    "operating_margin": {
        "low": dict(
            problem="Operating margin is below the industry benchmark.",
            action="Review operating expenses (SG&A), automate processes, and analyze "
                   "capacity utilization; improve operating efficiency before resorting to "
                   "across-the-board cuts.",
            effect="Higher operating profit and better interest coverage.",
            tradeoffs="Cost cuts can hurt service quality and staff morale, and automation's "
                      "payoff takes time to materialize.",
            priority="high", difficulty="medium"),
    },
    "net_margin": {
        "low": dict(
            problem="Net margin is below the industry benchmark.",
            action="Beyond operating measures, review financial expenses, the tax burden, "
                   "and one-off items; lower the cost of servicing debt.",
            effect="Higher net profit and ROE.",
            tradeoffs="Some factors (taxes, rates) are largely outside management's control; "
                      "optimization must not create tax risk.",
            priority="medium", difficulty="medium"),
    },
    "roe": {
        "low": dict(
            problem="Return on equity is below the industry benchmark.",
            action="Work all three DuPont levers: margin, asset turnover, and capital "
                   "structure; consider selling non-core, low-return assets.",
            effect="Greater appeal to investors.",
            tradeoffs="Higher leverage raises ROE but also increases financial risk.",
            priority="medium", difficulty="high"),
    },
    "inventory_turnover": {
        "low": dict(
            problem="Inventory turnover is below the industry benchmark — capital is tied "
                    "up in the warehouse.",
            action="Speed up inventory turnover: ABC/XYZ analysis, clearing out slow-moving "
                   "stock, switching to more frequent smaller purchase batches, and demand "
                   "forecasting.",
            effect="Freed-up working capital and lower storage costs.",
            tradeoffs="Lower safety stock increases the risk of shortages if supply is "
                      "disrupted.",
            priority="high", difficulty="medium"),
    },
    "receivables_turnover": {
        "low": dict(
            problem="Receivables turnover is below the benchmark — customers are paying "
                    "slowly.",
            action="Improve receivables management: credit limits, a formal process for "
                   "overdue accounts, early-payment discounts, and factoring if needed.",
            effect="Faster cash collection and lower write-off risk.",
            tradeoffs="A stricter credit policy may deter some customers.",
            priority="medium", difficulty="low"),
    },
    "fcf_margin": {
        "low": dict(
            problem="Free cash flow is weak relative to revenue.",
            action="Cut or defer part of capital spending and prioritize projects by "
                   "return; work on working capital in parallel.",
            effect="Higher free cash flow — a source for paying down debt and returning "
                   "cash to shareholders.",
            tradeoffs="Cutting CapEx today can limit growth and competitiveness tomorrow.",
            priority="medium", difficulty="medium"),
    },
    "cash_conversion": {
        "low": dict(
            problem="Profit is converting poorly into operating cash flow.",
            action="Check the quality of earnings: growth in receivables and inventory, "
                   "revenue recognition; strengthen working-capital management.",
            effect="Profit and actual cash flow moving closer together.",
            tradeoffs="Tightening payment terms can slow revenue growth.",
            priority="medium", difficulty="medium"),
    },
}


def _rng_en(benchmark: Optional[dict], unit: str) -> str:
    """Mirrors recommendations._rng exactly (same >=1e12 / lower-and-<=0
    special cases), English words only."""
    if not benchmark:
        return "no industry data"
    lo, hi = benchmark["good"]
    u = "%" if unit == "%" else ""
    if hi >= 1e12:
        return f"target ≥ {lo:g}{u} (demo range)"
    if benchmark["direction"] == "lower" and lo <= 0:
        return f"target ≤ {hi:g}{u} (demo range)"
    return f"target {lo:g}–{hi:g}{u} (demo range)"


def build_recommendations_en(ratios: list[dict]) -> list[dict]:
    recs: list[dict] = []
    for r in ratios:
        if not r.get("applicable", True) or r.get("value") is None or not r.get("benchmark"):
            continue
        status = r.get("status")
        if status not in ("attention", "critical"):
            continue
        rules = _RULES_EN.get(r.get("key"))
        if not rules:
            continue
        benchmark = r["benchmark"]
        lo, hi = benchmark["good"]
        direction = benchmark["direction"]
        value = r["value"]
        if direction == "higher":
            side = "low" if value < lo else "high"
        elif direction == "lower":
            side = "high" if value > hi else "low"
        else:
            side = "low" if value < lo else "high"
        rule = rules.get(side)
        if not rule:
            continue
        priority = rule["priority"]
        if status == "critical" and priority == "medium":
            priority = "high"
        recs.append({
            "problem": rule["problem"],
            "ratio": r.get("name", r.get("key", "")),
            "current_value": round(value, 2),
            "benchmark_hint": _rng_en(benchmark, r.get("unit", "x")),
            "action": rule["action"],
            "expected_effect": rule["effect"],
            "tradeoffs": rule["tradeoffs"],
            "priority": priority,
            "difficulty": rule["difficulty"],
        })
    order = {"high": 0, "medium": 1, "low": 2}
    recs.sort(key=lambda x: order[x["priority"]])
    return recs[:10]


def strengths_and_risks_en(ratios: list[dict]) -> tuple[list[str], list[str]]:
    """Mirrors scoring.strengths_and_risks' selection/ordering/truncation
    exactly, built directly from structured fields (name/value/unit/
    status/score) rather than truncating the localized `explanation`
    string at a "Verdict:" marker — that would be fragile, silently
    breaking the moment either sentence's wording changes."""
    strengths, risks = [], []
    for r in ratios:
        if not r.get("applicable", True) or r.get("value") is None or not r.get("benchmark"):
            continue
        value = r["value"]
        suffix = "%" if r.get("unit") == "%" else ""
        if r.get("status") == "good" and r.get("score") is not None and r["score"] >= 85:
            strengths.append(f"{r.get('name')}: {value:.2f}{suffix} — within the industry benchmark")
        if r.get("status") == "critical":
            risks.append(f"{r.get('name')}: {value:.2f}{suffix} — outside the industry benchmark.")
    return strengths[:5], risks[:5]
