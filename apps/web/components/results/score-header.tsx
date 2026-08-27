import { useTranslations } from "next-intl";
import { SegmentDisplay } from "@/components/segment-display";
import { AnnunciatorCell } from "@/components/annunciator-cell";
import { OriginTicket } from "@/components/origin-ticket";
import { ConfidenceMeter } from "@/components/confidence-meter";
import { ConfidenceDisclosure } from "./confidence-disclosure";
import { verdictTone } from "@/lib/verdict";
import { formatNumber, type Locale } from "@/lib/format";
import type { AnalysisResult } from "@/lib/api-types";

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
// keeps a real <h1> (sr-only) wired to data-verdict-stamp, the wrapper
// results-document.tsx's opening timeline fades/scales in — the document's
// one genuine heading landmark for the verdict. The AnnunciatorCell beside
// it renders aria-hidden (its own role="img" aria-label would otherwise
// name the same verdict a second time, adjacently — finish review,
// material_fixes 5; see AnnunciatorCell's own header comment).
// The score's own `caption` names the READING ("Общий балл"/"Overall
// score"), never the verdict — the verdict is already announced by the
// sr-only h1, and repeating it a third time inside the score's own name
// would just be noise (review finding 9); a metric-naming caption instead
// gives the bare figure a meaningful accessible name without
// reintroducing that duplication (review finding N2). When overall_score
// is null this is
// also where the insufficient-data state composes its guidance — designed
// absence (ghost segment cells), not a blank dial with nothing to act on.
// The null-score accessible name (review finding N4): `caption` stays the
// reading's own name ("Общий балл") unconditionally, and `naLabel` swaps
// in Results.ratios' shared «Н/Д» token instead of reusing the caption
// text for both slots — SegmentDisplay composes them as "Н/Д — Общий
// балл", so the absence is announced, not silently collapsed into the
// bare metric name.
//
// Print: SegmentDisplay's animated mask paints every bar as a
// background-color, which every major print engine drops by default
// (no print-color-adjust in this codebase, and none is being added — the
// paper register gets its own plain figure instead, more in keeping with
// "print is deliberately the paper world" than forcing screen-only LED
// paint to survive onto it). The mask is print:hidden; a plain
// STIX-in-print numeral (matching the printed document's own display
// voice, globals.css's print block) stands in, formatted the same way
// SegmentDisplay's own accessible name is, "—" for a null score.
export function ScoreHeader({ analysis, locale, id }: ScoreHeaderProps) {
  const t = useTranslations("Results.header");
  const tScale = useTranslations("Analyze.verify.controls");
  const tRatios = useTranslations("Results.ratios");
  const insufficientData = analysis.overall_score === null;
  const period = analysis.previous_period
    ? `${analysis.previous_period} → ${analysis.latest_period}`
    : analysis.latest_period;

  return (
    <section id={id} className="grid-paper border-2 border-ink p-6 sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <span data-score-display className="inline-flex p-4">
          <SegmentDisplay
            value={analysis.overall_score}
            decimals={1}
            digits={SCORE_DIGITS}
            locale={locale}
            className="text-6xl sm:text-7xl print:hidden"
            caption={t("scoreLabel")}
            naLabel={insufficientData ? tRatios("naLabel") : undefined}
          />
          <span
            aria-hidden="true"
            className="hidden font-display text-6xl text-ink print:inline"
          >
            {formatNumber(analysis.overall_score, { locale, decimals: 1 })}
          </span>
        </span>
        <div className="flex-1 space-y-4">
          <div data-verdict-stamp>
            <h1 className="sr-only">{analysis.health_label}</h1>
            {/* aria-hidden: the sr-only h1 above is the verdict's one real
             * accessible name — see this file's own header comment and
             * AnnunciatorCell's. */}
            <div aria-hidden="true">
              <AnnunciatorCell status={verdictTone(analysis.overall_score)} label={analysis.health_label} />
            </div>
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
