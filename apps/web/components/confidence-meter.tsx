import { cn } from "@/lib/utils";
import { formatNumber, type Locale } from "@/lib/format";
import { LedBar } from "@/components/led-bar";

export interface ConfidenceMeterProps {
  /** 0-100, or null when no confidence figure applies yet. */
  value: number | null;
  locale?: Locale;
  /** Accessible name for the meter, e.g. «Уверенность извлечения». */
  label: string;
  /** Translated «Н/Д» wording for the null state. */
  naLabel?: string;
  className?: string;
}

const LOW_CONFIDENCE_THRESHOLD = 60;

// The instrument-bar re-skin: a bezelled track (border + panel surface)
// with the world's discrete LED bar-graph device (LedBar), not a
// continuous fill — still role="meter", not role="progressbar" (a scalar
// reading of how much of the analysis to trust, not a task moving toward
// completion). Same API, same accessible name/value contract as before.
export function ConfidenceMeter({
  value,
  locale,
  label,
  naLabel,
  className,
}: ConfidenceMeterProps) {
  const clamped = value === null ? null : Math.min(100, Math.max(0, value));
  const low = clamped !== null && clamped < LOW_CONFIDENCE_THRESHOLD;
  const valueText =
    clamped === null
      ? (naLabel ?? formatNumber(null))
      : formatNumber(clamped, { locale, unit: "%", decimals: 0 });

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped ?? undefined}
        aria-valuetext={valueText}
        className="h-1.5 w-24 flex-1 border border-line bg-panel"
      >
        <LedBar value={clamped} tone={low ? "attention" : "brand"} />
      </div>
      <span className="font-mono text-xs tabular-nums text-ink-muted">
        {valueText}
      </span>
    </div>
  );
}
