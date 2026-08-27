// Deterministic financial ratio calculations — a line-by-line TS mirror of
// apps/api/app/services/ratios.py. Pure arithmetic only, same N/A
// discipline as the Python source: missing inputs never turn into zeros,
// a ratio that cannot be computed reports `null` instead. Every compute
// function below corresponds 1:1 to a `_xxx` function in ratios.py; keep
// them side by side when touching either file.
import type { RatioStatus } from "@/lib/api-types";
import type { ComputedRatio, Inputs, RatioDef } from "./types";

export function safeDiv(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  if (b === 0) return null;
  return a / b;
}

export function average(current: number | null, previous: number | null): number | null {
  if (current === null) return null;
  if (previous === null) return current;
  return (current + previous) / 2;
}

function g(i: Inputs, key: string): number | null {
  return i.latest[key] ?? null;
}
function p(i: Inputs, key: string): number | null {
  return i.previous[key] ?? null;
}
function avg(i: Inputs, key: string): number | null {
  return average(g(i, key), p(i, key));
}

function currentRatio(i: Inputs): number | null {
  return safeDiv(g(i, "current_assets"), g(i, "current_liabilities"));
}

function quickRatio(i: Inputs): number | null {
  const cash = g(i, "cash");
  const sti = g(i, "short_term_investments");
  const ar = g(i, "accounts_receivable");
  const cl = g(i, "current_liabilities");
  if (cash === null && ar === null) return null;
  const numer = (cash ?? 0) + (sti ?? 0) + (ar ?? 0);
  return safeDiv(numer, cl);
}

function cashRatio(i: Inputs): number | null {
  const cash = g(i, "cash");
  if (cash === null) return null;
  const sti = g(i, "short_term_investments");
  const cl = g(i, "current_liabilities");
  return safeDiv((cash ?? 0) + (sti ?? 0), cl);
}

function ocfRatio(i: Inputs): number | null {
  return safeDiv(g(i, "operating_cash_flow"), g(i, "current_liabilities"));
}

function debtToEquity(i: Inputs): number | null {
  const d = g(i, "total_debt");
  const e = g(i, "shareholders_equity");
  if (e !== null && e < 0) return null;
  return safeDiv(d, e);
}

function liabilitiesToEquity(i: Inputs): number | null {
  const l = g(i, "total_liabilities");
  const e = g(i, "shareholders_equity");
  if (e !== null && e < 0) return null;
  return safeDiv(l, e);
}

function debtRatio(i: Inputs): number | null {
  return safeDiv(g(i, "total_liabilities"), g(i, "total_assets"));
}

function interestCoverage(i: Inputs): number | null {
  const ebit = g(i, "operating_income");
  const ie = g(i, "interest_expense");
  // Python: `abs(ie) if ie else ie` — falsy on both `None` and `0`, so the
  // denominator is preserved as-is (null or 0) in those cases. JS number
  // truthiness matches this exactly (0 and null are both falsy).
  const denom = ie ? Math.abs(ie) : ie;
  return safeDiv(ebit, denom);
}

function netDebt(i: Inputs): number | null {
  const d = g(i, "total_debt");
  const c = g(i, "cash");
  if (d === null || c === null) return null;
  return d - c;
}

function netDebtToEbitda(i: Inputs): number | null {
  const d = g(i, "total_debt");
  const c = g(i, "cash");
  const e = g(i, "ebitda");
  const nd = d === null || c === null ? null : d - c;
  if (e !== null && e <= 0) return null;
  return safeDiv(nd, e);
}

function margin(numerKey: string) {
  return (i: Inputs): number | null => {
    const v = safeDiv(g(i, numerKey), g(i, "revenue"));
    return v === null ? null : v * 100;
  };
}

function roa(i: Inputs): number | null {
  const ni = g(i, "net_income");
  const avgAssets = avg(i, "total_assets");
  const v = safeDiv(ni, avgAssets);
  return v === null ? null : v * 100;
}

function roe(i: Inputs): number | null {
  const ni = g(i, "net_income");
  const e = g(i, "shareholders_equity");
  const avgE = avg(i, "shareholders_equity");
  if (e !== null && e < 0) return null;
  if (avgE !== null && avgE <= 0) return null;
  const v = safeDiv(ni, avgE);
  return v === null ? null : v * 100;
}

function assetTurnover(i: Inputs): number | null {
  return safeDiv(g(i, "revenue"), avg(i, "total_assets"));
}

function turnover(numerKey: string, denomKey: string) {
  return (i: Inputs): number | null => safeDiv(g(i, numerKey), avg(i, denomKey));
}

function freeCashFlow(i: Inputs): number | null {
  const ocf = g(i, "operating_cash_flow");
  const capex = g(i, "capital_expenditures");
  if (ocf === null || capex === null) return null;
  return ocf - Math.abs(capex);
}

function fcfMargin(i: Inputs): number | null {
  const ocf = g(i, "operating_cash_flow");
  const capex = g(i, "capital_expenditures");
  const r = g(i, "revenue");
  const fcf = ocf === null || capex === null ? null : ocf - Math.abs(capex);
  const v = safeDiv(fcf, r);
  return v === null ? null : v * 100;
}

function cashConversion(i: Inputs): number | null {
  const ocf = g(i, "operating_cash_flow");
  const ni = g(i, "net_income");
  if (ni !== null && ni <= 0) return null;
  return safeDiv(ocf, ni);
}

function marketCap(i: Inputs): number | null {
  const mc = g(i, "market_cap");
  if (mc !== null) return mc;
  const price = g(i, "share_price");
  const shares = g(i, "shares_outstanding");
  if (price !== null && shares !== null) return price * shares;
  return null;
}

export function hasMarketData(i: Inputs): boolean {
  return marketCap(i) !== null || (g(i, "share_price") !== null && g(i, "eps") !== null);
}

function pe(i: Inputs): number | null {
  const mc = marketCap(i);
  const ni = g(i, "net_income");
  const price = g(i, "share_price");
  const eps = g(i, "eps");
  if (mc !== null && ni !== null && ni !== 0) {
    if (ni < 0) return null;
    return mc / ni;
  }
  if (price !== null && eps !== null && eps !== 0) {
    if (eps < 0) return null;
    return price / eps;
  }
  return null;
}

function pb(i: Inputs): number | null {
  const mc = marketCap(i);
  const e = g(i, "shareholders_equity");
  if (e !== null && e <= 0) return null;
  return safeDiv(mc, e);
}

function ev(i: Inputs): number | null {
  const mc = marketCap(i);
  const d = g(i, "total_debt");
  const c = g(i, "cash");
  if (mc === null || d === null || c === null) return null;
  return mc + d - c;
}

function evEbitda(i: Inputs): number | null {
  const mc = marketCap(i);
  const d = g(i, "total_debt");
  const c = g(i, "cash");
  const e = g(i, "ebitda");
  const evValue = mc === null || d === null || c === null ? null : mc + d - c;
  if (e !== null && e <= 0) return null;
  return safeDiv(evValue, e);
}

export const RATIO_DEFS: readonly RatioDef[] = [
  { key: "current_ratio", category: "liquidity", unit: "x", compute: currentRatio },
  { key: "quick_ratio", category: "liquidity", unit: "x", compute: quickRatio },
  { key: "cash_ratio", category: "liquidity", unit: "x", compute: cashRatio },
  { key: "ocf_ratio", category: "liquidity", unit: "x", compute: ocfRatio },

  { key: "debt_to_equity", category: "leverage", unit: "x", compute: debtToEquity },
  { key: "liabilities_to_equity", category: "leverage", unit: "x", compute: liabilitiesToEquity },
  { key: "debt_ratio", category: "leverage", unit: "x", compute: debtRatio },
  { key: "interest_coverage", category: "leverage", unit: "x", compute: interestCoverage },
  { key: "net_debt", category: "leverage", unit: "money", compute: netDebt },
  { key: "net_debt_to_ebitda", category: "leverage", unit: "x", compute: netDebtToEbitda },

  { key: "gross_margin", category: "profitability", unit: "%", compute: margin("gross_profit") },
  { key: "operating_margin", category: "profitability", unit: "%", compute: margin("operating_income") },
  { key: "ebitda_margin", category: "profitability", unit: "%", compute: margin("ebitda") },
  { key: "net_margin", category: "profitability", unit: "%", compute: margin("net_income") },
  { key: "roa", category: "profitability", unit: "%", compute: roa },
  { key: "roe", category: "profitability", unit: "%", compute: roe },

  { key: "asset_turnover", category: "efficiency", unit: "x", compute: assetTurnover },
  {
    key: "inventory_turnover",
    category: "efficiency",
    unit: "x",
    compute: turnover("cost_of_goods_sold", "inventory"),
  },
  {
    key: "receivables_turnover",
    category: "efficiency",
    unit: "x",
    compute: turnover("revenue", "accounts_receivable"),
  },
  {
    key: "payables_turnover",
    category: "efficiency",
    unit: "x",
    compute: turnover("cost_of_goods_sold", "accounts_payable"),
  },

  { key: "free_cash_flow", category: "cashflow", unit: "money", compute: freeCashFlow },
  { key: "fcf_margin", category: "cashflow", unit: "%", compute: fcfMargin },
  { key: "cash_conversion", category: "cashflow", unit: "x", compute: cashConversion },

  { key: "pe", category: "market", unit: "x", requiresMarketData: true, compute: pe },
  { key: "pb", category: "market", unit: "x", requiresMarketData: true, compute: pb },
  { key: "ev", category: "market", unit: "money", requiresMarketData: true, compute: ev },
  { key: "ev_ebitda", category: "market", unit: "x", requiresMarketData: true, compute: evEbitda },
];

function newComputedRatio(
  key: string,
  category: string,
  unit: RatioDef["unit"],
  value: number | null,
  applicable: boolean,
): ComputedRatio {
  return { key, category, unit, value, status: "na", score: null, applicable, benchmark: null };
}

/** Mirrors ratios.py's `compute_all`: a market-requiring ratio (P/E, P/B,
 * EV, EV/EBITDA) is reported inapplicable with a null value — never
 * computed at all — whenever the company has no market data, exactly
 * matching `has_market_data`'s gate. */
export function computeAll(i: Inputs): ComputedRatio[] {
  const market = hasMarketData(i);
  return RATIO_DEFS.map((def) => {
    if (def.requiresMarketData && !market) {
      return newComputedRatio(def.key, def.category, def.unit, null, false);
    }
    return newComputedRatio(def.key, def.category, def.unit, def.compute(i), true);
  });
}

/**
 * Altman Z-Score: mirrors ratios.py's `altman_z` — the public-model
 * coefficients when a market cap is available (X4 = MVE/TL), otherwise the
 * private-company Z′ branch (X4 = BVE/TL); X2 (retained earnings / total
 * assets) joins the model only when retained_earnings was extracted. Never
 * applied to banks. The return type is `ComputedRatio | null` to mirror
 * ratios.py's `Optional[RatioResult]` signature, but ratios.py's altman_z
 * always returns a result in practice (applicable true or false) — `null`
 * is never actually produced here either.
 */
export function altmanZ(i: Inputs, industry: string): ComputedRatio | null {
  if (industry === "banking") {
    return {
      key: "altman_z",
      category: "leverage",
      unit: "x",
      value: null,
      status: "na",
      score: null,
      applicable: false,
      benchmark: null,
    };
  }

  const ta = g(i, "total_assets");
  const ca = g(i, "current_assets");
  const cl = g(i, "current_liabilities");
  const wc = ca !== null && cl !== null ? ca - cl : null;
  const ebit = g(i, "operating_income");
  const mcap = marketCap(i);
  const equity = g(i, "shareholders_equity");
  const x4Value = mcap !== null ? mcap : equity;
  const publicModel = mcap !== null;
  const tl = g(i, "total_liabilities");
  const rev = g(i, "revenue");
  const re = g(i, "retained_earnings");

  const needed = [ta, wc, ebit, x4Value, tl, rev];
  if (needed.some((v) => v === null) || ta === 0 || tl === 0) {
    return {
      key: "altman_z",
      category: "leverage",
      unit: "x",
      value: null,
      status: "na",
      score: null,
      applicable: true,
      benchmark: null,
    };
  }

  const x1 = wc! / ta!;
  const x3 = ebit! / ta!;
  const x4 = x4Value! / tl!;
  const x5 = rev! / ta!;
  const hasX2 = re !== null;
  const x2 = hasX2 ? re! / ta! : null;

  let z: number;
  let goodCut: number;
  let greyCut: number;
  if (publicModel) {
    goodCut = 2.99;
    greyCut = 1.81;
    z = hasX2
      ? 1.2 * x1 + 1.4 * x2! + 3.3 * x3 + 0.6 * x4 + 1.0 * x5
      : 1.2 * x1 + 3.3 * x3 + 0.6 * x4 + 1.0 * x5;
  } else {
    goodCut = 2.9;
    greyCut = 1.23;
    z = hasX2
      ? 0.717 * x1 + 0.847 * x2! + 3.107 * x3 + 0.42 * x4 + 0.998 * x5
      : 0.717 * x1 + 3.107 * x3 + 0.42 * x4 + 0.998 * x5;
  }

  const status: RatioStatus = z > goodCut ? "good" : z >= greyCut ? "attention" : "critical";
  return {
    key: "altman_z",
    category: "leverage",
    unit: "x",
    value: z,
    status,
    score: null,
    applicable: true,
    benchmark: null,
  };
}
