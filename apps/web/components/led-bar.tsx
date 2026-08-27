"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { igniteSequence } from "@/lib/motion";

export type LedBarTone = "brand" | "good" | "attention";

// The lit color each cell resolves to via CSS's [data-lit="true"] rule
// (globals.css's .led-cell) — a CSS custom property, not a static Tailwind
// class, so igniteSequence's data-lit toggling (false during the cascade,
// true as each cell lights) actually changes what's rendered, the same
// way SegmentDisplay's [data-segment-on] cells work.
const TONE_VAR: Record<LedBarTone, string> = {
  brand: "var(--accent)",
  good: "var(--good)",
  attention: "var(--attention)",
};

const DEFAULT_CELLS = 10;

export interface LedBarHandle {
  /** Runs the boot-grammar ignition cascade over this bar's own lit cells
   * (MOTION.step apart) — same contract as SegmentDisplay's own handle.
   * A no-op if there's nothing lit (a null/zero reading). */
  ignite: () => void;
}

export interface LedBarProps {
  /** 0-100, or null for "no data" — renders as an all-ghost track, never
   * hidden (the world's own designed-absence grammar, same as
   * SegmentDisplay's ghost cells). */
  value: number | null;
  /** Discrete cell count. Default 10 (each cell = 10%). */
  cells?: number;
  tone?: LedBarTone;
  className?: string;
}

// The world's discrete segmented LED bar-graph device — a row of small
// rectangular cells, lit count proportional to value, unlit cells the same
// permanent ghost tone SegmentDisplay's own unlit segments use. Replaces
// every continuous hairline progress fill on results (category score bars,
// the confidence bar): a continuous fill is the fintech dashboard default
// this world refuses in favor of its own discrete-cell law (finish review,
// material_fixes 2). Purely decorative — the real value is always also
// text/aria-valuenow on whatever the caller wraps this in (ConfidenceMeter's
// role="meter", CategoryScores' sibling MetricNumber), so this needs no
// accessible name of its own.
export const LedBar = forwardRef<LedBarHandle, LedBarProps>(function LedBar(
  { value, cells = DEFAULT_CELLS, tone = "brand", className },
  ref,
) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const litCount = useMemo(() => {
    if (value === null) return 0;
    const clamped = Math.min(100, Math.max(0, value));
    return Math.round((clamped / 100) * cells);
  }, [value, cells]);

  useImperativeHandle(
    ref,
    () => ({
      ignite() {
        if (!rootRef.current) return;
        igniteSequence(rootRef.current, "[data-cell-on]");
      },
    }),
    [],
  );

  return (
    <span
      ref={rootRef}
      aria-hidden="true"
      className={cn("flex h-full w-full items-stretch gap-px", className)}
    >
      {Array.from({ length: cells }, (_, i) => {
        const on = i < litCount;
        return on ? (
          <span
            key={i}
            data-cell-on=""
            data-lit="true"
            style={{ "--cell-tone": TONE_VAR[tone] } as CSSProperties}
            className="led-cell h-full min-w-0 flex-1"
          />
        ) : (
          <span key={i} className="h-full min-w-0 flex-1 bg-ghost" />
        );
      })}
    </span>
  );
});
