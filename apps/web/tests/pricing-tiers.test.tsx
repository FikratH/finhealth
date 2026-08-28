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

  it("renders the Free tier's price as a segment figure (finish-wave fix 1) and every feature line verbatim from messages", () => {
    renderTiers();
    expect(screen.getByText(free.title)).toBeInTheDocument();
    // The price is a SegmentDisplay now, not a plain text node — its
    // accessible name combines the formatted value with the shared
    // priceCaption ("Цена"), the same "{value} — {caption}" pattern
    // score-header.tsx's own SegmentDisplay usage follows.
    expect(
      screen.getByRole("img", { name: `${free.price} — ${ruMessages.Pricing.priceCaption}` }),
    ).toBeInTheDocument();
    expect(screen.getByText(free.feature1)).toBeInTheDocument();
    expect(screen.getByText(free.feature2)).toBeInTheDocument();
    expect(screen.getByText(free.feature3)).toBeInTheDocument();
  });

  it("Free's CTA links to /analyze", () => {
    renderTiers();
    const link = screen.getByRole("link", { name: free.cta });
    expect(link).toHaveAttribute("href", "/analyze");
  });

  it("renders the Pro tier's price as a segment figure with its currency/period as plain adjuncts, the launch-pricing note, and every feature line", () => {
    renderTiers();
    expect(screen.getByText(pro.title)).toBeInTheDocument();
    // $ and /мес stay plain PT Mono text OUTSIDE the segment mask — only
    // the bare numeral goes into SegmentDisplay (DESIGN.md: "a segment
    // mask carries numeric figures only").
    expect(screen.getByText(pro.priceCurrency)).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: `${pro.price} — ${ruMessages.Pricing.priceCaption}` }),
    ).toBeInTheDocument();
    expect(screen.getByText(pro.pricePeriod)).toBeInTheDocument();
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
