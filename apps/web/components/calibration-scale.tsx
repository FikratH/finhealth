import { cn } from "@/lib/utils";
import { formatNumber, type Locale, type NumberUnit } from "@/lib/format";

export type CalibrationScaleTone = "good" | "attention" | "critical" | "neutral";

const CURSOR_CLASS: Record<CalibrationScaleTone, string> = {
  good: "bg-good shadow-[0_0_5px_1px_var(--good)]",
  attention: "bg-attention shadow-[0_0_5px_1px_var(--attention)]",
  critical: "bg-critical shadow-[0_0_5px_1px_var(--critical)]",
  neutral: "bg-brand shadow-[0_0_5px_1px_var(--accent)]",
};

export interface CalibrationScaleProps {
  value: number | null;
  /** The reference interval's lower/upper bounds — the «норма» band. */
  low: number;
  high: number;
  /** Extra track span beyond [low, high], as a fraction of (high - low),
   * so an out-of-range cursor still reads as a position on the track
   * rather than pinning at the very edge. Default 0.4 (40% headroom on
   * each side). */
  headroom?: number;
  /** LED color for the cursor. Default "neutral" (brand teal). */
  tone?: CalibrationScaleTone;
  unit?: NumberUnit;
  locale?: Locale;
  /** Accessible label, e.g. «Текущий коэффициент относительно нормы». */
  label: string;
  naLabel?: string;
  className?: string;
}

function clampPercent(n: number): number {
  return Math.min(100, Math.max(0, n));
}

// The норма-band evolved: a calibration-instrument track with tick marks
// at the reference interval's bounds and an LED cursor at the current
// reading — the gauge idiom, not a bracketed text range. NormBand (the
// text-grammar primitive) stays in place for surfaces that haven't moved
// to the instrument grammar yet; this is the new component future tasks
// compose into InstrumentModule.
export function CalibrationScale({
  value,
  low,
  high,
  headroom = 0.4,
  tone = "neutral",
  unit,
  locale,
  label,
  naLabel,
  className,
}: CalibrationScaleProps) {
  const range = high - low;
  const span = range === 0 ? Math.max(Math.abs(high), 1) : range;
  const spanLow = low - span * headroom;
  const spanHigh = high + span * headroom;
  const spanWidth = spanHigh - spanLow || 1;

  const toPercent = (n: number) => clampPercent(((n - spanLow) / spanWidth) * 100);
  const lowPct = toPercent(low);
  const highPct = toPercent(high);
  const hasValue = value !== null;
  const valuePct = hasValue ? toPercent(value) : null;

  const rangeText = `${formatNumber(low, { locale, unit })}–${formatNumber(high, { locale, unit })}`;
  const valueText = hasValue ? formatNumber(value, { locale, unit }) : (naLabel ?? formatNumber(null));
  const ariaLabel = `${label}: ${valueText} (${rangeText})`;

  return (
    <div role="img" aria-label={ariaLabel} className={cn("w-full", className)}>
      <div className="relative h-5">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 bg-line"
          style={{ left: `${lowPct}%`, width: `${Math.max(0, highPct - lowPct)}%` }}
        />
        <div className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-ink-muted" style={{ left: `${lowPct}%` }} />
        <div className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-ink-muted" style={{ left: `${highPct}%` }} />
        {valuePct !== null && (
          <div
            className={cn(
              "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
              CURSOR_CLASS[tone],
            )}
            style={{ left: `${valuePct}%` }}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[0.65rem] text-ink-muted">
        <span>{formatNumber(low, { locale, unit })}</span>
        <span>{formatNumber(high, { locale, unit })}</span>
      </div>
    </div>
  );
}
