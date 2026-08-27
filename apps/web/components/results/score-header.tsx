import { useTranslations } from "next-intl";
import { ScoreDial } from "@/components/score-dial";
import { SpecimenChip } from "@/components/specimen-chip";
import { ConfidenceMeter } from "@/components/confidence-meter";
import type { AnalysisResult } from "@/lib/api-types";
import type { Locale } from "@/lib/format";

export interface ScoreHeaderProps {
  analysis: AnalysisResult;
  locale: Locale;
}

const SCALE_KEY: Record<
  string,
  "scaleUnits" | "scaleThousands" | "scaleMillions" | "scaleBillions"
> = {
  units: "scaleUnits",
  thousands: "scaleThousands",
  millions: "scaleMillions",
  billions: "scaleBillions",
};

// The «заключение» (stamped conclusion) block: rule-framed, the health
// label reads as the verdict (no eyebrow above it — the craft floor bans
// kickers outright), the disclaimer sits beneath. When overall_score is
// null this is also where the insufficient-data state composes its
// guidance — designed absence, not a blank dial with nothing to act on.
export function ScoreHeader({ analysis, locale }: ScoreHeaderProps) {
  const t = useTranslations("Results.header");
  const tScale = useTranslations("Analyze.verify.controls");
  const insufficientData = analysis.overall_score === null;
  const period = analysis.previous_period
    ? `${analysis.previous_period} → ${analysis.latest_period}`
    : analysis.latest_period;

  return (
    <section className="grid-paper border-2 border-ink p-6 sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <ScoreDial score={analysis.overall_score} locale={locale} size={180} />
        <div className="flex-1 space-y-4">
          <h1 className="font-display text-3xl text-ink sm:text-4xl">
            {analysis.health_label}
          </h1>
          <div className="flex flex-wrap gap-2">
            <SpecimenChip>{analysis.industry_name}</SpecimenChip>
            {period && <SpecimenChip>{period}</SpecimenChip>}
            {analysis.currency && <SpecimenChip>{analysis.currency}</SpecimenChip>}
            <SpecimenChip>{tScale(SCALE_KEY[analysis.scale])}</SpecimenChip>
          </div>
          <ConfidenceMeter
            value={analysis.confidence.total}
            locale={locale}
            label={t("confidenceLabel")}
            className="max-w-xs"
          />
          {insufficientData && analysis.missing_metrics.length > 0 && (
            <div className="border-t border-line pt-4">
              <p className="text-sm text-ink">{t("insufficientGuidance")}</p>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-ink-muted">
                {analysis.missing_metrics.map((metric) => (
                  <li key={metric}>{metric}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      <p className="mt-6 border-t border-line pt-4 text-sm text-ink-muted">
        {analysis.disclaimer}
      </p>
    </section>
  );
}
