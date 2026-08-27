// Small pure helpers for the results document — kept out of the components
// so the priority sort and footnote numbering are unit-testable without
// rendering React.
import type { Recommendation, RatioResult } from "./api-types";

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

/** Recommendations, priority-sorted (high → medium → low). Stable for equal
 * priorities — API order is preserved within a priority tier. Returns a new
 * array; never mutates the input. */
export function sortRecommendationsByPriority(
  recommendations: Recommendation[],
): Recommendation[] {
  return recommendations
    .map((rec, index) => ({ rec, index }))
    .sort((a, b) => {
      const diff = (PRIORITY_ORDER[a.rec.priority] ?? 99) - (PRIORITY_ORDER[b.rec.priority] ?? 99);
      return diff !== 0 ? diff : a.index - b.index;
    })
    .map(({ rec }) => rec);
}

/** Assigns each distinct non-empty `benchmark.source` a 1-based footnote
 * number, in first-appearance order across `ratios` — the lab-report's
 * "source citation footnote marker" grammar. Ratios sharing a source share
 * a number. */
export function buildFootnoteIndex(ratios: RatioResult[]): Map<string, number> {
  const index = new Map<string, number>();
  for (const ratio of ratios) {
    const source = ratio.benchmark?.source;
    if (source && !index.has(source)) {
      index.set(source, index.size + 1);
    }
  }
  return index;
}
