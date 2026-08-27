import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ruMessages from "@/messages/ru.json";

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));

// SiteHeader's landing-route check reads next-intl's usePathname — mock
// just that export so the rest of "@/i18n/navigation" (Link, etc., used
// transitively by LocaleSwitch/ThemeToggle) keeps working normally.
vi.mock("@/i18n/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/i18n/navigation")>();
  return { ...actual, usePathname };
});

const { SiteHeader } = await import("@/components/site-header");

function renderHeader() {
  return render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <SiteHeader />
    </NextIntlClientProvider>,
  );
}

describe("SiteHeader", () => {
  it("renders nothing on the landing route — its header row lives merged into the hero band instead, so the page shows only one wordmark", () => {
    usePathname.mockReturnValue("/");
    const { container } = renderHeader();
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(ruMessages.Header.wordmark)).not.toBeInTheDocument();
  });

  it("renders the paper header with the wordmark on every other route", () => {
    usePathname.mockReturnValue("/analyze");
    renderHeader();
    expect(
      screen.getByRole("link", { name: ruMessages.Header.wordmark }),
    ).toBeInTheDocument();
  });
});
