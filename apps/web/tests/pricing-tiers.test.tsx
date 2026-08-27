import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ruMessages from "@/messages/ru.json";

// WaitlistForm itself is fully covered by tests/waitlist-form.test.tsx — a
// thin stub here keeps this a focused render test of the tier layout/copy,
// not a duplicate of the form's own behavior coverage.
vi.mock("@/components/pricing/waitlist-form", () => ({
  WaitlistForm: () => <div data-testid="waitlist-form-stub" />,
}));

const { PricingTiers } = await import("@/components/pricing/pricing-tiers");

function renderTiers() {
  return render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <PricingTiers />
    </NextIntlClientProvider>,
  );
}

const { free, pro } = ruMessages.Pricing;

describe("PricingTiers", () => {
  it("renders exactly one h1, the page heading", () => {
    renderTiers();
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(ruMessages.Pricing.heading);
  });

  it("renders the Free tier's price and every feature line verbatim from messages", () => {
    renderTiers();
    expect(screen.getByText(free.title)).toBeInTheDocument();
    expect(screen.getByText(free.price)).toBeInTheDocument();
    expect(screen.getByText(free.feature1)).toBeInTheDocument();
    expect(screen.getByText(free.feature2)).toBeInTheDocument();
    expect(screen.getByText(free.feature3)).toBeInTheDocument();
  });

  it("Free's CTA links to /analyze", () => {
    renderTiers();
    const link = screen.getByRole("link", { name: free.cta });
    expect(link).toHaveAttribute("href", "/analyze");
  });

  it("renders the Pro tier's price, launch-pricing note, and every feature line", () => {
    renderTiers();
    expect(screen.getByText(pro.title)).toBeInTheDocument();
    expect(screen.getByText(pro.price)).toBeInTheDocument();
    expect(screen.getByText(pro.priceNote)).toBeInTheDocument();
    expect(screen.getByText(pro.feature1)).toBeInTheDocument();
    expect(screen.getByText(pro.feature2)).toBeInTheDocument();
    expect(screen.getByText(pro.feature3)).toBeInTheDocument();
    expect(screen.getByText(pro.feature4)).toBeInTheDocument();
  });

  it("embeds the waitlist form in the Pro panel (not a second /analyze CTA)", () => {
    renderTiers();
    expect(screen.getByTestId("waitlist-form-stub")).toBeInTheDocument();
  });
});
