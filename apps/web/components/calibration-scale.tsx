import { cn } from "@/lib/utils";
import { formatNumber, type Locale, type NumberUnit } from "@/lib/format";

export type CalibrationScaleTone = "good" | "attention" | "critical" | "neutral";

const CURSOR_CLASS: Record<CalibrationScaleTone, string> = {
  good: "bg-good shadow-[0_0_5px_1px_var(--good)]",
  attention: "bg-attention shadow-[0_0_5px_1px_var(--attention)]",
  critical: "bg-critical shadow-[0_0_5px_1px_var(--critical)]",
  neutral: "bg-brand shadow-[0_0_5px_1px_var(--accent)]",
};

/** Additive (Phase 7 Task 5): a second, KZ-sourced reference point — a
 * single value, never a band, placed on the SAME track as the норма band
 * via the same headroom-extended axis. Rendered as a hollow brand-teal
 * diamond (shape, not color, is what distinguishes it from the round LED
 * cursor — see the Accent-Surface Trap note in DESIGN.md on why "brand",
 * never a new hue, is the only real-teal reach). */
export interface CalibrationScaleKZMark {
  value: number;
  /** Accessible/print label naming this mark, e.g. «ориентир КЗ». */
  label: string;
}

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
  /** Optional second reference point — see CalibrationScaleKZMark. */
  kz?: CalibrationScaleKZMark;
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
  kz,
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
  // Clamped onto the SAME headroom-extended axis as the норма band and the
  // reading cursor — a KZ point far outside the global band still reads as
  // a position on this track rather than escaping it.
  const kzPct = kz ? toPercent(kz.value) : null;

  const rangeText = `${formatNumber(low, { locale, unit })}–${formatNumber(high, { locale, unit })}`;
  const valueText = hasValue ? formatNumber(value, { locale, unit }) : (naLabel ?? formatNumber(null));
  const kzValueText = kz ? formatNumber(kz.value, { locale, unit }) : null;
  const ariaLabel = kz
    ? `${label}: ${valueText} (${rangeText}). ${kz.label}: ${kzValueText}`
    : `${label}: ${valueText} (${rangeText})`;

  return (
    <div className={cn("w-full", className)}>
      {/* print:hidden — every visual part below is a background-color div
       * (the track, the норма band, both ticks, the LED cursor), which
       * print engines drop by default (no print-color-adjust in this
       * codebase — the F1 fix's own precedent, score-header.tsx, argues
       * against forcing screen-only LED paint onto the paper register).
       * Without this, a printed ratio row shows a blank strip with two
       * orphaned bound labels and no норма word naming them (I1). */}
      <div role="img" aria-label={ariaLabel} className="print:hidden">
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
          {kzPct !== null && (
            // A distinct SHAPE (hollow diamond), not a new color — a
            // second color would either collide with tone's good/
            // attention/critical vocabulary or require inventing a hue
            // this system doesn't have (see the Accent-Surface Trap note:
            // "brand" is the only real-teal reach). Sits at the same
            // vertical center as the LED cursor and bound ticks — one
            // more mark on the same track, not a second row.
            <div
              data-calibration-kz-mark
              className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-brand bg-panel"
              style={{ left: `${kzPct}%` }}
            />
          )}
        </div>
        <div className="mt-1 flex justify-between font-mono text-[0.65rem] text-ink-muted">
          <span>{formatNumber(low, { locale, unit })}</span>
          <span>{formatNumber(high, { locale, unit })}</span>
        </div>
      </div>
      {/* The paper register's own text grammar — NormBand's exact wording
       * («1,66 · норма 1,5–3,0»), reusing this component's own `label`
       * (callers already pass the «норма»/"norm" word — ratio-row.tsx's
       * `t("benchmarkLabel")` — as the gauge's accessible name) rather
       * than a second normLabel prop. aria-hidden: the (now print:hidden)
       * role="img" above already carries the accessible name; screen
       * readers never see this print-only line. */}
      <p
        aria-hidden="true"
        className="hidden font-mono text-sm print:inline-flex print:items-baseline print:gap-2"
      >
        <span className={value === null ? "text-ink-muted" : "text-ink"}>{valueText}</span>
        <span className="text-ink-muted">·</span>
        <span className="text-ink-muted">
          {label} {rangeText}
        </span>
      </p>
      {/* The KZ mark's own print-safe twin — same "norm-band print" idiom
       * as the paragraph above, on its own line so it reads as a second,
       * separately-sourced fact rather than part of the норма sentence.
       * aria-hidden for the same reason: the role="img" above's aria-label
       * already appends this mark's value/label for screen readers. */}
      {kz && (
        <p
          aria-hidden="true"
          className="hidden font-mono text-sm print:inline-flex print:items-baseline print:gap-2"
        >
          <span className="text-ink">{kzValueText}</span>
          <span className="text-ink-muted">·</span>
          <span className="text-ink-muted">{kz.label}</span>
        </p>
      )}
    </div>
  );
}
