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
  /** Distinguishing context appended to the trigger's accessible name,
   * e.g. «Выручка, текущий период» — so multiple source buttons on the
   * same page get distinct names. Deliberately NOT the whole label: WCAG
   * 2.5.3 (Label in Name) requires the accessible name to start with the
   * visible label, so this component builds the aria-label itself by
   * prefixing its own translated trigger text, rather than trusting each
   * caller to repeat "Источник"/"Source" correctly. */
  context: string;
}

// Every extracted value traces back to a document location — this is the
// product's provenance-first truth made interactive: click the source
// marker, see the exact row/cell and the raw text it was read from.
export function SourcePopover({ source, snippet, context }: SourcePopoverProps) {
  const t = useTranslations("Analyze.verify.source");
  const trigger = t("trigger");

  if (!source && !snippet) {
    return <span className="font-mono text-xs text-ink-muted">{t("noSource")}</span>;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${trigger}: ${context}`}
          className="border border-line bg-panel px-1.5 py-0.5 font-mono text-xs uppercase tracking-wide text-ink-muted transition-colors hover:border-brand hover:text-brand hover:[text-shadow:0_0_0.3em_var(--accent)] focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {trigger}
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
