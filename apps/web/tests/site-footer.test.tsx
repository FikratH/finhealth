import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ruMessages from "@/messages/ru.json";
import { SiteFooter } from "@/components/site-footer";

function renderFooter() {
  return render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <SiteFooter />
    </NextIntlClientProvider>,
  );
}

describe("SiteFooter", () => {
  it("renders the disclaimer", () => {
    renderFooter();
    expect(screen.getByText(ruMessages.Footer.disclaimer)).toBeInTheDocument();
  });

  it("renders a Pricing link to /pricing (P6.T6)", () => {
    renderFooter();
    const link = screen.getByRole("link", { name: ruMessages.Footer.pricing });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/pricing");
  });
});
