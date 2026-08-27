import { useTranslations } from "next-intl";
import { SegmentDisplay } from "@/components/segment-display";
import { AnnunciatorCell } from "@/components/annunciator-cell";
import { OriginTicket } from "@/components/origin-ticket";
import { ConfidenceMeter } from "@/components/confidence-meter";
import { ConfidenceDisclosure } from "./confidence-disclosure";
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

// The score's digit width: up to "100.0" (3 integer digits + 1 decimal, 4
// digit-cells total — the decimal point rides on its own cell per
// SegmentDisplay's dp convention) — every reading below that pads with
// ghost leading cells rather than resizing the instrument.
const SCORE_DIGITS = 4;

const SCALE_KEY: Record<
  string,
  "scaleUnits" | "scaleThousands" | "scaleMillions" | "scaleBillions"
> = {
  units: "scaleUnits",
  thousands: "scaleThousands",
  millions: "scaleMillions",
  billions: "scaleBillions",
};

// The «заключение» block, re-skinned as the monitor's own instrument
// cluster: the score ignites as a large SegmentDisplay (data-score-display,
// results-document.tsx's load-time timeline drives its cascade the same
// way it used to drive ScoreDial's data-score-arc), then the verdict lights
// as an AnnunciatorCell a beat later — "stamp moment → verdict lights,"
// the same one-two rhythm the old arc-then-stamp opening had. The verdict
// keeps a real <h1> (sr-only — AnnunciatorCell's own label text is
// aria-hidden in favor of its role="status" aria-label, so the document
// still needs one genuine heading landmark) wired to data-verdict-stamp,
// the wrapper results-document.tsx's opening timeline fades/scales in.
// When overall_score is null this is also where the insufficient-data
// state composes its guidance — designed absence (ghost segment cells),
// not a blank dial with nothing to act on.
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
        <span data-score-display className="grid-paper inline-flex p-4">
          <SegmentDisplay
            value={analysis.overall_score}
            decimals={1}
            digits={SCORE_DIGITS}
            locale={locale}
            className="text-6xl sm:text-7xl"
            caption={insufficientData ? undefined : analysis.health_label}
            naLabel={insufficientData ? analysis.health_label : undefined}
          />
        </span>
        <div className="flex-1 space-y-4">
          <div data-verdict-stamp>
            <h1 className="sr-only">{analysis.health_label}</h1>
            <AnnunciatorCell status={verdictTone(analysis.overall_score)} label={analysis.health_label} />
          </div>
          <div className="flex flex-wrap gap-2">
            <OriginTicket>{analysis.industry_name}</OriginTicket>
            {period && <OriginTicket>{period}</OriginTicket>}
            {analysis.currency && <OriginTicket>{analysis.currency}</OriginTicket>}
            <OriginTicket>{tScale(SCALE_KEY[analysis.scale])}</OriginTicket>
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
