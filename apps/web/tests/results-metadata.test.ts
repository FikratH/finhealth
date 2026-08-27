import { beforeEach, describe, expect, it, vi } from "vitest";
import ruMessages from "@/messages/ru.json";
import enMessages from "@/messages/en.json";
import type { AnalysisResult } from "@/lib/api-types";

// The share-link OG privacy requirement (Plan 4 Task 6): the results page's
// generateMetadata must title the card with the real health_label verdict
// but keep the description free of any number — score, ratio value, etc. —
// so a link-preview card never leaks a company's actual figures to whoever
// it's shared with before they open it. Both mocks below stand in for real
// infrastructure this plain async function otherwise depends on:
// getAnalysisServer (the network call) and next-intl's getTranslations
// (resolved here against the real messages/{ru,en}.json content, not a
// fake stub, so the digit-free assertion is checking the actual copy that
// ships).
vi.mock("@/lib/api-server", () => ({
  getAnalysisServer: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const messages = locale === "en" ? enMessages : ruMessages;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ns = namespace.split(".").reduce((obj: any, key) => obj[key], messages as any);
    return (key: string, values?: Record<string, unknown>) => {
      let str: string = ns[key];
      if (values) {
        for (const [k, v] of Object.entries(values)) {
          str = str.replaceAll(`{${k}}`, String(v));
        }
      }
      return str;
    };
  },
  setRequestLocale: vi.fn(),
}));

function analysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    analysis_id: "abc123",
    created_at: "2026-08-27T00:00:00Z",
    industry: "manufacturing",
    industry_name: "Производство",
    scale: "thousands",
    overall_score: 85.1,
    health_label: "Сильное состояние",
    category_scores: [],
    ratios: [],
    strengths: [],
    risks: [],
    recommendations: [],
    warnings: [],
    confidence: {
      total: 90,
      data_completeness: 90,
      extraction_confidence: 90,
      manual_corrections: 0,
      has_previous_period: true,
      has_industry_benchmarks: true,
      audited: false,
      notes: [],
    },
    missing_metrics: [],
    disclaimer: "",
    ...overrides,
  };
}

describe("Results page generateMetadata — share-link OG privacy", () => {
  const LOCALES = ["ru", "en"] as const;

  beforeEach(() => {
    vi.resetModules();
  });

  for (const locale of LOCALES) {
    it(`locale=${locale}: titles the OG card with the real health_label, description carries no digits`, async () => {
      const { getAnalysisServer } = await import("@/lib/api-server");
      vi.mocked(getAnalysisServer).mockResolvedValue(
        analysis({ health_label: "Критическое состояние" }),
      );
      const { generateMetadata } = await import("@/app/[locale]/results/[id]/page");

      const metadata = await generateMetadata({
        params: Promise.resolve({ locale, id: "abc123" }),
      });

      expect(metadata.title).toContain("Критическое состояние");
      expect(String(metadata.description)).not.toMatch(/\d/);
    });

    it(`locale=${locale}: falls back to the generic title/description (still digit-free) on a fetch failure`, async () => {
      const { getAnalysisServer } = await import("@/lib/api-server");
      vi.mocked(getAnalysisServer).mockRejectedValue(new Error("not found"));
      const { generateMetadata } = await import("@/app/[locale]/results/[id]/page");

      const messages = locale === "en" ? enMessages : ruMessages;
      const metadata = await generateMetadata({
        params: Promise.resolve({ locale, id: "missing" }),
      });

      expect(metadata.title).toBe(messages.Results.meta.title);
      expect(String(metadata.description)).not.toMatch(/\d/);
    });
  }
});
