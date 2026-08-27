import { useTranslations } from "next-intl";
import { SectionHeading } from "@/components/section-heading";
import { ScoreHeader } from "./score-header";
import { CategoryScores } from "./category-scores";
import { RatioSection } from "./ratio-section";
import { RiskRadar } from "./risk-radar";
import { StrengthsRisks } from "./strengths-risks";
import { Recommendations } from "./recommendations";
import { WarningsAccordion } from "./warnings-accordion";
import { MissingMetricsHint } from "./missing-metrics-hint";
import { Footnotes } from "./footnotes";
import { ShareButton } from "./share-button";
import { buildFootnoteIndex } from "@/lib/results";
import type { AnalysisResult } from "@/lib/api-types";
import type { Locale } from "@/lib/format";

export interface ResultsDocumentProps {
  analysis: AnalysisResult;
  locale: Locale;
}

// The diagnosis document: one continuous page the score header, category
// bars, ratio sections, risk radar, and prescriptions all belong to — not
// a dashboard of separately-scrolling cards. Phase 4 replaces this
// presentation with the scroll cinema; this component is the data layer
// Phase 4 reuses, so it stays a plain, print-friendly document in the
// meantime.
export function ResultsDocument({ analysis, locale }: ResultsDocumentProps) {
  const tRatios = useTranslations("Results.ratios");
  const tDisclaimer = useTranslations("Results.disclaimer");
  const footnoteIndex = buildFootnoteIndex(analysis.ratios);

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-6 py-10">
      <div className="flex justify-end">
        <ShareButton />
      </div>

      <ScoreHeader analysis={analysis} locale={locale} />

      <CategoryScores categories={analysis.category_scores} locale={locale} />

      <section className="space-y-6">
        <SectionHeading>{tRatios("heading")}</SectionHeading>
        {analysis.category_scores.map((category) => (
          <RatioSection
            key={category.category}
            category={category}
            ratios={analysis.ratios.filter((ratio) => ratio.category === category.category)}
            locale={locale}
            footnoteIndex={footnoteIndex}
          />
        ))}
      </section>

      {analysis.risk_radar && <RiskRadar riskRadar={analysis.risk_radar} locale={locale} />}

      <StrengthsRisks strengths={analysis.strengths} risks={analysis.risks} />

      <Recommendations recommendations={analysis.recommendations} locale={locale} />

      <WarningsAccordion warnings={analysis.warnings} />

      {/* The insufficient-data state's guidance panel (in ScoreHeader)
       * already lists these same missing_metrics — skip the duplicate. */}
      {analysis.overall_score !== null && (
        <MissingMetricsHint missingMetrics={analysis.missing_metrics} />
      )}

      <Footnotes sources={footnoteIndex} />

      <section className="border-2 border-ink p-6">
        <h2 className="font-display text-xl text-ink">{tDisclaimer("heading")}</h2>
        <p className="mt-2 text-sm text-ink-muted">{analysis.disclaimer}</p>
      </section>
    </div>
  );
}
