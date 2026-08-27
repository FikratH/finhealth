import { useTranslations } from "next-intl";
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
import { Button } from "@/components/ui/button";
import { OriginTicket } from "@/components/origin-ticket";
import { bytesToMB } from "@/lib/analyze-reducer";
import { formatDate, formatNumber, type Locale } from "@/lib/format";
import type { MyDocumentSummary } from "@/lib/api-types";

export interface MyDocumentsTableProps {
  documents: MyDocumentSummary[];
  locale: Locale;
  onDelete: (id: string) => void;
}

// The retained-document vault as a table — same hairline grammar as
// my-analyses-table.tsx (per-row hairline rules, no shadowed cards), minus
// an "open" action: a retained document has no view of its own, only
// deletion (there's nothing beyond the raw file to show — the extracted
// numbers already live in whichever analysis was built from it, if any).
export function MyDocumentsTable({ documents, locale, onDelete }: MyDocumentsTableProps) {
  const t = useTranslations("My.documents.table");
  const tDialog = useTranslations("My.documents.deleteDialog");

  return (
    // `relative`: makes this scroll container the containing block for
    // position:absolute descendants — without it, the actions column's
    // sr-only <span> (position:absolute, no positioned ancestor) computes
    // its static position from its unscrolled location inside the wide
    // (min-w-[40rem]) table and escapes this element's own overflow-x-auto
    // clipping entirely, inflating document.documentElement.scrollWidth
    // (verified: 548px at a 390px viewport, entirely from two such escaped
    // spans — one per table — with zero visible symptom, since the span
    // itself is 1x1 and clipped). `overflow-x-auto` alone does NOT
    // establish a positioning context; only `position` does.
    <div className="relative overflow-x-auto border border-line bg-panel">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-panel text-left font-mono text-xs uppercase tracking-wide text-ink-muted">
            <th scope="col" className="px-3 py-2 font-normal">
              {t("filename")}
            </th>
            <th scope="col" className="px-3 py-2 font-normal">
              {t("date")}
            </th>
            <th scope="col" className="px-3 py-2 font-normal">
              {t("size")}
            </th>
            <th scope="col" className="px-3 py-2 font-normal">
              <span className="sr-only">{t("actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => {
            const date = formatDate(doc.created_at, locale);
            const sizeLabel = t("sizeMb", { size: formatNumber(bytesToMB(doc.size_bytes), { locale, decimals: 1 }) });
            // Row context for the delete action's accessible name — a bare
            // "Удалить" is ambiguous once there's more than one row, same
            // reasoning as my-analyses-table.tsx's ariaContext.
            const ariaContext = { filename: doc.filename, date };
            return (
              <tr key={doc.doc_id} className="border-b border-line last:border-b-0">
                <td className="px-3 py-2 font-mono text-ink">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="break-all">{doc.filename}</span>
                    <OriginTicket>{doc.kind.toUpperCase()}</OriginTicket>
                  </div>
                </td>
                <td className="px-3 py-2 font-mono tabular-nums text-ink">{date}</td>
                <td className="px-3 py-2 font-mono tabular-nums text-ink-muted">{sizeLabel}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={t("deleteAria", ariaContext)}
                        >
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
                          <AlertDialogAction onClick={() => onDelete(doc.doc_id)}>
                            {tDialog("confirm")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
