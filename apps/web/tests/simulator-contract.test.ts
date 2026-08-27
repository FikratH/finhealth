// The trust gate for lib/simulator/*: loads the SAME fixture the API's own
// backend test suite pins (apps/api/demo/expected_analysis_example.json —
// the real engine's stored truth), runs it through the TS engine at the
// all-zero lever state (a no-op simulation), and asserts every ratio's
// value/status/score, every category score, and the overall score match
// within 1e-9. A divergence here means the TS mirror has drifted from
// apps/api/app/services/ratios.py or scoring.py.
//
// The fixture conforms to the AnalysisResult shape end to end (it's the
// literal JSON apps/api/app/main.py would return from
// GET /api/analysis/{id}), so `runSimulation` — the exact function the
// results page's UI calls — is exercised directly, not a parallel
// test-only reimplementation.
import { describe, expect, it } from "vitest";
import expectedAnalysis from "../../api/demo/expected_analysis_example.json";
import { DEFAULT_LEVER_STATE, runSimulation } from "@/lib/simulator";
import type { AnalysisResult } from "@/lib/api-types";

const baseline = expectedAnalysis as unknown as AnalysisResult;

describe("simulator contract: TS mirror vs. the real engine's stored truth", () => {
  const result = runSimulation(baseline, DEFAULT_LEVER_STATE);

  it(`recomputes all ${baseline.ratios.length} ratios from the fixture`, () => {
    expect(result.ratios).toHaveLength(baseline.ratios.length);
  });

  it.each(baseline.ratios.map((r) => [r.key, r] as const))(
    "%s: value/status/score match within 1e-9",
    (key, expectedRatio) => {
      const actual = result.ratios.find((r) => r.key === key);
      expect(actual, `ratio ${key} missing from simulator output`).toBeDefined();

      if (expectedRatio.value === null) {
        expect(actual!.value, `${key}.value`).toBeNull();
      } else {
        expect(actual!.value, `${key}.value`).toBeCloseTo(expectedRatio.value, 9);
      }

      expect(actual!.status, `${key}.status`).toBe(expectedRatio.status);

      if (expectedRatio.score === null) {
        expect(actual!.score, `${key}.score`).toBeNull();
      } else {
        expect(actual!.score, `${key}.score`).toBeCloseTo(expectedRatio.score, 9);
      }
    },
  );

  it.each(baseline.category_scores.map((c) => [c.category, c] as const))(
    "category %s: score matches within 1e-9",
    (category, expectedCategory) => {
      const actual = result.categoryScores.find((c) => c.category === category);
      expect(actual, `category ${category} missing from simulator output`).toBeDefined();
      if (expectedCategory.score === null) {
        expect(actual!.score, `${category}.score`).toBeNull();
      } else {
        expect(actual!.score, `${category}.score`).toBeCloseTo(expectedCategory.score, 9);
      }
    },
  );

  it(`overall score matches ${baseline.overall_score} within 1e-9`, () => {
    expect(baseline.overall_score).not.toBeNull();
    expect(result.overallScore).toBeCloseTo(baseline.overall_score as number, 9);
  });

  it("Altman Z′ value and model status match (private, no-X2 branch on this fixture)", () => {
    const expectedAltman = baseline.ratios.find((r) => r.key === "altman_z")!;
    const actualAltman = result.ratios.find((r) => r.key === "altman_z")!;
    expect(expectedAltman.value).not.toBeNull();
    expect(actualAltman.value).toBeCloseTo(expectedAltman.value as number, 9);
    expect(actualAltman.status).toBe(expectedAltman.status);
  });
});
