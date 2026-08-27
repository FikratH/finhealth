import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { AnalystNarrative } from "@/components/results/analyst-narrative";
import { ApiError } from "@/lib/api";
import ruMessages from "@/messages/ru.json";
import type { AnalysisResult, NarrativeResult } from "@/lib/api-types";

// generateNarrative is the only lib/api export this component calls
// (ApiError is used for its own `instanceof` branch, so importOriginal
// keeps the real class rather than replacing it with a mock too).
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, generateNarrative: vi.fn() };
});

import { generateNarrative } from "@/lib/api";

const analysisFixture: AnalysisResult = {
  analysis_id: "an_narrative_test",
  created_at: "2026-08-27T00:00:00Z",
  industry: "manufacturing",
  industry_name: "Производство",
  currency: "KZT",
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
    total: 95.3,
    data_completeness: 95,
    extraction_confidence: 95,
    manual_corrections: 0,
    has_previous_period: true,
    has_industry_benchmarks: true,
    audited: true,
    notes: [],
  },
  missing_metrics: [],
  disclaimer: "Сервис не заменяет профессиональную финансовую консультацию.",
};

const narrativeFixture: NarrativeResult = {
  text_ru: "Компания в устойчивом состоянии.\nГлавный риск — долговая нагрузка.",
  text_en: "The company is in a stable state.\nThe main risk is leverage.",
  model: "gpt-5-mini",
  generated_at: "2026-08-27T12:00:00+00:00",
};

function renderNarrative(analysis: AnalysisResult, onUnavailable?: () => void) {
  return render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <AnalystNarrative analysis={analysis} locale="ru" onUnavailable={onUnavailable} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  vi.mocked(generateNarrative).mockReset();
});

describe("AnalystNarrative", () => {
  it("renders the cached narrative straight from the payload, with the mandatory AI disclosure, and never calls generateNarrative", () => {
    renderNarrative({ ...analysisFixture, narrative: narrativeFixture });

    expect(screen.getByText("Компания в устойчивом состоянии.")).toBeInTheDocument();
    expect(screen.getByText("Главный риск — долговая нагрузка.")).toBeInTheDocument();
    expect(
      screen.getByText(ruMessages.Results.narrative.disclosure),
    ).toBeInTheDocument();
    expect(screen.getByText(/gpt-5-mini/)).toBeInTheDocument();
    expect(generateNarrative).not.toHaveBeenCalled();
    // No action to generate — the payload already answered the question.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders the generate action when no narrative is cached yet, and swaps in prose on a successful click", async () => {
    vi.mocked(generateNarrative).mockResolvedValueOnce(narrativeFixture);
    renderNarrative(analysisFixture);

    const button = screen.getByRole("button", {
      name: ruMessages.Results.narrative.generateButton,
    });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText("Компания в устойчивом состоянии.")).toBeInTheDocument();
    });
    expect(
      screen.getByText(ruMessages.Results.narrative.disclosure),
    ).toBeInTheDocument();
    expect(generateNarrative).toHaveBeenCalledWith("an_narrative_test");
  });

  it("hides the entire section quietly (no error banner) on a 503 — designed absence when no LLM key is configured", async () => {
    const onUnavailable = vi.fn();
    vi.mocked(generateNarrative).mockRejectedValueOnce(
      new ApiError(503, "Пояснение аналитика недоступно: ключ OPENAI_API_KEY не настроен."),
    );
    const { container } = renderNarrative(analysisFixture, onUnavailable);

    const button = screen.getByRole("button", {
      name: ruMessages.Results.narrative.generateButton,
    });
    fireEvent.click(button);

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
    // No error text of any kind survives — a quiet collapse, not a failure state.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/OPENAI_API_KEY/)).not.toBeInTheDocument();
    expect(onUnavailable).toHaveBeenCalledOnce();
  });

  it("on a non-503 failure (e.g. a transient 502 provider error), keeps the action visible for a retry rather than hiding permanently", async () => {
    const onUnavailable = vi.fn();
    vi.mocked(generateNarrative).mockRejectedValueOnce(new ApiError(502, "narrative_failed"));
    renderNarrative(analysisFixture, onUnavailable);

    const button = screen.getByRole("button", {
      name: ruMessages.Results.narrative.generateButton,
    });
    fireEvent.click(button);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: ruMessages.Results.narrative.generateButton }),
      ).toBeInTheDocument();
    });
    expect(onUnavailable).not.toHaveBeenCalled();
  });
});
