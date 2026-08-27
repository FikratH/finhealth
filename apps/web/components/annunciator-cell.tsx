import { cn } from "@/lib/utils";
import type { Status } from "@/components/status-pill";

const SYMBOL: Record<Status, string> = {
  good: "✓",
  attention: "▲",
  critical: "✕",
  na: "·",
};

const TEXT_CLASS: Record<Status, string> = {
  good: "text-good",
  attention: "text-attention",
  critical: "text-critical",
  na: "text-ink-muted",
};

const GLOW_CLASS: Record<Status, string> = {
  good: "[text-shadow:0_0_0.3em_var(--good)]",
  attention: "[text-shadow:0_0_0.3em_var(--attention)]",
  critical: "[text-shadow:0_0_0.3em_var(--critical)]",
  na: "",
};

export interface AnnunciatorCellProps {
  status: Status;
  /** The lit label, e.g. «СИЛЬНОЕ СОСТОЯНИЕ» — becomes both the visible
   * text and the cell's accessible name. */
  label: string;
  /** Supporting line under the label, e.g. a one-sentence verdict gloss. */
  description?: string;
  className?: string;
}

// The «заключение» verdict primitive: a large lit annunciator cell inside a
// bezel, in its status LED color — the always-lit-rail idiom applied to the
// single most important reading on the page. Same glyph-plus-color
// discipline as StatusPill (never color alone). The glow is a text-shadow
// decoration on top of the AA-checked base color, not a substitute for it.
export function AnnunciatorCell({ status, label, description, className }: AnnunciatorCellProps) {
  return (
    <div
      role="status"
      aria-label={description ? `${label} — ${description}` : label}
      className={cn("border border-line bg-panel px-5 py-4", className)}
    >
      <p
        aria-hidden="true"
        className={cn(
          "flex items-center gap-2 font-mono text-xl uppercase tracking-wide sm:text-2xl",
          TEXT_CLASS[status],
          GLOW_CLASS[status],
        )}
      >
        <span>{SYMBOL[status]}</span>
        <span>{label}</span>
      </p>
      {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
    </div>
  );
}
