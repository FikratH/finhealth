import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { WhatIfSimulator } from "@/components/results/what-if-simulator";
import ruMessages from "@/messages/ru.json";
import expectedAnalysis from "../../api/demo/expected_analysis_example.json";
import type { AnalysisResult } from "@/lib/api-types";

// The full demo fixture — self-consistent by construction (the contract
// test pins it), so a zero-lever render shows no false "changed" ratios,
// unlike results-document.test.tsx's deliberately trimmed fixture.
const analysis = expectedAnalysis as unknown as AnalysisResult;

function renderSimulator() {
  return render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <WhatIfSimulator analysis={analysis} locale="ru" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("WhatIfSimulator", () => {
  it("renders one keyboard-accessible range slider per lever, each labeled with its metric name", () => {
    renderSimulator();
    const sliders = screen.getAllByRole("slider");
    expect(sliders).toHaveLength(6);
    // Every lever's metric already has a METRIC_NAMES entry (lib/metric-names.ts),
    // reused here rather than a duplicate translation set.
    expect(screen.getByLabelText("Выручка")).toBeInTheDocument();
    expect(screen.getByLabelText("Себестоимость")).toBeInTheDocument();
    expect(screen.getByLabelText("Процентный долг")).toBeInTheDocument();
    expect(screen.getByLabelText("Дебиторская задолженность")).toBeInTheDocument();
    expect(screen.getByLabelText("Кредиторская задолженность")).toBeInTheDocument();
    expect(screen.getByLabelText("Денежные средства")).toBeInTheDocument();
  });

  it("each slider carries min/max at its documented lever limit and an aria-valuetext readout", () => {
    renderSimulator();
    const revenueSlider = screen.getByLabelText("Выручка");
    expect(revenueSlider).toHaveAttribute("min", "-0.3");
    expect(revenueSlider).toHaveAttribute("max", "0.3");
    expect(revenueSlider).toHaveAttribute("aria-valuetext", "0%");

    const debtSlider = screen.getByLabelText("Процентный долг");
    expect(debtSlider).toHaveAttribute("min", "-0.5");
    expect(debtSlider).toHaveAttribute("max", "0.5");
  });

  it("shows no changed ratios and a disabled reset button at the default (zero-lever) state", () => {
    renderSimulator();
    expect(screen.getByText(ruMessages.Results.whatIf.noChanges)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: ruMessages.Results.whatIf.reset })).toBeDisabled();
  });

  it("recomputes after the 150ms debounce and lists a changed ratio with old→new status", async () => {
    renderSimulator();
    const debtSlider = screen.getByLabelText("Процентный долг");

    fireEvent.change(debtSlider, { target: { value: "-0.5" } });
    // Not yet recomputed — still inside the debounce window.
    expect(screen.getByText(ruMessages.Results.whatIf.noChanges)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(screen.queryByText(ruMessages.Results.whatIf.noChanges)).not.toBeInTheDocument();
    // interest_coverage: critical → attention at debt −50% (hand-verified
    // in tests/simulator-levers.test.ts's "debt −50%" scenario).
    const changedHeading = screen.getByText(ruMessages.Results.whatIf.changedHeading);
    const list = changedHeading.parentElement as HTMLElement;
    expect(within(list).getByText("Interest Coverage")).toBeInTheDocument();
  });

  it("сбросить restores the default lever state and clears the changed-ratios list", async () => {
    renderSimulator();
    const debtSlider = screen.getByLabelText("Процентный долг");
    fireEvent.change(debtSlider, { target: { value: "-0.5" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(screen.queryByText(ruMessages.Results.whatIf.noChanges)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: ruMessages.Results.whatIf.reset }));

    expect(debtSlider).toHaveValue("0");
    expect(screen.getByText(ruMessages.Results.whatIf.noChanges)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: ruMessages.Results.whatIf.reset })).toBeDisabled();
  });

  it("shows the не-сохраняется chip and the simplification disclosure", () => {
    renderSimulator();
    expect(screen.getByText(ruMessages.Results.whatIf.notPersisted)).toBeInTheDocument();
    expect(screen.getByText(ruMessages.Results.whatIf.disclosure)).toBeInTheDocument();
  });

  it("renders print:hidden — interactive tooling, not document content", () => {
    const { container } = renderSimulator();
    expect(container.querySelector("section.print\\:hidden")).not.toBeNull();
  });
});
