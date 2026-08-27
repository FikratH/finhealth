import { cn } from "@/lib/utils";
import { formatNumber, type Locale, type NumberUnit } from "@/lib/format";

export interface NormBandProps {
  value: number | null;
  /** Reference interval lower/upper bounds — the «норма» band. */
  low: number;
  high: number;
  unit?: NumberUnit;
  locale?: Locale;
  /** Translated word for the interval label, e.g. «норма». */
  normLabel: string;
  /** Translated pairing text for the ▲ flag (value above range) — read by
   * assistive tech alongside the glyph, per the lab-flag discipline. */
  aboveLabel: string;
  /** Translated pairing text for the ▼ flag (value below range). */
  belowLabel: string;
  /** Translated «Н/Д» wording for the null value state. */
  naLabel: string;
  /** Flag severity color — NormBand only knows the value's position
   * against the interval, not its real-world severity, so it defaults to
   * "critical" (any out-of-range value reads as an alert, direction is
   * carried by the glyph, not the color). Pass the ratio's actual API
   * status ("attention" | "critical") when the caller has one. */
  tone?: "attention" | "critical";
  className?: string;
}

// The lab-report grammar's signature primitive: value, then its reference
// interval in bracket notation, with an out-of-range flag — always paired
// with text, never a lone glyph relying on color.
export function NormBand({
  value,
  low,
  high,
  unit,
  locale,
  normLabel,
  aboveLabel,
  belowLabel,
  naLabel,
  tone = "critical",
  className,
}: NormBandProps) {
  const outOfRange = value !== null && (value < low || value > high);
  const above = value !== null && value > high;
  const flagGlyph = above ? "▲" : "▼";
  const flagText = above ? aboveLabel : belowLabel;
  const flagClass = tone === "attention" ? "text-attention" : "text-critical";

  const rangeText = `${normLabel} ${formatNumber(low, { locale, unit })}–${formatNumber(high, { locale, unit })}`;

  return (
    <span className={cn("inline-flex items-baseline gap-2 font-mono text-sm", className)}>
      <span className={cn("tabular-nums", value === null ? "text-ink-muted" : "text-ink")}>
        {value === null ? naLabel : formatNumber(value, { locale, unit })}
      </span>
      {/* Binding grammar: «1,66 · норма 1,5–3,0» — the middle dot is the
       * canonical separator between the value and its reference interval. */}
      <span aria-hidden="true" className="text-ink-muted">
        ·
      </span>
      <span className="text-xs text-ink-muted">{rangeText}</span>
      {outOfRange && (
        <span className={cn("inline-flex items-center gap-1", flagClass)}>
          <span aria-hidden="true">{flagGlyph}</span>
          <span className="sr-only">{flagText}</span>
        </span>
      )}
    </span>
  );
}
