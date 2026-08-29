import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { DocumentControls } from "@/components/analyze/document-controls";
import ruMessages from "@/messages/ru.json";
import enMessages from "@/messages/en.json";
import type { Industry } from "@/lib/api-types";

const industries: Industry[] = [
  { id: "manufacturing", name: "Производство", name_en: "Manufacturing", note: "", note_en: "" },
  { id: "retail", name: "Розничная торговля и e-commerce", name_en: "Retail and e-commerce", note: "", note_en: "" },
];

function renderControls(
  overrides: Partial<React.ComponentProps<typeof DocumentControls>> = {},
  locale: "ru" | "en" = "ru",
) {
  render(
    <NextIntlClientProvider locale={locale} messages={locale === "ru" ? ruMessages : enMessages}>
      <DocumentControls
        industry="manufacturing"
        industries={industries}
        suggestedIndustry={null}
        scale="units"
        currency="KZT"
        audited={false}
        latestPeriod="2024"
        previousPeriod="2023"
        locale={locale}
        onIndustryChange={vi.fn()}
        onApplySuggested={vi.fn()}
        onScaleChange={vi.fn()}
        onCurrencyChange={vi.fn()}
        onAuditedChange={vi.fn()}
        {...overrides}
      />
    </NextIntlClientProvider>,
  );
}

// Founder feedback R1: "Although I was in English, the industry is still
// in Russian" — this is Step 2's own industry select (verify step's
// document settings), the second of the two industry comboboxes the
// founder could have hit (see upload-step.test.tsx for Step 1's).
describe("DocumentControls — industry combobox locale", () => {
  it("ru locale (default): renders the RU industry name, both in the trigger and the option list", () => {
    renderControls();

    expect(screen.getByText("Производство")).toBeInTheDocument();

    // Scoped by label: DocumentControls renders two comboboxes side by
    // side (industry + scale) — an unscoped role query would be ambiguous.
    fireEvent.click(screen.getByLabelText(ruMessages.Analyze.verify.controls.industryLabel));
    expect(screen.getByRole("option", { name: "Розничная торговля и e-commerce" })).toBeInTheDocument();
  });

  it("en locale: renders the EN industry name, not the RU one", () => {
    renderControls({}, "en");

    expect(screen.getByText("Manufacturing")).toBeInTheDocument();
    expect(screen.queryByText("Производство")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(enMessages.Analyze.verify.controls.industryLabel));
    expect(screen.getByRole("option", { name: "Retail and e-commerce" })).toBeInTheDocument();
    expect(screen.queryByText("Розничная торговля и e-commerce")).not.toBeInTheDocument();
  });
});
