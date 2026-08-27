"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "./error-banner";
import { DocumentControls } from "./document-controls";
import { VerifyTable } from "./verify-table";
import type {
  AnalyzeError,
  VerifyPhase,
} from "@/lib/analyze-reducer";
import type { Locale } from "@/lib/format";
import type {
  ExtractedValue,
  ExtractionResult,
  Industry,
  Scale,
} from "@/lib/api-types";

export interface VerifyStepProps {
  extraction: ExtractionResult;
  values: ExtractedValue[];
  previousValues: ExtractedValue[];
  industry: string;
  industries: Industry[];
  suggestedIndustry: string | null;
  scale: Scale;
  currency: string;
  audited: boolean;
  verifyPhase: VerifyPhase;
  error: AnalyzeError | null;
  locale: Locale;
  onEditLatest: (metric: string, value: number | null) => void;
  onEditPrevious: (metric: string, value: number | null) => void;
  onIndustryChange: (industry: string) => void;
  onApplySuggested: () => void;
  onScaleChange: (scale: Scale) => void;
  onCurrencyChange: (currency: string) => void;
  onAuditedChange: (audited: boolean) => void;
  onBack: () => void;
  onSubmit: () => void;
}

// Step 2, the trust moment: the extraction table AS a document, its
// warnings shown verbatim above it, document-level controls (industry,
// scale, currency, audited) prefilled — never re-derived from a fresh
// fetch, always the same continuous document Step 1 handed off.
export function VerifyStep({
  extraction,
  values,
  previousValues,
  industry,
  industries,
  suggestedIndustry,
  scale,
  currency,
  audited,
  verifyPhase,
  error,
  locale,
  onEditLatest,
  onEditPrevious,
  onIndustryChange,
  onApplySuggested,
  onScaleChange,
  onCurrencyChange,
  onAuditedChange,
  onBack,
  onSubmit,
}: VerifyStepProps) {
  const t = useTranslations("Analyze.verify");
  const busy = verifyPhase === "analyzing";
  const canSubmit = industry !== "" && !busy;
  const missingReason = industry === "" ? t("missingIndustryError") : null;
  const hasPreviousPeriod = Boolean(extraction.previous_period);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink">{t("heading")}</h1>
        <p className="mt-1 max-w-prose text-ink-muted">{t("lede")}</p>
      </div>

      {error && <ErrorBanner error={error} />}

      {extraction.warnings.length > 0 && (
        <div className="border border-attention px-4 py-3 text-sm text-ink">
          <p className="font-mono text-xs uppercase tracking-wide text-attention">
            {t("warningsHeading")}
          </p>
          <ul className="mt-2 space-y-1">
            {extraction.warnings.map((warning) => (
              <li key={warning} className="flex gap-2">
                <span aria-hidden="true" className="text-attention">
                  ▲
                </span>
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <DocumentControls
        industry={industry}
        industries={industries}
        suggestedIndustry={suggestedIndustry}
        scale={scale}
        currency={currency}
        audited={audited}
        latestPeriod={extraction.latest_period ?? null}
        previousPeriod={extraction.previous_period ?? null}
        onIndustryChange={onIndustryChange}
        onApplySuggested={onApplySuggested}
        onScaleChange={onScaleChange}
        onCurrencyChange={onCurrencyChange}
        onAuditedChange={onAuditedChange}
      />

      <VerifyTable
        values={values}
        previousValues={previousValues}
        hasPreviousPeriod={hasPreviousPeriod}
        locale={locale}
        onEditLatest={onEditLatest}
        onEditPrevious={onEditPrevious}
      />

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={onBack} disabled={busy}>
            {t("backButton")}
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            aria-describedby={missingReason && !busy ? "verify-submit-hint" : undefined}
          >
            {busy ? t("analyzingStatus") : t("submitButton")}
          </Button>
        </div>
        {missingReason && !busy && (
          <p
            id="verify-submit-hint"
            role="status"
            aria-live="polite"
            className="mt-2 text-xs text-ink-muted"
          >
            {missingReason}
          </p>
        )}
        {busy && (
          <p role="status" aria-live="polite" className="sr-only">
            {t("analyzingStatus")}
          </p>
        )}
      </div>
    </div>
  );
}
