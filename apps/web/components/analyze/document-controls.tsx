import { useId } from "react";
import { useTranslations } from "next-intl";
import { SpecimenChip } from "@/components/specimen-chip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Industry, Scale } from "@/lib/api-types";

export interface DocumentControlsProps {
  industry: string;
  industries: Industry[];
  suggestedIndustry: string | null;
  scale: Scale;
  currency: string;
  audited: boolean;
  latestPeriod: string | null;
  previousPeriod: string | null;
  onIndustryChange: (industry: string) => void;
  onApplySuggested: () => void;
  onScaleChange: (scale: Scale) => void;
  onCurrencyChange: (currency: string) => void;
  onAuditedChange: (audited: boolean) => void;
}

const SCALES: Scale[] = ["units", "thousands", "millions", "billions"];

// The document's specimen-chip header, carried into Step 2 and made
// editable: industry (with a «предложено» badge once suggested_industry
// arrives — never silently overwriting a deliberate choice), scale,
// currency, audited, and the detected periods (read-only — they come from
// the document itself, not a user setting).
export function DocumentControls({
  industry,
  industries,
  suggestedIndustry,
  scale,
  currency,
  audited,
  latestPeriod,
  previousPeriod,
  onIndustryChange,
  onApplySuggested,
  onScaleChange,
  onCurrencyChange,
  onAuditedChange,
}: DocumentControlsProps) {
  const t = useTranslations("Analyze.verify.controls");
  const auditedId = useId();
  const currencyId = useId();
  const industryId = useId();
  const scaleId = useId();

  const suggestionPending = suggestedIndustry !== null && suggestedIndustry !== industry;
  const industryName = industries.find((ind) => ind.id === industry)?.name ?? industry;

  return (
    <div className="grid-paper border border-line bg-paper p-4">
      <p className="font-mono text-xs uppercase tracking-wide text-ink-muted">{t("heading")}</p>
      <div className="mt-3 flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <label htmlFor={industryId} className="block text-xs text-ink-muted">
            {t("industryLabel")}
          </label>
          <div className="flex items-center gap-2">
            {/* Always a defined string — see upload-step.tsx for why. */}
            <Select value={industry} onValueChange={onIndustryChange}>
              <SelectTrigger id={industryId} className="w-56">
                <SelectValue>{industry ? industryName : null}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {industries.map((ind) => (
                  <SelectItem key={ind.id} value={ind.id}>
                    {ind.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {suggestionPending && (
              <button type="button" onClick={onApplySuggested} title={t("applySuggested")}>
                <SpecimenChip tone="attention">{t("suggestedBadge")}</SpecimenChip>
              </button>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={scaleId} className="block text-xs text-ink-muted">
            {t("scaleLabel")}
          </label>
          <Select value={scale} onValueChange={(value) => onScaleChange(value as Scale)}>
            <SelectTrigger id={scaleId} className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCALES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`scale${s.charAt(0).toUpperCase()}${s.slice(1)}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={currencyId} className="block text-xs text-ink-muted">
            {t("currencyLabel")}
          </label>
          <input
            id={currencyId}
            type="text"
            value={currency}
            placeholder={t("currencyPlaceholder")}
            onChange={(event) => onCurrencyChange(event.target.value.toUpperCase())}
            className="w-28 border border-line bg-paper px-2 py-1.5 font-mono text-sm uppercase text-ink focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </div>

        <label htmlFor={auditedId} className="flex items-center gap-2 pb-1.5 text-sm text-ink">
          <input
            id={auditedId}
            type="checkbox"
            checked={audited}
            onChange={(event) => onAuditedChange(event.target.checked)}
            className="size-4 border border-line accent-brand"
          />
          {t("auditedLabel")}
        </label>

        <div className="ml-auto flex flex-wrap gap-2 pb-1.5">
          <SpecimenChip>
            {t("latestPeriodLabel")}: {latestPeriod ?? t("periodNotDetected")}
          </SpecimenChip>
          {previousPeriod && (
            <SpecimenChip>
              {t("previousPeriodLabel")}: {previousPeriod}
            </SpecimenChip>
          )}
        </div>
      </div>
    </div>
  );
}
