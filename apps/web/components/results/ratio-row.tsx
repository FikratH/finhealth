import { useTranslations } from "next-intl";
import { MetricNumber } from "@/components/metric-number";
import { StatusPill } from "@/components/status-pill";
import { NormBand } from "@/components/norm-band";
import { SpecimenChip } from "@/components/specimen-chip";
import type { RatioResult } from "@/lib/api-types";
import type { Locale } from "@/lib/format";

export interface RatioRowProps {
  ratio: RatioResult;
  locale: Locale;
  /** 1-based footnote number for this ratio's benchmark.source, when it has
   * one — assigned by lib/results.ts's buildFootnoteIndex across the whole
   * document so a shared source keeps a shared number. */
  footnoteNumber?: number;
}

// Money-unit ratios are informational only (API: always status "na",
// score null) — a bare "Н/Д" pill would read as a data gap rather than the
// deliberate "not scored" choice it is, so it gets its own «справочно»
// marker instead of the status pill.
export function RatioRow({ ratio, locale, footnoteNumber }: RatioRowProps) {
  const t = useTranslations("Results.ratios");
  const tStatus = useTranslations("Status");
  const isMoney = ratio.unit === "money";

  return (
    <div className="border-b border-line py-3 last:border-b-0 print:break-inside-avoid">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <span className="text-ink">
          {ratio.name}
          {footnoteNumber !== undefined && (
            <sup className="ml-0.5">
              <a
                href={`#fn-${footnoteNumber}`}
                aria-label={t("sourceFootnoteAria", { n: footnoteNumber })}
                className="text-accent no-underline hover:underline"
              >
                [{footnoteNumber}]
              </a>
            </sup>
          )}
        </span>
        <div className="flex items-center gap-3">
          {isMoney ? (
            <SpecimenChip>{t("referenceOnly")}</SpecimenChip>
          ) : (
            <StatusPill status={ratio.status} label={tStatus(ratio.status)} />
          )}
          <MetricNumber
            value={ratio.value}
            unit={ratio.unit}
            locale={locale}
            naLabel={t("naLabel")}
            muted={isMoney}
            className="text-lg"
          />
        </div>
      </div>

      {ratio.benchmark && (
        <NormBand
          className="mt-2"
          value={ratio.value}
          low={ratio.benchmark.good[0]}
          high={ratio.benchmark.good[1]}
          unit={ratio.unit}
          locale={locale}
          normLabel={t("benchmarkLabel")}
          aboveLabel={t("aboveLabel")}
          belowLabel={t("belowLabel")}
          naLabel={t("naLabel")}
          tone={ratio.status === "attention" ? "attention" : "critical"}
          // Flags follow the API's status, not raw band position: a
          // higher-is-better ratio can sit above its "good" band and still
          // be status "good" — suppress the flag rather than show a red ▲
          // next to a green StatusPill.
          suppressFlag={ratio.status === "good"}
        />
      )}

      <details className="mt-2">
        <summary className="cursor-pointer font-mono text-xs text-ink-muted hover:text-accent">
          {t("detailsToggle")}
        </summary>
        <div className="mt-2 space-y-2 border-t border-line pt-2 text-sm text-ink">
          <p>
            <span className="font-mono text-xs uppercase tracking-wide text-ink-muted">
              {t("formulaLabel")}:
            </span>{" "}
            <code className="font-mono text-ink">{ratio.formula}</code>
          </p>
          {ratio.substitution && (
            <p>
              <span className="font-mono text-xs uppercase tracking-wide text-ink-muted">
                {t("substitutionLabel")}:
              </span>{" "}
              <code className="font-mono text-xs text-ink-muted">
                {ratio.substitution}
              </code>
            </p>
          )}
          <p>
            <span className="font-mono text-xs uppercase tracking-wide text-ink-muted">
              {t("explanationLabel")}:
            </span>{" "}
            {ratio.explanation}
          </p>
          {ratio.warnings.length > 0 && (
            <div>
              <span className="font-mono text-xs uppercase tracking-wide text-ink-muted">
                {t("warningsLabel")}:
              </span>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-muted">
                {ratio.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
