import { useTranslations } from "next-intl";
import { MetricNumber } from "@/components/metric-number";
import { StatusPill } from "@/components/status-pill";
import { NormBand } from "@/components/norm-band";
import { SpecimenChip } from "@/components/specimen-chip";
import { ConfidenceMeter } from "@/components/confidence-meter";
import {
  classifyProvenance,
  traceRatioInputs,
  truncateSnippet,
  type RatioInputTrace,
} from "@/lib/results";
import { ratioInputDisplayName } from "@/lib/metric-names";
import type { ExtractedValue, RatioResult } from "@/lib/api-types";
import type { Locale } from "@/lib/format";

export interface RatioRowProps {
  ratio: RatioResult;
  locale: Locale;
  /** 1-based footnote number for this ratio's benchmark.source, when it has
   * one — assigned by lib/results.ts's buildFootnoteIndex across the whole
   * document so a shared source keeps a shared number. */
  footnoteNumber?: number;
  /** The analysis's source_values — matched against this ratio's inputs to
   * render the provenance trace. Empty (default) on analyses stored before
   * that field existed, in which case the trace section renders nothing. */
  sourceValues?: ExtractedValue[];
}

// One traced input, in one of three honest states — a document-sourced
// value (original wording, location, raw excerpt, confidence), a derived
// figure (an average, a subtotal, an alias) that was never read directly,
// or a dictionary metric extraction.py looked for and never found (a
// null-value stub — never a fabricated 0% reading). The three must not
// look alike: only "sourced" carries a confidence signal at all.
function ProvenanceRow({ trace, locale }: { trace: RatioInputTrace; locale: Locale }) {
  const t = useTranslations("Results.ratios");
  // Prefer the matched source's own `metric` field over the raw
  // `ratio.inputs` key: for an aliased passthrough like "ebit" (see
  // INPUT_KEY_ALIASES), the match is real but the input key itself isn't a
  // METRIC_NAMES entry — the row must display under the metric's real
  // identity (e.g. "operating_income" → «Операционная прибыль (EBIT)»),
  // not the raw alias. Falls back through DERIVED_NAMES (working_capital,
  // net_debt, ...) when there's no source match at all (the derived case)
  // — see ratioInputDisplayName — rather than the raw snake_case key.
  const displayName = ratioInputDisplayName(trace.source?.metric ?? trace.key, locale);
  const status = classifyProvenance(trace);

  if (status === "derived") {
    return (
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-ink-muted">{displayName}</span>
        <SpecimenChip>{t("provenanceDerived")}</SpecimenChip>
      </div>
    );
  }

  if (status === "not_found") {
    return (
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-ink-muted">{displayName}</span>
        <SpecimenChip>{t("provenanceNotFound")}</SpecimenChip>
      </div>
    );
  }

  // status === "sourced" — trace.source is non-null with a real value here.
  const source = trace.source as ExtractedValue;
  const snippet = truncateSnippet(source.snippet);

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-ink">{displayName}</span>
        {source.manually_edited ? (
          <SpecimenChip tone="accent">{t("provenanceManuallyEdited")}</SpecimenChip>
        ) : (
          <ConfidenceMeter
            value={source.confidence}
            locale={locale}
            label={t("provenanceConfidenceLabel", { metric: displayName })}
            naLabel={t("naLabel")}
          />
        )}
      </div>
      {source.original_label && (
        <p>
          <span className="font-mono text-xs uppercase tracking-wide text-ink-muted">
            {t("provenanceAsWrittenLabel")}:
          </span>{" "}
          <span className="text-ink-muted">«{source.original_label}»</span>
        </p>
      )}
      {source.source && (
        <p className="font-mono text-xs text-ink-muted">
          {t("provenanceSourceLabel")}: <span className="text-ink">{source.source}</span>
        </p>
      )}
      {source.snippet && (
        <p className="font-mono text-xs text-ink-muted" title={snippet.full}>
          {t("provenanceSnippetLabel")}:{" "}
          <span className="text-ink">«{snippet.display}»</span>
        </p>
      )}
    </div>
  );
}

// Money-unit ratios are informational only (API: always status "na",
// score null) — a bare "Н/Д" pill would read as a data gap rather than the
// deliberate "not scored" choice it is, so it gets its own «справочно»
// marker instead of the status pill.
export function RatioRow({ ratio, locale, footnoteNumber, sourceValues = [] }: RatioRowProps) {
  const t = useTranslations("Results.ratios");
  const tStatus = useTranslations("Status");
  const isMoney = ratio.unit === "money";
  // Absent entirely (not just empty) on analyses stored before source_values
  // existed — traces stay empty in that case, and the section below simply
  // doesn't render. No crash: traceRatioInputs only ever reads sourceValues.
  const traces = sourceValues.length > 0 ? traceRatioInputs(ratio, sourceValues) : [];

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
                className="text-brand no-underline hover:underline"
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
          {traces.length > 0 && (
            <div>
              <span className="font-mono text-xs uppercase tracking-wide text-ink-muted">
                {t("provenanceHeading")}
              </span>
              <ul className="mt-1 space-y-2">
                {traces.map((trace) => (
                  <li key={trace.key} className="border-t border-line pt-2 first:border-t-0 first:pt-0">
                    <ProvenanceRow trace={trace} locale={locale} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
