import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Footnotes } from "@/components/results/footnotes";
import ruMessages from "@/messages/ru.json";
import enMessages from "@/messages/en.json";

const LOCALES = [
  { locale: "ru" as const, messages: ruMessages, href: "/methodology" },
  { locale: "en" as const, messages: enMessages, href: "/en/methodology" },
];

describe("Footnotes", () => {
  for (const { locale, messages, href } of LOCALES) {
    it(`locale=${locale}: links to the full /methodology page`, () => {
      const sources = new Map([["Damodaran (NYU Stern), Jan 2026", 1]]);
      render(
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Footnotes sources={sources} />
        </NextIntlClientProvider>,
      );
      const link = screen.getByRole("link", {
        name: messages.Results.footnotes.methodologyLinkLabel,
      });
      expect(link).toHaveAttribute("href", href);
    });

    it(`locale=${locale}: renders nothing (no methodology link either) when there are no footnote sources`, () => {
      const { container } = render(
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Footnotes sources={new Map()} />
        </NextIntlClientProvider>,
      );
      expect(container).toBeEmptyDOMElement();
    });

    it(`locale=${locale}: shows the KZ partial-coverage note only when hasKzOverlay is true (Phase 7 Task 5)`, () => {
      const sources = new Map([["Нацбанк РК / МВФ", 1]]);
      const { rerender } = render(
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Footnotes sources={sources} />
        </NextIntlClientProvider>,
      );
      expect(
        screen.queryByText(messages.Results.footnotes.kzPartialCoverageNote),
      ).not.toBeInTheDocument();

      rerender(
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Footnotes sources={sources} hasKzOverlay />
        </NextIntlClientProvider>,
      );
      expect(
        screen.getByText(messages.Results.footnotes.kzPartialCoverageNote),
      ).toBeInTheDocument();
    });
  }
});
