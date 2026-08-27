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

// ratios.py inputs{} keys that are a straight passthrough of a metric under
// a different name, not a computed/derived figure. Scanned against every
// RatioDef.compute in apps/api/app/services/ratios.py: the only such case
// is "ebit", which _interest_coverage and altman_z both key off
// operating_income's own i.g() read (matching the formulas' own X1/X3
// notation) with no arithmetic applied. Every other inputs{} key either
// already matches its metric 1:1 (total_assets, revenue, ebitda, ...), or
// is a genuine derived value with no single metric to alias to — an
// average (average_total_assets), a subtotal (working_capital, net_debt,
// free_cash_flow, enterprise_value), or a conditionally-sourced figure
// (equity_or_market_cap: market_cap when public, shareholders_equity
// otherwise — which metric backs it varies at runtime, so it can't be a
// static alias). Without this map, "ebit" would report as a fabricated
// "computed value" even though it's the exact operating_income figure the
// formula cites straight from the document.
const INPUT_KEY_ALIASES: Record<string, string> = {
  ebit: "operating_income",
};

export interface RatioInputTrace {
  /** The key exactly as it appears in `RatioResult.inputs` — either a
   * standardized metric key (e.g. "revenue"), an aliased passthrough (e.g.
   * "ebit", see INPUT_KEY_ALIASES), or a derived/computed key (e.g.
   * "working_capital", "average_total_assets") that never has a matching
   * source value. */
  key: string;
  value: number | null;
  /** The ExtractedValue this input traces back to (after alias
   * resolution), or null when the key is derived/computed rather than
   * read directly from the document. A non-null source can still carry
   * `value: null` — see classifyProvenance, which is what tells "read
   * from the document but not found" apart from "actually sourced". */
  source: ExtractedValue | null;
}

/** Matches each of a ratio's inputs to the analysis's source_values, by
 * metric-key equality after alias resolution — the provenance trace's core
 * lookup. A derived input (an average, a subtotal, a conditionally-sourced
 * value like equity_or_market_cap) never has a matching entry: its
 * `source` comes back null. Preserves `ratio.inputs`' own key order. */
export function traceRatioInputs(
  ratio: RatioResult,
  sourceValues: ExtractedValue[],
): RatioInputTrace[] {
  const byMetric = new Map(sourceValues.map((sv) => [sv.metric, sv]));
  return Object.entries(ratio.inputs).map(([key, value]) => {
    const metricKey = INPUT_KEY_ALIASES[key] ?? key;
    return { key, value, source: byMetric.get(metricKey) ?? null };
  });
}

export type ProvenanceStatus = "sourced" | "not_found" | "derived";

/** Classifies a traced input for display — three honest states, not two:
 * - "sourced": a real value the document actually contained.
 * - "not_found": source_values has an entry for this metric (so it's not
 *   a derived/computed figure), but its `value` is null — extraction.py's
 *   stub for a dictionary metric it never located in the document
 *   (original_label/source/snippet all "", confidence 0). api-types'
 *   own contract is explicit that null means N/A and must NEVER be
 *   treated as 0 — rendering a live 0% ConfidenceMeter here would fabricate
 *   a reading that was never taken.
 * - "derived": no source_values entry at all for this key — a computed or
 *   aliased figure, never read directly. */
export function classifyProvenance(trace: RatioInputTrace): ProvenanceStatus {
  if (!trace.source) return "derived";
  if (trace.source.value === null) return "not_found";
  return "sourced";
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
