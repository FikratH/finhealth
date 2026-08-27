import { describe, expect, it } from "vitest";
import {
  buildFootnoteIndex,
  sortRecommendationsByPriority,
  traceRatioInputs,
  truncateSnippet,
} from "@/lib/results";
import type { ExtractedValue, Recommendation, RatioResult } from "@/lib/api-types";

function recommendation(overrides: Partial<Recommendation>): Recommendation {
  return {
    problem: "",
    ratio: "",
    benchmark_hint: "",
    action: "",
    expected_effect: "",
    tradeoffs: "",
    priority: "medium",
    difficulty: "medium",
    ...overrides,
  };
}

function ratio(overrides: Partial<RatioResult>): RatioResult {
  return {
    key: "x",
    name: "X",
    category: "liquidity",
    formula: "",
    inputs: {},
    substitution: "",
    value: null,
    unit: "x",
    status: "na",
    score: null,
    benchmark: null,
    explanation: "",
    applicable: true,
    warnings: [],
    ...overrides,
  };
}

describe("sortRecommendationsByPriority", () => {
  it("orders high before medium before low", () => {
    const input = [
      recommendation({ ratio: "low", priority: "low" }),
      recommendation({ ratio: "high", priority: "high" }),
      recommendation({ ratio: "medium", priority: "medium" }),
    ];
    expect(sortRecommendationsByPriority(input).map((r) => r.ratio)).toEqual([
      "high",
      "medium",
      "low",
    ]);
  });

  it("preserves the original order within an equal priority tier (stable sort)", () => {
    const input = [
      recommendation({ ratio: "first", priority: "high" }),
      recommendation({ ratio: "second", priority: "high" }),
    ];
    expect(sortRecommendationsByPriority(input).map((r) => r.ratio)).toEqual([
      "first",
      "second",
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [
      recommendation({ ratio: "low", priority: "low" }),
      recommendation({ ratio: "high", priority: "high" }),
    ];
    const original = [...input];
    sortRecommendationsByPriority(input);
    expect(input).toEqual(original);
  });
});

describe("buildFootnoteIndex", () => {
  it("assigns 1-based numbers in first-appearance order", () => {
    const ratios = [
      ratio({ key: "a", benchmark: { ratio: "a", weight: 1, direction: "higher", good: [0, 1], acceptable: [0, 1], note: "", source: "Source A" } }),
      ratio({ key: "b", benchmark: { ratio: "b", weight: 1, direction: "higher", good: [0, 1], acceptable: [0, 1], note: "", source: "Source B" } }),
    ];
    const index = buildFootnoteIndex(ratios);
    expect(index.get("Source A")).toBe(1);
    expect(index.get("Source B")).toBe(2);
  });

  it("shares one number across ratios citing the same source", () => {
    const shared = { ratio: "a", weight: 1, direction: "higher", good: [0, 1] as [number, number], acceptable: [0, 1] as [number, number], note: "", source: "Shared" };
    const ratios = [ratio({ key: "a", benchmark: shared }), ratio({ key: "b", benchmark: shared })];
    const index = buildFootnoteIndex(ratios);
    expect(index.size).toBe(1);
    expect(index.get("Shared")).toBe(1);
  });

  it("ignores ratios with no benchmark or an empty source (demo ranges)", () => {
    const ratios = [
      ratio({ key: "a", benchmark: null }),
      ratio({ key: "b", benchmark: { ratio: "b", weight: 1, direction: "higher", good: [0, 1], acceptable: [0, 1], note: "", source: "" } }),
    ];
    expect(buildFootnoteIndex(ratios).size).toBe(0);
  });
});

function sourceValue(overrides: Partial<ExtractedValue>): ExtractedValue {
  return {
    metric: "revenue",
    original_label: "",
    value: null,
    source: "",
    confidence: 0,
    snippet: "",
    manually_edited: false,
    ...overrides,
  };
}

describe("traceRatioInputs", () => {
  it("matches an input key to the source_values entry with the same metric", () => {
    const r = ratio({ inputs: { revenue: 100, total_assets: 200 } });
    const sources = [sourceValue({ metric: "revenue" }), sourceValue({ metric: "total_assets" })];
    const traces = traceRatioInputs(r, sources);
    expect(traces).toEqual([
      { key: "revenue", value: 100, source: sources[0] },
      { key: "total_assets", value: 200, source: sources[1] },
    ]);
  });

  it("leaves a derived key (no matching metric) with a null source", () => {
    // working_capital, ebit, average_total_assets etc. are computed, never
    // read directly from the document — they never appear as a
    // source_values[].metric.
    const r = ratio({ inputs: { working_capital: 50 } });
    const traces = traceRatioInputs(r, [sourceValue({ metric: "revenue" })]);
    expect(traces).toEqual([{ key: "working_capital", value: 50, source: null }]);
  });

  it("preserves ratio.inputs' own key order", () => {
    const r = ratio({ inputs: { b: 2, a: 1, c: 3 } });
    const traces = traceRatioInputs(r, []);
    expect(traces.map((t) => t.key)).toEqual(["b", "a", "c"]);
  });

  it("returns an empty array for a ratio with no inputs", () => {
    expect(traceRatioInputs(ratio({ inputs: {} }), [sourceValue({})])).toEqual([]);
  });
});

describe("truncateSnippet", () => {
  it("returns the snippet unchanged, with no `full`, when at or under the limit", () => {
    const short = "a".repeat(160);
    expect(truncateSnippet(short)).toEqual({ display: short });
  });

  it("truncates to 160 chars with an ellipsis and carries the untruncated text as `full`", () => {
    const long = "a".repeat(200);
    const result = truncateSnippet(long);
    expect(result.display).toBe(`${"a".repeat(160)}…`);
    expect(result.full).toBe(long);
  });
});
