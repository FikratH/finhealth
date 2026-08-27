import { cn } from "@/lib/utils";

export type Status = "good" | "attention" | "critical" | "na";

// Lab-flag glyphs pair every status with a shape, not just a color, so the
// signal survives for colorblind readers and print (design-direction:
// "status triad ... always paired with a text/symbol, never color-alone").
const SYMBOL: Record<Status, string> = {
  good: "✓",
  attention: "▲",
  critical: "✕",
  na: "·",
};

const DOT_CLASS: Record<Status, string> = {
  good: "bg-good",
  attention: "bg-attention",
  critical: "bg-critical",
  na: "bg-ink-muted",
};

const TEXT_CLASS: Record<Status, string> = {
  good: "text-good",
  attention: "text-attention",
  critical: "text-critical",
  na: "text-ink-muted",
};

export interface StatusPillProps {
  status: Status;
  /** Translated status word, e.g. «Хорошо» — becomes both the visible
   * label and the pill's accessible name. */
  label: string;
  className?: string;
}

export function StatusPill({ status, label, className }: StatusPillProps) {
  return (
    <span
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1.5 border border-line px-2 py-0.5 font-mono text-xs uppercase tracking-wide",
        TEXT_CLASS[status],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("inline-block size-1.5 rounded-full", DOT_CLASS[status])}
      />
      <span aria-hidden="true">{SYMBOL[status]}</span>
      <span>{label}</span>
    </span>
  );
}
