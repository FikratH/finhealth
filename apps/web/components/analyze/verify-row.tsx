import { useTranslations } from "next-intl";
import { ConfidenceMeter } from "@/components/confidence-meter";
import { SpecimenChip } from "@/components/specimen-chip";
import { SourcePopover } from "./source-popover";
import { ValueInput } from "./value-input";
import type { Locale } from "@/lib/format";
import type { ExtractedValue } from "@/lib/api-types";

export interface VerifyRowProps {
  metric: string;
  metricName: string;
  latest: ExtractedValue | undefined;
  previous: ExtractedValue | undefined;
  showPreviousColumn: boolean;
  locale: Locale;
  onEditLatest: (value: number | null) => void;
  onEditPrevious: (value: number | null) => void;
}

interface PeriodCellProps {
  metricName: string;
  periodLabel: string;
  entry: ExtractedValue | undefined;
  locale: Locale;
  onChange: (value: number | null) => void;
}

// One period's cell: the editable figure, then either a confidence chip (an
// as-extracted value) or a "manually entered" chip (the user overrode it —
// confidence no longer describes anything), plus the source/snippet
// popover. N/A rows (entry.value === null) get the exact same editable
// input, placeholder «Н/Д» — that IS the manual-entry affordance, not a
// separate control.
function PeriodCell({ metricName, periodLabel, entry, locale, onChange }: PeriodCellProps) {
  const t = useTranslations("Analyze.verify.table");
  const errorsT = useTranslations("errors");
  const value = entry?.value ?? null;
  const manuallyEdited = entry?.manually_edited ?? false;
  const confidence = entry?.confidence ?? 0;

  return (
    <div className="space-y-1.5">
      <ValueInput
        value={value}
        locale={locale}
        placeholder={t("naPlaceholder")}
        ariaLabel={t("valueInputLabel", { metric: metricName, period: periodLabel })}
        invalidMessage={errorsT("invalidNumber")}
        onChange={onChange}
      />
      <div className="flex items-center justify-between gap-2">
        {manuallyEdited ? (
          <SpecimenChip tone="accent">{t("manuallyEdited")}</SpecimenChip>
        ) : (
          <ConfidenceMeter
            value={entry ? confidence : null}
            locale={locale}
            label={t("confidenceLabel", { metric: metricName })}
            naLabel={t("naPlaceholder")}
          />
        )}
        <SourcePopover
          source={entry?.source ?? ""}
          snippet={entry?.snippet ?? ""}
          context={`${metricName}, ${periodLabel}`}
        />
      </div>
    </div>
  );
}

export function VerifyRow({
  metric,
  metricName,
  latest,
  previous,
  showPreviousColumn,
  locale,
  onEditLatest,
  onEditPrevious,
}: VerifyRowProps) {
  const t = useTranslations("Analyze.verify.table");

  return (
    <tr className="border-t border-line align-top">
      <th
        id={`verify-row-${metric}`}
        scope="row"
        className="px-3 py-3 text-left align-top font-normal text-ink"
      >
        {metricName}
      </th>
      <td className="px-3 py-3">
        <PeriodCell
          metricName={metricName}
          periodLabel={t("latestPeriod")}
          entry={latest}
          locale={locale}
          onChange={onEditLatest}
        />
      </td>
      {showPreviousColumn && (
        <td className="px-3 py-3" aria-labelledby={`verify-row-${metric}`}>
          <PeriodCell
            metricName={metricName}
            periodLabel={t("previousPeriod")}
            entry={previous}
            locale={locale}
            onChange={onEditPrevious}
          />
        </td>
      )}
    </tr>
  );
}
