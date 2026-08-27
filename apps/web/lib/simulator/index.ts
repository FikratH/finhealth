// The what-if simulator: a deterministic TS mirror of the analysis engine
// (apps/api/app/services/ratios.py + scoring.py), driven entirely off an
// already-loaded AnalysisResult — no network call of its own.
//
// Design note on where the industry benchmark config comes from: every
// applicable ratio in a persisted AnalysisResult already carries its own
// `benchmark` (good/acceptable/direction/weight — see api-types.ts's
// `IndustryBenchmark`), and `category_scores[].weight` already carries
// each category's weight. That is the complete input scoring.py's
// `apply_benchmarks`/`category_scores` need — re-fetching
// `GET /api/industries/{id}/benchmarks` (lib/api.ts's `getIndustryBenchmarks`,
// added alongside this module) would only reproduce data already in hand,
// at the cost of a network round-trip inside a 150ms-debounced slider
// drag. So `runSimulation` reuses the loaded analysis's own embedded
// benchmarks as the single source of truth; `getIndustryBenchmarks` is kept
// as a general-purpose API client addition but the simulator itself never
// calls it.
import type { AnalysisResult } from "@/lib/api-types";
import { altmanZ, computeAll } from "./ratios";
import { applyBenchmarks, categoryScores, overallScore } from "./scoring";
import { applyLevers, DEFAULT_LEVER_STATE, reconstructPreviousInputs, toAbsoluteInputs } from "./inputs";
import type { ComputedRatio, Inputs, SimulatedRatio, SimulationResult } from "./types";
import type { LeverState } from "./inputs";

export type { Inputs, SimulatedRatio, SimulatedCategoryScore, SimulationResult } from "./types";
export {
  LEVER_KEYS,
  LEVER_LIMITS,
  DEFAULT_LEVER_STATE,
  clampLever,
  applyLevers,
  toAbsoluteInputs,
  reconstructPreviousInputs,
} from "./inputs";
export type { LeverKey, LeverState } from "./inputs";
export { safeDiv, average, hasMarketData, computeAll, altmanZ } from "./ratios";
export { scoreAgainstBenchmark, round1, applyBenchmarks, categoryScores, overallScore } from "./scoring";

/**
 * Runs the six levers against `analysis` and returns the simulated
 * ratios/category scores/overall score — the same shapes, and (at the
 * default all-zero lever state) the same *values*, `run_analysis` would
 * produce server-side. This is also exactly what
 * tests/simulator-contract.test.ts calls with the zero lever state to
 * prove the TS engine matches the real one bit-for-bit.
 */
export function runSimulation(analysis: AnalysisResult, leverState: LeverState): SimulationResult {
  const baseLatest = toAbsoluteInputs(analysis.source_values ?? []);
  const previous = reconstructPreviousInputs(
    analysis.ratios,
    analysis.confidence.has_previous_period,
    baseLatest,
  );
  const leveredLatest = applyLevers(baseLatest, leverState);
  const inputs: Inputs = { latest: leveredLatest, previous };

  const benchmarkByKey = new Map(analysis.ratios.map((r) => [r.key, r.benchmark ?? null] as const));
  // A baseline ratio marked inapplicable with a REAL (non-null) value was
  // excluded for this industry — scoring.py's apply_benchmarks excludes it
  // before a value even matters. A ratio marked inapplicable with a null
  // value was gated by missing market data instead; computeAll below
  // independently re-derives that same gate from the (possibly lever'd)
  // inputs, so it doesn't need to be listed here — and none of the six
  // levers touch market_cap/share_price/eps/shares_outstanding, so that
  // gate can never flip open under simulation.
  const excludedKeys = new Set(
    analysis.ratios.filter((r) => !r.applicable && r.value !== null).map((r) => r.key),
  );

  const ratios: ComputedRatio[] = computeAll(inputs);
  const altman = altmanZ(inputs, analysis.industry);
  if (altman) ratios.push(altman);

  applyBenchmarks(ratios, benchmarkByKey, excludedKeys);

  const categoryWeights = analysis.category_scores.map((c) => ({ category: c.category, weight: c.weight }));
  const categories = categoryScores(ratios, categoryWeights);
  const overall = overallScore(categories);

  const simulatedRatios: SimulatedRatio[] = ratios.map((r) => ({
    key: r.key,
    value: r.value,
    status: r.status,
    score: r.score,
  }));

  return { ratios: simulatedRatios, categoryScores: categories, overallScore: overall };
}

/**
 * Self-consistency guard: does `runSimulation` at the all-zero lever state
 * reproduce the analysis's own stored `overall_score`? True for every real
 * analysis (the contract test pins exactly this), because `source_values`,
 * `ratios[]`, and `category_scores[]` were all produced by the same
 * `run_analysis` call server-side. It can only go false for a payload
 * whose `ratios[]`/`category_scores[]` weren't actually derived from its
 * own `source_values` — an old stored analysis from before the engine
 * changed underneath it, or a hand-built fixture that doesn't maintain
 * that invariant (never a real API response). Callers use this to decide
 * whether the what-if panel is trustworthy enough to show at all: a
 * mismatch here means the "changed ratios" list would be comparing the
 * stored baseline against a recompute that was never faithful to it in
 * the first place.
 */
export function simulationMatchesBaseline(analysis: AnalysisResult): boolean {
  if (analysis.overall_score === null) return false;
  const zeroLever = runSimulation(analysis, DEFAULT_LEVER_STATE);
  if (zeroLever.overallScore === null) return false;
  return Math.abs(zeroLever.overallScore - analysis.overall_score) < 0.05;
}
