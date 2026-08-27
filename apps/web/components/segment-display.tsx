"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { formatNumber, type Locale } from "@/lib/format";
import { igniteSequence } from "@/lib/motion";

// The seven-segment alphabet, per the direction's "eight-cell truth": seven
// bars (a-g) plus the decimal point, and UNLIT SEGMENTS ARE DESIGNED TOO —
// every cell always renders all seven bars, the ones not part of the
// current character simply render in the permanent ghost color rather
// than being omitted. Standard segment lettering: a=top, b=top-right,
// c=bottom-right, d=bottom, e=bottom-left, f=top-left, g=middle.
export const SEGMENTS = ["a", "b", "c", "d", "e", "f", "g"] as const;
export type SegmentKey = (typeof SEGMENTS)[number];

const CHAR_SEGMENTS: Record<string, readonly SegmentKey[]> = {
  "0": ["a", "b", "c", "d", "e", "f"],
  "1": ["b", "c"],
  "2": ["a", "b", "g", "e", "d"],
  "3": ["a", "b", "g", "c", "d"],
  "4": ["f", "g", "b", "c"],
  "5": ["a", "f", "g", "c", "d"],
  "6": ["a", "f", "g", "e", "c", "d"],
  "7": ["a", "b", "c"],
  "8": ["a", "b", "c", "d", "e", "f", "g"],
  "9": ["a", "b", "c", "d", "f", "g"],
  "-": ["g"],
};

// Above this many cells, the animated per-segment mask gets visually noisy
// and expensive to ignite one-by-one — long/precision figures (a raw money
// total, a multi-digit id) fall back to the static DSEG7 font instead,
// which has no per-segment ignition of its own (see the `mode` prop).
const STATIC_FALLBACK_THRESHOLD = 6;

interface Cell {
  /** "0"-"9" or "-". Ghost-pad cells always carry "8" — the full glyph
   * outline — since every one of their segments renders as ghost anyway. */
  char: string;
  hasDot: boolean;
  /** True for a leading padding cell (not part of the value itself) —
   * "designed absence": rendered, never hidden, never lit. */
  isGhostPad: boolean;
}

function buildCells(
  value: number | null,
  decimals: number,
  digits: number | undefined,
  ghost: boolean,
): Cell[] {
  if (value === null) {
    const width = digits ?? 1;
    return Array.from({ length: width }, () => ({ char: "8", hasDot: false, isGhostPad: true }));
  }

  const negative = value < 0;
  const fixed = Math.abs(value).toFixed(Math.max(0, decimals));
  const [intPart, fracPart] = fixed.split(".");

  const chars: { char: string; hasDot: boolean }[] = [];
  if (negative) chars.push({ char: "-", hasDot: false });
  for (const ch of intPart) chars.push({ char: ch, hasDot: false });
  if (fracPart) {
    // The decimal point attaches to the cell before it rather than
    // claiming a cell of its own — how a physical seven-segment display's
    // dp actually works.
    const last = chars.at(-1);
    if (last) last.hasDot = true;
    for (const ch of fracPart) chars.push({ char: ch, hasDot: false });
  }

  const width = digits ?? chars.length;
  const padCount = ghost ? Math.max(0, width - chars.length) : 0;
  const padCells: Cell[] = Array.from({ length: padCount }, () => ({
    char: "8",
    hasDot: false,
    isGhostPad: true,
  }));
  const valueCells: Cell[] = chars.map((c) => ({ ...c, isGhostPad: false }));

  return [...padCells, ...valueCells];
}

function cellsToPlainString(cells: Cell[]): string {
  return cells.map((c) => (c.hasDot ? `${c.char}.` : c.char)).join("");
}

/**
 * The seven bars of one cell, rendered from an explicit "which segments are
 * on" set. Exported so any other segment-mask figure can draw through the
 * same primitive without duplicating the CSS-class/data-attribute wiring —
 * only the truth table needs to differ between one caller and the next.
 * Every bar always renders (ghost when not part of the current character,
 * lit teal via `[data-lit="true"]` when it is) — "unlit segments are
 * designed too." `data-segment-on` marks exactly the bars a caller's
 * `igniteSequence` call should cascade through; bars outside `onSegments`
 * stay permanently ghost and are never targeted.
 */
export function SegmentBars({ onSegments }: { onSegments: readonly SegmentKey[] }) {
  return (
    <>
      {SEGMENTS.map((seg) => {
        const on = onSegments.includes(seg);
        return (
          <span
            key={seg}
            data-segment={seg}
            {...(on ? { "data-segment-on": "", "data-lit": "true" } : { "data-lit": "false" })}
            className={cn(`segment segment-${seg}`, on ? "segment-active" : "segment-ghost")}
          />
        );
      })}
    </>
  );
}

function SegmentGlyph({ cell }: { cell: Cell }) {
  const onSegments = cell.isGhostPad ? [] : (CHAR_SEGMENTS[cell.char] ?? []);
  const dpActive = cell.hasDot && !cell.isGhostPad;

  return (
    <span className="segment-cell" data-segment-char={cell.char}>
      <SegmentBars onSegments={onSegments} />
      {cell.hasDot && (
        <span
          data-segment="dp"
          {...(dpActive ? { "data-segment-on": "", "data-lit": "true" } : { "data-lit": "false" })}
          className={cn("segment-dp rounded-full", dpActive ? "segment-active" : "segment-ghost")}
        />
      )}
    </span>
  );
}

export interface SegmentDisplayHandle {
  /**
   * Runs the boot-grammar ignition cascade over this instance's own "on"
   * segments (MOTION.step apart) — a no-op in static (DSEG font) mode,
   * which has no per-segment state to animate. Call from a layout-timed
   * effect (useGSAP), not a plain useEffect — see igniteSequence's own
   * doc comment for why (avoids a visible flash of the pre-rendered final
   * state). Reduced motion: segments are already rendered lit; this call
   * is a safe no-op either way.
   */
  ignite: () => void;
}

export interface SegmentDisplayProps {
  /** The figure to render, or null for "no data" — every cell renders as
   * a ghost "8", never hidden, never faked. */
  value: number | null;
  /** Decimal places when value is not null. Default 0. */
  decimals?: number;
  /** Total cell width. Omit to size exactly to the value; when given and
   * larger than the value needs, the extra leading cells render as ghost
   * "8"s (see `ghost`). */
  digits?: number;
  /** Pad unused leading cells with the ghost glyph instead of omitting
   * them. Default true. */
  ghost?: boolean;
  locale?: Locale;
  /** Combined with the formatted value into the accessible name, same
   * pattern as ScoreDial's caption. */
  caption?: string;
  /** Accessible replacement text for the null state. */
  naLabel?: string;
  /** "auto" (default) picks animated mask at ≤6 cells and the static DSEG7
   * fallback beyond that — the component decides per the direction ("long/
   * precision figures" render statically). Force either explicitly when a
   * caller needs to override the heuristic. */
  mode?: "auto" | "animated" | "static";
  className?: string;
}

export const SegmentDisplay = forwardRef<SegmentDisplayHandle, SegmentDisplayProps>(
  function SegmentDisplay(
    { value, decimals = 0, digits, ghost = true, locale, caption, naLabel, mode = "auto", className },
    ref,
  ) {
    const rootRef = useRef<HTMLSpanElement>(null);
    const cells = useMemo(
      () => buildCells(value, decimals, digits, ghost),
      [value, decimals, digits, ghost],
    );
    const isStatic = mode === "static" || (mode === "auto" && cells.length > STATIC_FALLBACK_THRESHOLD);

    useImperativeHandle(
      ref,
      () => ({
        ignite() {
          if (isStatic || !rootRef.current) return;
          igniteSequence(rootRef.current, "[data-segment-on]");
        },
      }),
      [isStatic],
    );

    const hasValue = value !== null;
    const formattedForAria = hasValue ? formatNumber(value, { locale, decimals }) : (naLabel ?? formatNumber(null));
    const ariaLabel = caption ? `${formattedForAria} — ${caption}` : formattedForAria;

    if (isStatic) {
      return (
        <span
          ref={rootRef}
          role="img"
          aria-label={ariaLabel}
          className={cn("font-segment tabular-nums text-ink", className)}
        >
          {cellsToPlainString(cells)}
        </span>
      );
    }

    return (
      <span
        ref={rootRef}
        role="img"
        aria-label={ariaLabel}
        className={cn("inline-flex items-center", className)}
      >
        {cells.map((cell, i) => (
          <SegmentGlyph key={i} cell={cell} />
        ))}
      </span>
    );
  },
);
