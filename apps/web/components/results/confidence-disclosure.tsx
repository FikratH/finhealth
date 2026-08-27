import { useTranslations } from "next-intl";
import { ConfidenceMeter } from "@/components/confidence-meter";
import { SpecimenChip } from "@/components/specimen-chip";
import { MetricNumber } from "@/components/metric-number";
import type { ConfidenceBreakdown } from "@/lib/api-types";
import type { Locale } from "@/lib/format";

export interface ConfidenceDisclosureProps {
  confidence: ConfidenceBreakdown;
  locale: Locale;
}

// The score header's main ConfidenceMeter shows confidence.total in
// isolation; this expandable disclosure is where its components become
// visible — the two 0-100 sub-scores as their own ConfidenceMeter rows, the
// manual-correction count as a plain figure (it's a count, not a percentage
// — forcing it through ConfidenceMeter's 0-100 semantics would misrepresent
// it), the boolean facts as SpecimenChips, and the engine's own notes[]
// verbatim (this is where the fixture's audit-detected note surfaces).
export function ConfidenceDisclosure({ confidence, locale }: ConfidenceDisclosureProps) {
  const t = useTranslations("Results.header.confidence");

  return (
    <details className="max-w-sm">
      <summary className="cursor-pointer font-mono text-xs text-ink-muted hover:text-accent">
        {t("detailsToggle")}
      </summary>
      <div className="mt-3 space-y-3 border-t border-line pt-3">
        <div className="space-y-2">
          <ConfidenceMeter
            value={confidence.data_completeness}
            locale={locale}
            label={t("dataCompletenessLabel")}
          />
          <ConfidenceMeter
            value={confidence.extraction_confidence}
            locale={locale}
            label={t("extractionConfidenceLabel")}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-ink-muted">{t("manualCorrectionsLabel")}</span>
            <MetricNumber
              value={confidence.manual_corrections}
              decimals={0}
              locale={locale}
              className="text-xs"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <SpecimenChip tone={confidence.has_previous_period ? "accent" : "neutral"}>
            {confidence.has_previous_period
              ? t("hasPreviousPeriodYes")
              : t("hasPreviousPeriodNo")}
          </SpecimenChip>
          <SpecimenChip tone={confidence.has_industry_benchmarks ? "accent" : "neutral"}>
            {confidence.has_industry_benchmarks
              ? t("hasIndustryBenchmarksYes")
              : t("hasIndustryBenchmarksNo")}
          </SpecimenChip>
          <SpecimenChip tone={confidence.audited ? "accent" : "neutral"}>
            {confidence.audited ? t("auditedYes") : t("auditedNo")}
          </SpecimenChip>
        </div>
        {confidence.notes.length > 0 && (
          <ul className="space-y-1 text-sm text-ink-muted">
            {confidence.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
