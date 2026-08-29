import { useId } from "react";
import { useTranslations } from "next-intl";
import { OriginTicket } from "@/components/origin-ticket";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { localizedIndustryName, type Locale } from "@/lib/format";
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
  locale: Locale;
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
  locale,
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
  const selectedIndustry = industries.find((ind) => ind.id === industry);
  const industryName = selectedIndustry
    ? localizedIndustryName(selectedIndustry.name, selectedIndustry.name_en, locale)
    : industry;

  return (
    <div className="grid-paper border border-line bg-panel p-4">
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
                    {localizedIndustryName(ind.name, ind.name_en, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {suggestionPending && (
              <button type="button" onClick={onApplySuggested} title={t("applySuggested")}>
                <OriginTicket tone="attention">{t("suggestedBadge")}</OriginTicket>
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
            className="w-28 border border-line bg-panel px-2 py-1.5 font-mono text-sm uppercase text-ink caret-brand [caret-shape:block] focus-visible:border-brand focus-visible:shadow-[0_0_0_3px_color-mix(in_oklch,var(--accent)_20%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </div>

        {/* Instrument switch: the native checkbox stays (behavior, keyboard,
         * and screen-reader semantics all identical) but visually hidden —
         * the bezelled track + LED thumb it drives are a decorative sibling
         * wired to it via the standard peer pattern, and the visible focus
         * ring lands on that sibling since the real control is off-screen. */}
        <label htmlFor={auditedId} className="flex cursor-pointer items-center gap-2 pb-1.5 text-sm text-ink">
          <span className="relative inline-flex h-4 w-8 shrink-0 items-center border border-line bg-panel">
            <input
              id={auditedId}
              type="checkbox"
              checked={audited}
              onChange={(event) => onAuditedChange(event.target.checked)}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className="absolute left-0.5 size-2.5 bg-ink-muted transition-transform duration-150 peer-checked:translate-x-4 peer-checked:bg-brand peer-checked:shadow-[0_0_4px_1px_var(--accent)]"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 border border-transparent peer-focus-visible:border-ring"
            />
          </span>
          {t("auditedLabel")}
        </label>

        <div className="ml-auto flex flex-wrap gap-2 pb-1.5">
          <OriginTicket>
            {t("latestPeriodLabel")}: {latestPeriod ?? t("periodNotDetected")}
          </OriginTicket>
          {previousPeriod && (
            <OriginTicket>
              {t("previousPeriodLabel")}: {previousPeriod}
            </OriginTicket>
          )}
        </div>
      </div>
    </div>
  );
}
