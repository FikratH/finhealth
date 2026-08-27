import { useTranslations } from "next-intl";
import { VerifyRow } from "./verify-row";
import { findExtractedValue } from "@/lib/analyze-reducer";
import { metricDisplayName } from "@/lib/metric-names";
import type { Locale } from "@/lib/format";
import type { ExtractedValue } from "@/lib/api-types";

export interface VerifyTableProps {
  values: ExtractedValue[];
  previousValues: ExtractedValue[];
  hasPreviousPeriod: boolean;
  locale: Locale;
  onEditLatest: (metric: string, value: number | null) => void;
  onEditPrevious: (metric: string, value: number | null) => void;
}

// The extraction table AS a document: per-metric rows, not a data-grid
// widget — hairline rules carry the structure (design-direction: "Hairline
// document structure ... not shadowed cards").
export function VerifyTable({
  values,
  previousValues,
  hasPreviousPeriod,
  locale,
  onEditLatest,
  onEditPrevious,
}: VerifyTableProps) {
  const t = useTranslations("Analyze.verify.table");

  return (
    <div className="overflow-x-auto border border-line">
      <table className="w-full min-w-[36rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-accent-surface text-left font-mono text-xs uppercase tracking-wide text-ink-muted">
            <th scope="col" className="px-3 py-2 font-normal">
              {t("metric")}
            </th>
            <th scope="col" className="px-3 py-2 font-normal">
              {t("latestPeriod")}
            </th>
            {hasPreviousPeriod && (
              <th scope="col" className="px-3 py-2 font-normal">
                {t("previousPeriod")}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {values.map((entry) => (
            <VerifyRow
              key={entry.metric}
              metric={entry.metric}
              metricName={metricDisplayName(entry.metric, locale)}
              latest={entry}
              previous={findExtractedValue(previousValues, entry.metric)}
              showPreviousColumn={hasPreviousPeriod}
              locale={locale}
              onEditLatest={(value) => onEditLatest(entry.metric, value)}
              onEditPrevious={(value) => onEditPrevious(entry.metric, value)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
