// Small pure helpers for the results document — kept out of the components
// so the priority sort and footnote numbering are unit-testable without
// rendering React.
import type { ExtractedValue, Recommendation, RatioResult } from "./api-types";

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

export interface RatioInputTrace {
  /** The key exactly as it appears in `RatioResult.inputs` — either a
   * standardized metric key (e.g. "revenue") or a derived/computed key
   * (e.g. "working_capital", "ebit", "average_total_assets") that never
   * has a matching source value. */
  key: string;
  value: number | null;
  /** The ExtractedValue this input traces back to, or null when the key
   * is derived/computed rather than read directly from the document. */
  source: ExtractedValue | null;
}

/** Matches each of a ratio's inputs to the analysis's source_values, by
 * exact metric-key equality — the provenance trace's core lookup. A
 * derived input (an average, a subtotal like working_capital, an alias
 * like ebit) never has a matching entry: its `source` comes back null, and
 * the caller renders it as a computed value rather than a document
 * citation. Preserves `ratio.inputs`' own key order. */
export function traceRatioInputs(
  ratio: RatioResult,
  sourceValues: ExtractedValue[],
): RatioInputTrace[] {
  const byMetric = new Map(sourceValues.map((sv) => [sv.metric, sv]));
  return Object.entries(ratio.inputs).map(([key, value]) => ({
    key,
    value,
    source: byMetric.get(key) ?? null,
  }));
}

const SNIPPET_TRUNCATE_LENGTH = 160;

/** Truncates a document snippet for inline display in the provenance
 * trace. `full` carries the untruncated text (for a `title` attribute) and
 * is only set when truncation actually happened — nothing is ever lost,
 * only visually collapsed. */
export function truncateSnippet(snippet: string): { display: string; full?: string } {
  if (snippet.length <= SNIPPET_TRUNCATE_LENGTH) return { display: snippet };
  return { display: `${snippet.slice(0, SNIPPET_TRUNCATE_LENGTH)}…`, full: snippet };
}
