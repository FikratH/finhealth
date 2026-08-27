import { cn } from "@/lib/utils";
import { formatNumber, type Locale, type NumberUnit } from "@/lib/format";

export interface MetricNumberProps {
  value: number | null;
  unit?: NumberUnit;
  locale?: Locale;
  decimals?: number;
  /** Overrides formatNumber's «—» placeholder for a null value — pass the
   * translated «Н/Д» wording when this renders a ratio's value (the
   * contract distinguishes formatNumber's generic placeholder from the
   * domain-specific "value: null ⇒ «Н/Д»" rule). */
  naLabel?: string;
  /** Money-unit ratios are informational only (API: always status "na") —
   * mutes the figure so it reads as reference, not a scored result. */
  muted?: boolean;
  className?: string;
}

export function MetricNumber({
  value,
  unit,
  locale,
  decimals,
  naLabel,
  muted = false,
  className,
}: MetricNumberProps) {
  const text =
    value === null && naLabel !== undefined
      ? naLabel
      : formatNumber(value, { locale, unit, decimals });

  return (
    <span
      className={cn(
        "font-mono tabular-nums",
        muted ? "text-ink-muted" : "text-ink",
        className,
      )}
    >
      {text}
    </span>
  );
}
