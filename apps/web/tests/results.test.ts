import { describe, expect, it } from "vitest";
import {
  buildFootnoteIndex,
  classifyProvenance,
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

  it("indexes benchmark_kz.source in the same shared numbering space (Phase 7 Task 5)", () => {
    const ratios = [
      ratio({
        key: "a",
        benchmark: { ratio: "a", weight: 1, direction: "higher", good: [0, 1], acceptable: [0, 1], note: "", source: "Damodaran" },
        benchmark_kz: { ratio: "a", value: 5, note: "", source: "Нацбанк РК", source_url: "", as_of: "2024Q1", method: "kz-official-point-v1", scope: "economy_wide" },
      }),
    ];
    const index = buildFootnoteIndex(ratios);
    // Global source indexed first (it's checked first within the ratio),
    // KZ source gets the next number — both real, distinct citations.
    expect(index.get("Damodaran")).toBe(1);
    expect(index.get("Нацбанк РК")).toBe(2);
    expect(index.size).toBe(2);
  });

  it("shares a footnote number across ratios whose benchmark_kz cites the same source", () => {
    const kz = { ratio: "x", value: 1, note: "", source: "Нацбанк РК", source_url: "", as_of: "2024Q1", method: "kz-official-point-v1", scope: "economy_wide" };
    const ratios = [
      ratio({ key: "a", benchmark_kz: { ...kz, ratio: "a" } }),
      ratio({ key: "b", benchmark_kz: { ...kz, ratio: "b" } }),
    ];
    const index = buildFootnoteIndex(ratios);
    expect(index.size).toBe(1);
    expect(index.get("Нацбанк РК")).toBe(1);
  });

  it("ignores a ratio with no benchmark_kz or an absent one", () => {
    const ratios = [ratio({ key: "a", benchmark_kz: null })];
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

  it("leaves a derived key (no matching metric, no alias) with a null source", () => {
    // working_capital, average_total_assets, equity_or_market_cap etc. are
    // computed or conditionally-sourced, never read directly from the
    // document — they never appear as a source_values[].metric and have no
    // static alias to one.
    const r = ratio({ inputs: { working_capital: 50 } });
    const traces = traceRatioInputs(r, [sourceValue({ metric: "revenue" })]);
    expect(traces).toEqual([{ key: "working_capital", value: 50, source: null }]);
  });

  it("resolves the 'ebit' alias to the operating_income source_values entry", () => {
    // ratios.py's _interest_coverage and altman_z both key
    // operating_income's own value as "ebit" (matching the formula's X1/X3
    // notation) — a pure passthrough, not a computed figure, so it must
    // trace back to the real citation rather than reading as fabricated.
    const r = ratio({ inputs: { ebit: 356400000, interest_expense: 148200000 } });
    const operatingIncome = sourceValue({ metric: "operating_income", value: 356400000 });
    const traces = traceRatioInputs(r, [operatingIncome]);
    expect(traces).toEqual([
      { key: "ebit", value: 356400000, source: operatingIncome },
      { key: "interest_expense", value: 148200000, source: null },
    ]);
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

describe("classifyProvenance", () => {
  it("classifies a real, non-null source value as 'sourced'", () => {
    const source = sourceValue({ metric: "revenue", value: 100 });
    expect(classifyProvenance({ key: "revenue", value: 100, source })).toBe("sourced");
  });

  it("classifies a matched source_values entry whose value is null as 'not_found', not 'sourced'", () => {
    // extraction.py's stub for a dictionary metric it never located in the
    // document: {value: null, source: "", confidence: 0}. api-types' own
    // contract says null means N/A and must never be treated as 0 — this
    // must not read as a real (if low-confidence) reading.
    const stub = sourceValue({ metric: "eps", value: null, confidence: 0 });
    expect(classifyProvenance({ key: "eps", value: null, source: stub })).toBe("not_found");
  });

  it("classifies no matching source_values entry at all as 'derived'", () => {
    expect(classifyProvenance({ key: "working_capital", value: 50, source: null })).toBe(
      "derived",
    );
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
