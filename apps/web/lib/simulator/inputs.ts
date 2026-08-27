// Input normalization for the simulator: raw ExtractedValue[] → absolute
// metric dicts (mirrors analysis.py's `_to_absolute`), previous-period
// reconstruction, and lever application. Every function here is pure.
import type { ExtractedValue, RatioResult, Scale } from "@/lib/api-types";

// Mirrors apps/api/app/schemas.py's SCALE_MULTIPLIER.
const SCALE_MULTIPLIER: Record<Scale, number> = {
  units: 1,
  thousands: 1_000,
  millions: 1_000_000,
  billions: 1_000_000_000,
};

// Mirrors apps/api/app/services/metrics.py's EXPENSE_MAGNITUDE_METRICS —
// expense-magnitude metrics always end up as positive numbers, regardless
// of the sign the source document used.
const EXPENSE_MAGNITUDE_METRICS = new Set([
  "cost_of_goods_sold",
  "interest_expense",
  "capital_expenditures",
  "sga_expense",
  "depreciation_amortization",
]);

// Mirrors analysis.py's NON_SCALED_METRICS — per-share and per-unit figures
// are never multiplied by the document's scale.
const NON_SCALED_METRICS = new Set(["share_price", "eps", "shares_outstanding"]);

/** Ports analysis.py's `_to_absolute`: raw, document-scale ExtractedValues
 * → a flat metric → absolute-number dict. A `null` value is recorded as
 * `null` (never coerced to 0) and only on first occurrence, matching the
 * Python `dict.setdefault`. */
export function toAbsoluteInputs(values: ExtractedValue[]): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const v of values) {
    if (v.value === null) {
      if (!(v.metric in out)) out[v.metric] = null;
      continue;
    }
    let mult = SCALE_MULTIPLIER[v.scale ?? "units"];
    if (NON_SCALED_METRICS.has(v.metric)) mult = 1;
    const value = EXPENSE_MAGNITUDE_METRICS.has(v.metric) ? Math.abs(v.value) : v.value;
    out[v.metric] = value * mult;
  }
  return out;
}

// ratios.py's average()-consuming RatioDefs, and the metric each one
// averages current/previous over — the only five metrics whose previous
// value the simulator ever needs.
const AVERAGE_INPUT_TO_METRIC: Record<string, string> = {
  average_total_assets: "total_assets",
  average_shareholders_equity: "shareholders_equity",
  average_inventory: "inventory",
  average_accounts_receivable: "accounts_receivable",
  average_accounts_payable: "accounts_payable",
};

/** The API's persisted AnalysisResult carries only the *latest* period's
 * source_values (see api-types.ts's `source_values` doc comment) — the raw
 * previous-period figures were never stored. But `average() = (current +
 * previous) / 2` is invertible, and every baseline ratio that used it
 * already recorded its `average_*` result in `ratio.inputs` — so
 * `previous = 2·average − current` recovers the exact original previous
 * value. (Cross-checked once against the demo fixture: this back-solve
 * reproduces the literal previous-period figures embedded in
 * source_values[].snippet, e.g. total_assets 2 298 500 for «Итого активы».)
 * The six levers only ever touch the *latest* value (see applyLevers), so
 * this reconstruction is done once and the result never changes across a
 * simulation session. When `hasPreviousPeriod` is false, average() would
 * have fallen back to `current` for every one of these ratios — returning
 * an empty dict here reproduces that same fallback the next time
 * `average()` runs, rather than fabricating a previous period that was
 * never there. */
export function reconstructPreviousInputs(
  ratios: readonly Pick<RatioResult, "inputs">[],
  hasPreviousPeriod: boolean,
  latest: Record<string, number | null>,
): Record<string, number | null> {
  const previous: Record<string, number | null> = {};
  if (!hasPreviousPeriod) return previous;
  for (const ratio of ratios) {
    for (const [inputKey, avgValue] of Object.entries(ratio.inputs)) {
      const metric = AVERAGE_INPUT_TO_METRIC[inputKey];
      if (!metric || avgValue === null || metric in previous) continue;
      const current = latest[metric];
      if (current === null || current === undefined) continue;
      previous[metric] = 2 * avgValue - current;
    }
  }
  return previous;
}

// The brief's six levers, each scaling its own metric's *latest* value
// only — previous stays fixed (reconstructPreviousInputs above runs once,
// before any lever is applied).
export type LeverKey =
  | "revenue"
  | "cost_of_goods_sold"
  | "total_debt"
  | "accounts_receivable"
  | "accounts_payable"
  | "cash";

export const LEVER_KEYS: readonly LeverKey[] = [
  "revenue",
  "cost_of_goods_sold",
  "total_debt",
  "accounts_receivable",
  "accounts_payable",
  "cash",
];

/** Each lever's allowed delta magnitude, e.g. revenue ±30% → 0.3. */
export const LEVER_LIMITS: Record<LeverKey, number> = {
  revenue: 0.3,
  cost_of_goods_sold: 0.3,
  total_debt: 0.5,
  accounts_receivable: 0.3,
  accounts_payable: 0.3,
  cash: 0.5,
};

/** A delta per lever, e.g. -0.3 = "revenue 30% lower." */
export type LeverState = Record<LeverKey, number>;

export const DEFAULT_LEVER_STATE: LeverState = {
  revenue: 0,
  cost_of_goods_sold: 0,
  total_debt: 0,
  accounts_receivable: 0,
  accounts_payable: 0,
  cash: 0,
};

export function clampLever(key: LeverKey, delta: number): number {
  const limit = LEVER_LIMITS[key];
  return Math.min(limit, Math.max(-limit, delta));
}

/**
 * Scales the six lever metrics' latest values, then applies exactly two
 * documented dependent adjustments — no others:
 *
 * 1. `gross_profit = revenue − cost_of_goods_sold`, recomputed whenever
 *    either lever moves, but ONLY when gross_profit was itself a sourced
 *    figure (`latest.gross_profit` non-null) — the model never fabricates
 *    a line item the document never reported.
 * 2. `interest_expense` scales by the same factor as the debt lever
 *    (constant effective interest rate) — the one financing-cost link the
 *    model honors, so interest_coverage responds to a capital-structure
 *    change the way a real one would.
 *
 * Deliberately NOT adjusted: net_income, operating_income (EBIT) — the
 * simulator does not model P&L flow-through from revenue/cost changes
 * (disclosed in the UI as «упрощённая модель: прибыль не пересчитывается»).
 * Every other metric (current_assets, total_assets, total_liabilities,
 * shareholders_equity, inventory, ebitda, …) is left exactly as sourced.
 */
export function applyLevers(
  latest: Record<string, number | null>,
  leverState: LeverState,
): Record<string, number | null> {
  const out = { ...latest };

  for (const key of LEVER_KEYS) {
    const v = out[key];
    if (v === null || v === undefined) continue;
    out[key] = v * (1 + leverState[key]);
  }

  const revenue = out.revenue;
  const cogs = out.cost_of_goods_sold;
  if (
    latest.gross_profit !== null &&
    latest.gross_profit !== undefined &&
    revenue !== null &&
    revenue !== undefined &&
    cogs !== null &&
    cogs !== undefined
  ) {
    out.gross_profit = revenue - cogs;
  }

  const interestExpense = latest.interest_expense;
  if (interestExpense !== null && interestExpense !== undefined) {
    out.interest_expense = interestExpense * (1 + leverState.total_debt);
  }

  return out;
}
