import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { MethodologyDocument } from "@/components/methodology/methodology-document";
import methodologyData from "@/lib/methodology-data.json";
import ruMessages from "@/messages/ru.json";
import enMessages from "@/messages/en.json";
import type { MethodologyData } from "@/lib/methodology-types";

const data = methodologyData as MethodologyData;

const LOCALES = [
  { locale: "ru" as const, messages: ruMessages },
  { locale: "en" as const, messages: enMessages },
];

describe("MethodologyDocument", () => {
  for (const { locale, messages } of LOCALES) {
    describe(`locale=${locale}`, () => {
      it("renders every ratio key from methodology-data.json — no ratio silently dropped", () => {
        render(
          <NextIntlClientProvider locale={locale} messages={messages}>
            <MethodologyDocument locale={locale} />
          </NextIntlClientProvider>,
        );
        for (const ratio of data.ratios) {
          const row = document.querySelector(`[data-ratio-key="${ratio.key}"]`);
          expect(row, `missing row for ratio ${ratio.key}`).not.toBeNull();
          expect(row).toHaveTextContent(ratio.name);
          expect(row).toHaveTextContent(ratio.formula);
        }
      });

      it("renders the Beneish ≥6-of-8 policy disclosure, verbatim from the engine", () => {
        render(
          <NextIntlClientProvider locale={locale} messages={messages}>
            <MethodologyDocument locale={locale} />
          </NextIntlClientProvider>,
        );
        const policyBlock = screen.getByTestId("beneish-policy");
        expect(policyBlock).toHaveTextContent(
          String(data.beneish.policy.min_available),
        );
        expect(policyBlock).toHaveTextContent(
          data.beneish.policy.example_insufficient_disclosure,
        );
        expect(policyBlock).toHaveTextContent(
          data.beneish.policy.example_substituted_disclosure,
        );
      });

      it("renders every industry benchmark source citation", () => {
        render(
          <NextIntlClientProvider locale={locale} messages={messages}>
            <MethodologyDocument locale={locale} />
          </NextIntlClientProvider>,
        );
        for (const source of data.benchmarks.sources) {
          const link = screen.getByRole("link", { name: source.url });
          expect(link).toHaveAttribute("href", source.url);
        }
        // The Damodaran citation specifically — the honest source behind
        // every "band-around-center-v1" benchmark.
        expect(
          screen.getAllByText((text) => text.includes("Damodaran")).length,
        ).toBeGreaterThan(0);
      });

      it("renders the Altman public/private formulas and thresholds", () => {
        render(
          <NextIntlClientProvider locale={locale} messages={messages}>
            <MethodologyDocument locale={locale} />
          </NextIntlClientProvider>,
        );
        expect(screen.getByText(data.altman.public.formula)).toBeInTheDocument();
        expect(screen.getByText(data.altman.private.formula)).toBeInTheDocument();
      });

      it("renders every Piotroski signal name", () => {
        render(
          <NextIntlClientProvider locale={locale} messages={messages}>
            <MethodologyDocument locale={locale} />
          </NextIntlClientProvider>,
        );
        for (const signal of data.piotroski.signals) {
          expect(
            document.querySelector(`[data-piotroski-signal="${signal.key}"]`),
          ).toHaveTextContent(signal.name);
        }
      });

      it("labels the Beneish thresholds list with its own heading (fix-wave F5c — was an orphaned i18n key)", () => {
        render(
          <NextIntlClientProvider locale={locale} messages={messages}>
            <MethodologyDocument locale={locale} />
          </NextIntlClientProvider>,
        );
        const m = (messages as typeof ruMessages).Methodology.riskModels.beneish;
        expect(screen.getByText(m.thresholdsHeading)).toBeInTheDocument();
      });

      it("renders the closing Принципы block with all three honesty commitments", () => {
        render(
          <NextIntlClientProvider locale={locale} messages={messages}>
            <MethodologyDocument locale={locale} />
          </NextIntlClientProvider>,
        );
        const m = (messages as typeof ruMessages).Methodology.principles;
        expect(screen.getByText(m.determinism)).toBeInTheDocument();
        expect(screen.getByText(m.noLlmInNumbers)).toBeInTheDocument();
        expect(screen.getByText(m.naDiscipline)).toBeInTheDocument();
      });
    });
  }
});
