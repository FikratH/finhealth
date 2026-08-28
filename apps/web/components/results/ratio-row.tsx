import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { MetricNumber } from "@/components/metric-number";
import { StatusPill } from "@/components/status-pill";
import { CalibrationScale, isKzOffAxis, type CalibrationScaleTone } from "@/components/calibration-scale";
import { OriginTicket } from "@/components/origin-ticket";
import { ConfidenceMeter } from "@/components/confidence-meter";
import { ChevronRightIcon, TriangleDownIcon, TriangleUpIcon } from "@/components/icons";
import {
  classifyProvenance,
  traceRatioInputs,
  truncateSnippet,
  type RatioInputTrace,
} from "@/lib/results";
import { ratioInputDisplayName } from "@/lib/metric-names";
import type { ExtractedValue, RatioResult, RatioStatus } from "@/lib/api-types";
import type { Locale } from "@/lib/format";

// The cursor reads the ratio's real severity (its API status), not just
// its raw band position — richer than the retired NormBand's flat neutral
// cursor, and never at odds with the StatusPill beside it.
const CALIBRATION_TONE: Record<RatioStatus, CalibrationScaleTone> = {
  good: "good",
  attention: "attention",
  critical: "critical",
  na: "neutral",
};

export interface RatioRowProps {
  ratio: RatioResult;
  locale: Locale;
  /** 1-based footnote number for this ratio's benchmark.source, when it has
   * one — assigned by lib/results.ts's buildFootnoteIndex across the whole
   * document so a shared source keeps a shared number. */
  footnoteNumber?: number;
  /** Same idea, for benchmark_kz.source (Phase 7 Task 5) — a separate
   * number since the KZ overlay usually cites a different source than the
   * global benchmark; shares the same footnote list/numbering space. */
  kzFootnoteNumber?: number;
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
        <OriginTicket>{t("provenanceDerived")}</OriginTicket>
      </div>
    );
  }

  if (status === "not_found") {
    return (
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-ink-muted">{displayName}</span>
        <OriginTicket>{t("provenanceNotFound")}</OriginTicket>
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
          <OriginTicket tone="accent">{t("provenanceManuallyEdited")}</OriginTicket>
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
export function RatioRow({
  ratio,
  locale,
  footnoteNumber,
  kzFootnoteNumber,
  sourceValues = [],
}: RatioRowProps) {
  const t = useTranslations("Results.ratios");
  const tStatus = useTranslations("Status");
  const isMoney = ratio.unit === "money";
  // Round-1 fix, Finding 1: an "economy_wide" KZ mark (the "all" bucket —
  // an aggregate across Kazakhstan's whole non-financial corporate
  // sector, not this ratio's own industry) gets a visibly different label
  // from a genuinely industry-specific one (e.g. banking's own entries),
  // so the scope caveat reaches the row itself, not only a document-level
  // footnote a reader can easily skim past.
  const kzLabel =
    ratio.benchmark_kz?.scope === "economy_wide"
      ? t("benchmarkKzEconomyWideLabel")
      : t("benchmarkKzLabel");
  // Finish review, material_fixes 1: same off-axis test CalibrationScale
  // runs internally to decide whether to render its on-track mark at all
  // (default headroom, since this call site never overrides it) — computed
  // here too so the provenance line can name the absence in text instead
  // of leaving a silently-suppressed mark unexplained.
  const kzOffAxis =
    ratio.benchmark != null &&
    ratio.benchmark_kz != null &&
    isKzOffAxis(ratio.benchmark.good[0], ratio.benchmark.good[1], ratio.benchmark_kz.value);
  // Absent entirely (not just empty) on analyses stored before source_values
  // existed — traces stay empty in that case, and the section below simply
  // doesn't render. No crash: traceRatioInputs only ever reads sourceValues.
  const traces = sourceValues.length > 0 ? traceRatioInputs(ratio, sourceValues) : [];

  // CalibrationScale only knows the reading's position against the band —
  // the same NormBand math this replaces, preserved exactly (fix-wave's
  // "flags follow the API's status, not raw band position" regression
  // guard): a higher-is-better ratio can sit above its "good" band and
  // still be status "good" — suppressFlag keeps that from contradicting
  // the StatusPill beside it with a red ▲.
  const benchmark = ratio.benchmark;
  const above = benchmark != null && ratio.value !== null && ratio.value > benchmark.good[1];
  const below = benchmark != null && ratio.value !== null && ratio.value < benchmark.good[0];
  const suppressFlag = ratio.status === "good";
  const showFlag = benchmark != null && !suppressFlag && (above || below);
  const flagToneClass = ratio.status === "attention" ? "text-attention" : "text-critical";

  const detailsDisclosure = (
    // elevated-surface: the world's active-state glow (globals.css),
    // standing in for a drop shadow — its own [open] CSS selector means
    // it only shows while this block is actually expanded (`details.
    // elevated-surface[open]`) — "floats read above the board" (finish
    // review, material_fixes 3) — rather than a permanent glow on every
    // closed row. No margin of its own: the single `space-y-1` wrapper
    // in the return below is this module's one source of vertical rhythm
    // (fix-wave verdict remainder — a `mt-*` here used to double up with
    // that wrapper's own `space-y-*` whenever this rendered inside the
    // traced-ticket block, silently keeping the gap twice its intended
    // size and reading as a dead corridor no per-value tweak could close).
    <details className="group elevated-surface">
      <summary className="flex cursor-pointer list-none items-center gap-1 font-mono text-xs text-ink-muted hover:text-brand [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon className="transition-transform duration-150 group-open:rotate-90" />
        {t("detailsToggle")}
      </summary>
      <div className="mt-1.5 space-y-2 border-t border-line pt-2 text-sm text-ink">
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
            <code className="font-mono text-xs text-ink-muted">{ratio.substitution}</code>
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
  );

  return (
    <div className="border border-line bg-panel px-4 py-3 print:break-inside-avoid">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <span className="font-mono text-xs uppercase tracking-wide text-ink-muted">
          {ratio.name}
          {footnoteNumber !== undefined && (
            <sup className="ml-0.5 normal-case tracking-normal">
              <a
                href={`#fn-${footnoteNumber}`}
                aria-label={t("sourceFootnoteAria", { n: footnoteNumber })}
                className="text-brand no-underline hover:underline"
              >
                [{footnoteNumber}]
              </a>
            </sup>
          )}
          {kzFootnoteNumber !== undefined && (
            <sup className="ml-0.5 normal-case tracking-normal">
              <a
                href={`#fn-${kzFootnoteNumber}`}
                aria-label={t("sourceFootnoteAriaKz", { n: kzFootnoteNumber })}
                className="text-brand no-underline hover:underline"
              >
                [{kzFootnoteNumber}]
              </a>
            </sup>
          )}
        </span>
        <div className="flex items-center gap-3">
          {isMoney ? (
            <OriginTicket>{t("referenceOnly")}</OriginTicket>
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

      {/* One composed instrument, not three floors with corridors
       * (fix-wave verdict remainder on material_fixes 4): every gap below
       * the header — header→scale, scale→ticket, ticket→details — comes
       * from exactly one `space-y-1` source, this wrapper, matching
       * CalibrationScale's own internal track→bound-labels rhythm (also
       * `mt-1`) so the whole module reads as one density rather than a
       * looser outer rhythm around a tighter inner one. Never crowds the
       * ПРОСЛЕЖЕНО trace wire itself (border-l-2, pl-3) or the ghost
       * grammar — this only closes dead air between blocks, the wire and
       * the calibration scale's own ghost cells are untouched. */}
      <div className="mt-1 space-y-1">
        {ratio.benchmark && (
          <div className="space-y-1">
            <CalibrationScale
              value={ratio.value}
              low={ratio.benchmark.good[0]}
              high={ratio.benchmark.good[1]}
              unit={ratio.unit}
              locale={locale}
              label={t("benchmarkLabel")}
              naLabel={t("naLabel")}
              tone={CALIBRATION_TONE[ratio.status]}
              kz={ratio.benchmark_kz ? { value: ratio.benchmark_kz.value, label: kzLabel } : undefined}
            />
            {ratio.benchmark_kz && (
              // The screen-visible twin of the square mark itself, and
              // (round-1 fix, Findings 4/5) the SOLE print register for
              // this fact — no print:hidden here, so it prints exactly
              // once, carrying `as_of` (which CalibrationScale's own
              // props alone can't). A sighted screen reader needs the
              // mark explained too, hence a real always-rendered line
              // here, in the same font-mono ink-muted register as the
              // bound labels above it. Label is scope-aware (round-1 fix,
              // Finding 1): an "economy_wide" mark says so in the label
              // itself, not only in a document-level footnote — a SaaS
              // row must not read as if this were a SaaS-specific figure.
              <p className="flex items-baseline gap-1.5 font-mono text-xs text-ink-muted">
                {/* No swatch when off-axis (finish review, material_fixes
                 * 1): the little square here is a visual pointer to the
                 * real square on the gauge above — showing it when that
                 * gauge deliberately renders no mark would dangle a
                 * reference to nothing. */}
                {!kzOffAxis && (
                  <span aria-hidden="true" className="inline-block size-2 border border-brand bg-panel" />
                )}
                <span>
                  {kzLabel}:{" "}
                  <MetricNumber
                    value={ratio.benchmark_kz.value}
                    unit={ratio.unit}
                    locale={locale}
                    className="text-xs text-ink-muted"
                  />
                  {" "}({ratio.benchmark_kz.as_of})
                  {kzOffAxis && (
                    // The prescribed fix: a clamped-and-silent mark used
                    // to assert a false on-track position (≈22% for a real
                    // 28,34% benchmark); naming the absence in text, right
                    // where the number already lives, is honest instead.
                    <span> — {t("benchmarkKzOffScale")}</span>
                  )}
                </span>
              </p>
            )}
            {showFlag && (
              <span
                data-calibration-flag
                className={cn("inline-flex items-center gap-1 font-mono text-xs", flagToneClass)}
              >
                {above ? <TriangleUpIcon /> : <TriangleDownIcon />}
                <span className="sr-only">{above ? t("aboveLabel") : t("belowLabel")}</span>
              </span>
            )}
          </div>
        )}

        {traces.length > 0 ? (
          // The "visible seams" raise: the ticket is wired to its trace
          // disclosure by a persistent left rule, always rendered (not
          // hidden inside the <details> the way the trace list itself is) —
          // the wire is always visible; the popover/disclosure keeps the
          // details.
          <div className="space-y-1 border-l-2 border-brand/40 pl-3">
            <OriginTicket tone="accent">{t("provenanceTraced")}</OriginTicket>
            {detailsDisclosure}
          </div>
        ) : (
          detailsDisclosure
        )}
      </div>
    </div>
  );
}
