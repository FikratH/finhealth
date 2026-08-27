import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { StepIndicator } from "@/components/analyze/step-indicator";
import ruMessages from "@/messages/ru.json";

function renderIndicator(current: "upload" | "verify") {
  return render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <StepIndicator current={current} />
    </NextIntlClientProvider>,
  );
}

describe("StepIndicator", () => {
  it("always renders all three steps — the always-lit 'you are here' discipline", () => {
    renderIndicator("upload");
    expect(screen.getByText("Загрузка")).toBeInTheDocument();
    expect(screen.getByText("Проверка")).toBeInTheDocument();
    expect(screen.getByText("Диагноз")).toBeInTheDocument();
  });

  it("marks the active step with aria-current=step", () => {
    renderIndicator("verify");
    const verifyStep = screen.getByText("Проверка").closest("[aria-current]");
    expect(verifyStep).toHaveAttribute("aria-current", "step");

    const uploadStep = screen.getByText("Загрузка").closest("li");
    expect(uploadStep?.querySelector("[aria-current]")).not.toBeInTheDocument();
  });

  it("marks a completed step distinctly from an upcoming one, not just the active one", () => {
    renderIndicator("verify");
    // Upload (done) shows a checkmark; diagnosis (upcoming) shows its
    // ordinal — every step's state is legible, not just the current one.
    expect(screen.getByText("✓")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});
