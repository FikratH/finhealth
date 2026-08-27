// Industry-aware scoring — a line-by-line TS mirror of
// apps/api/app/services/scoring.py's `_score_against_benchmark`,
// `apply_benchmarks`, `category_scores`, and `overall_score`. Missing data
// is excluded and weights are renormalized — a missing metric is never
// scored as zero, matching the Python module's own header comment.
import type { CategoryScore, IndustryBenchmark, RatioStatus } from "@/lib/api-types";
import type { ComputedRatio, SimulatedCategoryScore } from "./types";

function clamp(x: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Maps a ratio value to a 0-100 score and a traffic-light status —
 * mirrors scoring.py's `_score_against_benchmark`. */
export function scoreAgainstBenchmark(
  value: number,
  bm: Pick<IndustryBenchmark, "good" | "acceptable" | "direction">,
): [number, RatioStatus] {
  const [gLo, gHi] = bm.good;
  const [aLo, aHi] = bm.acceptable;
  const direction = bm.direction;

  if (direction === "higher") {
    if (value >= gLo) {
      const span = Math.max(gHi - gLo, 1e-9);
      return [clamp(85 + 15 * Math.min((value - gLo) / span, 1.0)), "good"];
    }
    if (value >= aLo) {
      const span = Math.max(gLo - aLo, 1e-9);
      return [clamp(55 + (30 * (value - aLo)) / span), "attention"];
    }
    if (aLo === 0) return [20.0, "critical"];
    return [clamp((50 * Math.max(value, 0)) / aLo, 0, 50), "critical"];
  }

  if (direction === "lower") {
    if (value <= gHi) return [95.0, "good"];
    if (value <= aHi) {
      const span = Math.max(aHi - gHi, 1e-9);
      return [clamp(55 + (30 * (aHi - value)) / span), "attention"];
    }
    const overshoot = (value - aHi) / Math.max(Math.abs(aHi), 1e-9);
    return [clamp(40 - 40 * Math.min(overshoot, 1.0), 0, 40), "critical"];
  }

  // direction === "range": the optimum sits inside [gLo, gHi].
  if (gLo <= value && value <= gHi) return [92.0, "good"];
  if (aLo <= value && value <= aHi) {
    if (value < gLo) {
      const span = Math.max(gLo - aLo, 1e-9);
      return [55 + (30 * (value - aLo)) / span, "attention"];
    }
    const span = Math.max(aHi - gHi, 1e-9);
    return [55 + (30 * (aHi - value)) / span, "attention"];
  }
  return [25.0, "critical"];
}

/** Matches Python's `round(x, 1)` for every value this module actually
 * rounds (division results almost never land exactly on a binary tie), and
 * is what the contract test verifies to the 1e-9 tolerance the brief asks
 * for. */
export function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/**
 * Mirrors scoring.py's `apply_benchmarks`, given each ratio's own
 * benchmark (`benchmarkByKey`) and the set of ratios excluded for this
 * industry (`excludedKeys`) — both sourced by the caller rather than a
 * bundled copy of benchmarks.json (see index.ts's header for why). Mutates
 * `ratios` in place, exactly like the Python function mutates its
 * `RatioResult`s.
 */
export function applyBenchmarks(
  ratios: ComputedRatio[],
  benchmarkByKey: ReadonlyMap<string, IndustryBenchmark | null>,
  excludedKeys: ReadonlySet<string>,
): void {
  for (const r of ratios) {
    if (excludedKeys.has(r.key)) {
      r.applicable = false;
      r.status = "na";
      r.score = null;
      r.benchmark = null;
      continue;
    }

    const bm = benchmarkByKey.get(r.key) ?? null;
    if (bm) r.benchmark = bm;

    if (r.value === null) {
      r.status = "na";
      continue;
    }
    if (r.unit === "money") {
      r.status = "na";
      r.score = null;
      continue;
    }
    if (!r.benchmark) {
      // altman_z has no benchmark entry but sets its own status/score —
      // apply_benchmarks leaves it untouched, same as Python.
      if (r.key !== "altman_z") r.status = "na";
      continue;
    }

    const [score, status] = scoreAgainstBenchmark(r.value, r.benchmark);
    r.score = round1(score);
    r.status = status;
  }
}

/** Mirrors scoring.py's `category_scores`: a weighted average within each
 * category, over only the ratios that are applicable, scored, and
 * benchmarked — a missing ratio drops out rather than scoring as zero. */
export function categoryScores(
  ratios: readonly ComputedRatio[],
  categoryWeights: readonly Pick<CategoryScore, "category" | "weight">[],
): SimulatedCategoryScore[] {
  return categoryWeights.map(({ category, weight }) => {
    const scored = ratios.filter(
      (r) => r.category === category && r.applicable && r.score !== null && r.benchmark !== null,
    );
    if (scored.length === 0 || weight === 0) {
      return { category, score: null, weight };
    }
    const wsum = scored.reduce((s, r) => s + r.benchmark!.weight, 0);
    const val = scored.reduce((s, r) => s + r.score! * r.benchmark!.weight, 0) / wsum;
    return { category, score: round1(val), weight };
  });
}

/** Mirrors scoring.py's `overall_score`: a weighted average over available
 * categories, with weights renormalized across only the categories that
 * scored — `null` when nothing scored at all. */
export function overallScore(cats: readonly SimulatedCategoryScore[]): number | null {
  const available = cats.filter((c) => c.score !== null && c.weight > 0);
  if (available.length === 0) return null;
  const totalW = available.reduce((s, c) => s + c.weight, 0);
  const score = available.reduce((s, c) => s + c.score! * c.weight, 0) / totalW;
  return round1(score);
}
