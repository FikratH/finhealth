import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { StepIndicator } from "@/components/analyze/step-indicator";
import ruMessages from "@/messages/ru.json";

// Same mock shape as tests/motion.test.ts and tests/segment-display.test.tsx
// — jsdom has no matchMedia of its own; tests/setup.ts stubs a default of
// matches: false (real motion), and tests that need the reduced-motion
// branch override it locally, same as here.
function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function renderIndicator(current: "upload" | "verify", pending?: boolean) {
  return render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <StepIndicator current={current} pending={pending} />
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

// The honest-blink regression: lib/motion's blinkPending (the
// flashing-12:00 idiom) must fire on the current cell ONLY while it's
// genuinely pending — never for a merely-current-but-idle step, and never
// for a done/upcoming step regardless of `pending`. Asserted against the
// actual data-blink attribute blinkPending sets on the cell it's given
// (see tests/motion.test.ts's own contract test for that attribute), not a
// spy on the module — the same "check the real DOM" style the rest of this
// suite and motion.test.ts/segment-display.test.tsx already use.
describe("StepIndicator — honest blink", () => {
  afterEach(() => {
    mockMatchMedia(false);
  });

  it("blinks the current step's cell while it is genuinely pending", () => {
    mockMatchMedia(false); // real motion
    renderIndicator("upload", true);
    expect(screen.getByText("Загрузка").getAttribute("data-blink")).toBe("true");
  });

  it("reads steady-lit — no blink — when current but idle (pending: false)", () => {
    mockMatchMedia(false);
    renderIndicator("upload", false);
    expect(screen.getByText("Загрузка").hasAttribute("data-blink")).toBe(false);
  });

  it("defaults to steady-lit when pending is omitted entirely", () => {
    mockMatchMedia(false);
    renderIndicator("upload");
    expect(screen.getByText("Загрузка").hasAttribute("data-blink")).toBe(false);
  });

  it("never blinks a done or an upcoming cell, even while pending is true", () => {
    mockMatchMedia(false);
    renderIndicator("verify", true);
    // "Загрузка" (upload) is done, "Диагноз" (diagnosis) is upcoming —
    // pending only ever describes the CURRENT step ("Проверка" here).
    expect(screen.getByText("Загрузка").hasAttribute("data-blink")).toBe(false);
    expect(screen.getByText("Диагноз").hasAttribute("data-blink")).toBe(false);
    expect(screen.getByText("Проверка").getAttribute("data-blink")).toBe("true");
  });

  it("under reduced motion, never blinks even when current and pending", () => {
    mockMatchMedia(true);
    renderIndicator("upload", true);
    // blinkPending's own reduced-motion contract: data-blink is set to the
    // literal string "false", never "true", and no strobe runs.
    expect(screen.getByText("Загрузка").getAttribute("data-blink")).toBe("false");
  });
});
