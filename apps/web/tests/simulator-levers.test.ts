// Lever math: the six sliders' scaling, the two documented dependent
// adjustments (gross_profit, interest_expense), reset-to-baseline, and the
// brief's named scenario (debt −50% improves interest_coverage's status).
import { describe, expect, it } from "vitest";
import expectedAnalysis from "../../api/demo/expected_analysis_example.json";
import {
  DEFAULT_LEVER_STATE,
  applyLevers,
  clampLever,
  runSimulation,
  toAbsoluteInputs,
} from "@/lib/simulator";
import type { AnalysisResult } from "@/lib/api-types";

const baseline = expectedAnalysis as unknown as AnalysisResult;
const baseLatest = toAbsoluteInputs(baseline.source_values ?? []);

describe("applyLevers: scaling", () => {
  it("is a no-op at the all-zero default lever state", () => {
    const out = applyLevers(baseLatest, DEFAULT_LEVER_STATE);
    for (const key of Object.keys(baseLatest)) {
      expect(out[key]).toBe(baseLatest[key]);
    }
  });

  it("scales only the latest value of each lever's own metric — nothing else", () => {
    const out = applyLevers(baseLatest, { ...DEFAULT_LEVER_STATE, revenue: 0.3 });
    expect(out.revenue).toBeCloseTo((baseLatest.revenue as number) * 1.3, 6);
    // cost_of_goods_sold untouched by the revenue lever.
    expect(out.cost_of_goods_sold).toBe(baseLatest.cost_of_goods_sold);
    // total_assets, current_liabilities etc. — nothing balance-sheet moves
    // just because revenue moved.
    expect(out.total_assets).toBe(baseLatest.total_assets);
    expect(out.current_liabilities).toBe(baseLatest.current_liabilities);
  });

  it("clamps each lever to its documented limit", () => {
    expect(clampLever("revenue", 0.9)).toBeCloseTo(0.3, 9);
    expect(clampLever("revenue", -0.9)).toBeCloseTo(-0.3, 9);
    expect(clampLever("total_debt", 0.9)).toBeCloseTo(0.5, 9);
    expect(clampLever("cash", -0.9)).toBeCloseTo(-0.5, 9);
    expect(clampLever("accounts_receivable", 0.1)).toBeCloseTo(0.1, 9);
  });

  it("leaves a null metric null rather than scaling into a fabricated number", () => {
    const out = applyLevers(baseLatest, { ...DEFAULT_LEVER_STATE, cash: 0.5 });
    // ebitda is null on the demo fixture and isn't a lever at all — confirms
    // applyLevers never touches a metric it wasn't asked to.
    expect(out.ebitda).toBeNull();
  });
});

describe("applyLevers: dependent adjustment #1 — gross_profit = revenue − cogs", () => {
  it("recomputes gross_profit when revenue moves", () => {
    const out = applyLevers(baseLatest, { ...DEFAULT_LEVER_STATE, revenue: 0.1 });
    expect(out.gross_profit).toBeCloseTo((out.revenue as number) - (out.cost_of_goods_sold as number), 6);
    expect(out.gross_profit).not.toBe(baseLatest.gross_profit);
  });

  it("recomputes gross_profit when cost_of_goods_sold moves", () => {
    const out = applyLevers(baseLatest, { ...DEFAULT_LEVER_STATE, cost_of_goods_sold: -0.1 });
    expect(out.gross_profit).toBeCloseTo((out.revenue as number) - (out.cost_of_goods_sold as number), 6);
  });

  it("never fabricates gross_profit when it was never sourced", () => {
    const latestWithoutGrossProfit = { ...baseLatest, gross_profit: null };
    const out = applyLevers(latestWithoutGrossProfit, { ...DEFAULT_LEVER_STATE, revenue: 0.1 });
    expect(out.gross_profit).toBeNull();
  });
});

describe("applyLevers: dependent adjustment #2 — interest_expense scales with the debt lever", () => {
  it("scales interest_expense by the same factor as total_debt, leaving EBIT untouched", () => {
    const out = applyLevers(baseLatest, { ...DEFAULT_LEVER_STATE, total_debt: -0.5 });
    expect(out.total_debt).toBeCloseTo((baseLatest.total_debt as number) * 0.5, 6);
    expect(out.interest_expense).toBeCloseTo((baseLatest.interest_expense as number) * 0.5, 6);
    // The disclosed simplification: operating_income (EBIT) is NOT
    // auto-adjusted by any lever.
    expect(out.operating_income).toBe(baseLatest.operating_income);
    expect(out.net_income).toBe(baseLatest.net_income);
  });
});

describe("reset: the all-zero lever state reproduces the baseline exactly", () => {
  it("runSimulation(analysis, DEFAULT_LEVER_STATE) matches every baseline ratio", () => {
    const result = runSimulation(baseline, DEFAULT_LEVER_STATE);
    for (const expectedRatio of baseline.ratios) {
      const actual = result.ratios.find((r) => r.key === expectedRatio.key)!;
      if (expectedRatio.value === null) {
        expect(actual.value).toBeNull();
      } else {
        expect(actual.value).toBeCloseTo(expectedRatio.value, 9);
      }
      expect(actual.status).toBe(expectedRatio.status);
    }
    expect(result.overallScore).toBeCloseTo(baseline.overall_score as number, 9);
  });
});

// The brief's named scenario, hand-verified:
//
//   total_debt:        540 000 000 × 0.5 = 270 000 000
//   interest_expense:  148 200 000 × 0.5 =  74 100 000   (dependent adjustment #2)
//   operating_income (EBIT): unchanged   = 356 400 000   (never auto-adjusted)
//
//   interest_coverage = EBIT / interest_expense
//     baseline:  356 400 000 / 148 200 000 = 2.40486…
//       benchmark (higher): good=[4.9068, 10.3909], acceptable=[2.5977, 13.8546]
//       2.40486 < acceptable_lo(2.5977) → status "critical" (matches the
//       fixture: status "critical", score 46.3)
//     simulated: 356 400 000 /  74 100 000 = 4.80972…
//       4.80972 < good_lo(4.9068) but >= acceptable_lo(2.5977)
//       → status "attention" — an improvement over "critical"
//
//   debt_to_equity = total_debt / shareholders_equity (equity untouched)
//     baseline:  540 000 000 / 1 430 600 000 = 0.37746… → status "attention"
//     simulated: 270 000 000 / 1 430 600 000 = 0.18873…
//       benchmark (lower): good=[0, 0.303] → 0.18873 <= 0.303 → status "good"
//
//   altman_z is UNCHANGED by this lever: its formula's X4 uses
//   shareholders_equity / total_liabilities, not total_debt — total_debt
//   never appears in the Altman formula at all, so the debt lever
//   genuinely does not move it (not a simulator gap).
describe("scenario: debt −50% on the demo fixture", () => {
  const result = runSimulation(baseline, { ...DEFAULT_LEVER_STATE, total_debt: -0.5 });

  it("interest_coverage's status improves from critical to attention", () => {
    const baselineRatio = baseline.ratios.find((r) => r.key === "interest_coverage")!;
    expect(baselineRatio.status).toBe("critical");

    const simulated = result.ratios.find((r) => r.key === "interest_coverage")!;
    expect(simulated.value).toBeCloseTo(356_400_000 / 74_100_000, 6);
    expect(simulated.status).toBe("attention");
    expect(simulated.score!).toBeGreaterThan(baselineRatio.score!);
  });

  it("debt_to_equity's status improves from attention to good", () => {
    const baselineRatio = baseline.ratios.find((r) => r.key === "debt_to_equity")!;
    expect(baselineRatio.status).toBe("attention");

    const simulated = result.ratios.find((r) => r.key === "debt_to_equity")!;
    expect(simulated.value).toBeCloseTo(270_000_000 / 1_430_600_000, 6);
    expect(simulated.status).toBe("good");
  });

  it("altman_z is untouched — total_debt never appears in its formula", () => {
    const baselineAltman = baseline.ratios.find((r) => r.key === "altman_z")!;
    const simulatedAltman = result.ratios.find((r) => r.key === "altman_z")!;
    expect(simulatedAltman.value).toBeCloseTo(baselineAltman.value as number, 9);
    expect(simulatedAltman.status).toBe(baselineAltman.status);
  });

  it("the leverage category score improves", () => {
    const baselineCat = baseline.category_scores.find((c) => c.category === "leverage")!;
    const simulatedCat = result.categoryScores.find((c) => c.category === "leverage")!;
    expect(simulatedCat.score!).toBeGreaterThan(baselineCat.score as number);
  });

  it("the overall score improves", () => {
    expect(result.overallScore!).toBeGreaterThan(baseline.overall_score as number);
  });
});
