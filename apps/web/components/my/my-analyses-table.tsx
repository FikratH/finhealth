import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { SpecimenChip } from "@/components/specimen-chip";
import { MetricNumber } from "@/components/metric-number";
import { StatusPill } from "@/components/status-pill";
import { verdictTone } from "@/lib/verdict";
import { formatDate, type Locale } from "@/lib/format";
import type { MyAnalysisSummary } from "@/lib/api-types";

export interface MyAnalysesTableProps {
  analyses: MyAnalysisSummary[];
  locale: Locale;
  onDelete: (id: string) => void;
}

// The history document AS a table — same hairline grammar as
// analyze/verify-table.tsx: per-row hairline rules, no shadowed cards.
// Each row's own `health_label` (already RU text from the API) is the
// StatusPill's label, colored via verdictTone(score) — reused from
// score-header.tsx's verdict stamp rather than a second tiering.
export function MyAnalysesTable({ analyses, locale, onDelete }: MyAnalysesTableProps) {
  const t = useTranslations("My.table");
  const tDialog = useTranslations("My.deleteDialog");

  return (
    <div className="overflow-x-auto border border-line">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-accent-surface text-left font-mono text-xs uppercase tracking-wide text-ink-muted">
            <th scope="col" className="px-3 py-2 font-normal">
              {t("date")}
            </th>
            <th scope="col" className="px-3 py-2 font-normal">
              {t("industry")}
            </th>
            <th scope="col" className="px-3 py-2 font-normal">
              {t("score")}
            </th>
            <th scope="col" className="px-3 py-2 font-normal">
              <span className="sr-only">{t("actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {analyses.map((row) => (
            <tr key={row.analysis_id} className="border-b border-line last:border-b-0">
              <td className="px-3 py-2 font-mono tabular-nums text-ink">
                {formatDate(row.created_at, locale)}
              </td>
              <td className="px-3 py-2">
                <SpecimenChip>{row.industry_name}</SpecimenChip>
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <MetricNumber
                    value={row.overall_score}
                    locale={locale}
                    decimals={0}
                    naLabel={t("scoreNa")}
                  />
                  <StatusPill status={verdictTone(row.overall_score)} label={row.health_label} />
                </div>
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center justify-end gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/results/${row.analysis_id}`}>{t("open")}</Link>
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button type="button" variant="ghost" size="sm">
                        {t("delete")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{tDialog("title")}</AlertDialogTitle>
                        <AlertDialogDescription>{tDialog("body")}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{tDialog("cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onDelete(row.analysis_id)}>
                          {tDialog("confirm")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
