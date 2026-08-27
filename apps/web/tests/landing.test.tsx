import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { LandingHero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Trust } from "@/components/landing/trust";
import { PrivacyStrip } from "@/components/landing/privacy-strip";
import ruMessages from "@/messages/ru.json";
import enMessages from "@/messages/en.json";

const LOCALES = [
  {
    locale: "ru" as const,
    messages: ruMessages,
    netMarginText: "4,58%",
    analyzeHref: "/analyze",
  },
  {
    locale: "en" as const,
    messages: enMessages,
    netMarginText: "4.58%",
    // routing.ts uses localePrefix "as-needed" with ru as the default
    // locale, so only the non-default locale's links carry a prefix.
    analyzeHref: "/en/analyze",
  },
];

describe("Landing page sections", () => {
  for (const { locale, messages, netMarginText, analyzeHref } of LOCALES) {
    describe(`locale=${locale}`, () => {
      it("renders exactly one h1: the hero offer", () => {
        render(
          <NextIntlClientProvider locale={locale} messages={messages}>
            <LandingHero />
          </NextIntlClientProvider>,
        );
        const headings = screen.getAllByRole("heading", { level: 1 });
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveTextContent(messages.Landing.hero.h1);
      });

      it("exposes the primary action as a link to /analyze", () => {
        render(
          <NextIntlClientProvider locale={locale} messages={messages}>
            <LandingHero />
          </NextIntlClientProvider>,
        );
        const cta = screen.getByRole("link", {
          name: messages.Landing.hero.cta,
        });
        expect(cta).toHaveAttribute("href", analyzeHref);
      });

      it("shows the real demo net_margin value from the analysis fixture, formatted for the locale", () => {
        render(
          <NextIntlClientProvider locale={locale} messages={messages}>
            <LandingHero />
          </NextIntlClientProvider>,
        );
        // Appears twice by design: once as the large MetricNumber result,
        // once restated in NormBand's small-print value+range+flag line.
        expect(screen.getAllByText(netMarginText)).toHaveLength(2);
        // labeled as demo data, per PRODUCT.md's no-invented-claims rule.
        expect(
          screen.getByText(messages.Landing.reportFragment.demoLabel),
        ).toBeInTheDocument();
      });

      it("renders the three-step protocol with all steps equally emphasized (always-lit)", () => {
        render(
          <NextIntlClientProvider locale={locale} messages={messages}>
            <HowItWorks />
          </NextIntlClientProvider>,
        );
        const items = screen.getAllByRole("listitem");
        expect(items).toHaveLength(3);
        expect(
          screen.getByRole("heading", {
            level: 3,
            name: messages.Landing.howItWorks.stepOneTitle,
          }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("heading", {
            level: 3,
            name: messages.Landing.howItWorks.stepThreeTitle,
          }),
        ).toBeInTheDocument();
      });

      it("renders the trust/methodology points and the benchmark footnote", () => {
        render(
          <NextIntlClientProvider locale={locale} messages={messages}>
            <Trust />
          </NextIntlClientProvider>,
        );
        expect(
          screen.getByText(messages.Landing.trust.pointDeterministic),
        ).toBeInTheDocument();
        expect(
          screen.getByText(messages.Landing.trust.footnote),
        ).toBeInTheDocument();
      });

      it("renders the privacy strip's honest deletion disclosure", () => {
        render(
          <NextIntlClientProvider locale={locale} messages={messages}>
            <PrivacyStrip />
          </NextIntlClientProvider>,
        );
        expect(
          screen.getByText(messages.Landing.privacy.body),
        ).toBeInTheDocument();
      });
    });
  }
});
