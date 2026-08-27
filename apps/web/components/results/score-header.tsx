import { useTranslations } from "next-intl";
import { ScoreDial } from "@/components/score-dial";
import { SpecimenChip } from "@/components/specimen-chip";
import { ConfidenceMeter } from "@/components/confidence-meter";
import { ConfidenceDisclosure } from "./confidence-disclosure";
import { cn } from "@/lib/utils";
import { verdictTone } from "@/lib/verdict";
import type { AnalysisResult } from "@/lib/api-types";
import type { Locale } from "@/lib/format";

export interface ScoreHeaderProps {
  analysis: AnalysisResult;
  locale: Locale;
  /** Anchor id for the mini-nav's first entry — the заключение is the
   * document's own top, not a scroll-revealed section, so it isn't
   * wrapped in RevealSection like the rest of results-document.tsx. */
  id?: string;
}

const STAMP_TONE_CLASS: Record<ReturnType<typeof verdictTone>, string> = {
  good: "border-good text-good",
  attention: "border-attention text-attention",
  critical: "border-critical text-critical",
  na: "border-ink text-ink",
};

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
// kickers outright). A disclaimer line is placed beneath it here (a
// deliberate choice, not a design-direction quote — it's echoed again as
// its own closing section further down the document). When overall_score
// is null this is also where the insufficient-data state composes its
// guidance — designed absence, not a blank dial with nothing to act on.
export function ScoreHeader({ analysis, locale, id }: ScoreHeaderProps) {
  const t = useTranslations("Results.header");
  const tScale = useTranslations("Analyze.verify.controls");
  const insufficientData = analysis.overall_score === null;
  const period = analysis.previous_period
    ? `${analysis.previous_period} → ${analysis.latest_period}`
    : analysis.latest_period;

  return (
    <section id={id} className="grid-paper border-2 border-ink p-6 sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <ScoreDial
          score={analysis.overall_score}
          locale={locale}
          size={180}
          caption={analysis.health_label}
        />
        <div className="flex-1 space-y-4">
          {/* The stamped conclusion: an honest-ink seal, not simulated
           * rubber — a bordered, uppercase, letter-spaced label in a flat
           * status ink, tilted slightly like a hand-applied stamp. No
           * texture, no gradient, no shadow. */}
          <h1
            data-verdict-stamp
            className={cn(
              "inline-block -rotate-[1.5deg] border-4 border-double px-5 py-2 text-center font-display text-xl uppercase tracking-[0.2em] sm:text-2xl",
              STAMP_TONE_CLASS[verdictTone(analysis.overall_score)],
            )}
          >
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
          <ConfidenceDisclosure confidence={analysis.confidence} locale={locale} />
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
