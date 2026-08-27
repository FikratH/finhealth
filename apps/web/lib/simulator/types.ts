// Shared types for the what-if simulator — a deterministic TS mirror of
// apps/api/app/services/ratios.py + scoring.py, contract-tested against the
// real engine's stored truth (tests/simulator-contract.test.ts). See
// lib/simulator/index.ts for the module's public entry point and a design
// overview (why no network fetch, how "previous period" is reconstructed).
import type { IndustryBenchmark, RatioStatus, RatioUnit } from "@/lib/api-types";

/** Metric values in absolute currency units (scale multiplier already
 * applied, expense-magnitude metrics already made positive — mirrors
 * analysis.py's `_to_absolute`). `latest` is the period the six levers act
 * on; `previous` never changes under simulation — see inputs.ts. */
export interface Inputs {
  latest: Record<string, number | null>;
  previous: Record<string, number | null>;
}

/** One ratio's recomputed value/status/score — deliberately minimal. Every
 * other display field (name, category, unit, formula, benchmark note)
 * cannot change under simulation, so UI callers look those up by `key` on
 * the baseline `AnalysisResult.ratios` they already have, rather than this
 * module duplicating them. */
export interface SimulatedRatio {
  key: string;
  value: number | null;
  status: RatioStatus;
  score: number | null;
}

export interface SimulatedCategoryScore {
  category: string;
  score: number | null;
  weight: number;
}

export interface SimulationResult {
  ratios: SimulatedRatio[];
  categoryScores: SimulatedCategoryScore[];
  overallScore: number | null;
}

/** One RatioDef, mirroring apps/api/app/services/ratios.py's RatioDef.
 * `compute` is pure arithmetic over Inputs — missing inputs propagate to
 * `null`, never a fabricated 0 (see ratios.ts's header for the same
 * discipline the Python module documents). */
export interface RatioDef {
  key: string;
  category: string;
  unit: RatioUnit;
  requiresMarketData?: boolean;
  compute: (i: Inputs) => number | null;
}

/** Internal working shape used while scoring (ratios.ts → scoring.ts) —
 * carries the fields apply_benchmarks needs (category/unit/applicable/
 * benchmark) that SimulatedRatio deliberately omits from the public
 * result. Mutated in place by scoring.ts's applyBenchmarks, mirroring the
 * Python engine's own in-place RatioResult mutation. */
export interface ComputedRatio {
  key: string;
  category: string;
  unit: RatioUnit;
  value: number | null;
  status: RatioStatus;
  score: number | null;
  applicable: boolean;
  benchmark: IndustryBenchmark | null;
}
