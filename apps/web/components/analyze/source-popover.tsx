import { useTranslations } from "next-intl";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface SourcePopoverProps {
  /** Page / sheet / cell reference, e.g. "sheet1!B4". Empty for a manually
   * entered value that has no document source. */
  source: string;
  /** Raw fragment from the document, for provenance display. */
  snippet: string;
  /** Accessible name for the trigger, e.g. «Источник: Выручка, текущий период». */
  triggerLabel: string;
}

// Every extracted value traces back to a document location — this is the
// product's provenance-first truth made interactive: click the source
// marker, see the exact row/cell and the raw text it was read from.
export function SourcePopover({ source, snippet, triggerLabel }: SourcePopoverProps) {
  const t = useTranslations("Analyze.verify.source");

  if (!source && !snippet) {
    return <span className="font-mono text-xs text-ink-muted">{t("noSource")}</span>;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={triggerLabel}
          className="border border-line px-1.5 py-0.5 font-mono text-xs text-ink-muted transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("trigger")}
        </button>
      </PopoverTrigger>
      <PopoverContent>
        {source && (
          <p className="font-mono text-xs text-ink-muted">
            {t("sourceLabel")} <span className="text-ink">{source}</span>
          </p>
        )}
        {snippet && (
          <p className="font-mono text-xs text-ink-muted">
            {t("snippetLabel")} <span className="text-ink">«{snippet}»</span>
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
