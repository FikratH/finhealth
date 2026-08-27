import { describe, expect, it } from "vitest";
import { buildFootnoteIndex, sortRecommendationsByPriority } from "@/lib/results";
import type { Recommendation, RatioResult } from "@/lib/api-types";

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
