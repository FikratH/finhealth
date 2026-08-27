"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { cn } from "@/lib/utils";
import { igniteSequence } from "@/lib/motion";
import { SegmentBars, type SegmentKey } from "@/components/segment-display";

gsap.registerPlugin(useGSAP);

const WORDMARK_TEXT = "Tonus";

/**
 * "Tonus" in the same seven-segment geometry SegmentDisplay's digit engine
 * uses — a small letter truth table instead of a new 14-segment mask.
 * Chosen over extending to real 14-segment geometry (diagonals, split
 * middle bars) or a vendored DSEG14 static face with a per-letter cascade:
 * every letter this brand name needs (T, o, n, u, s) is legible in the
 * classic seven-segment "calculator word" alphabet — the exact glyph
 * family the quality-bar reference images' own typography chart shows
 * ("0123456789 AbCdEF HiJLnPr StUY-", and full alphabetic headlines set in
 * it). Case per letter is whichever shape is legible in seven segments, not
 * the source word's case: "o" reuses digit 0's oval (no separate O glyph
 * exists), "t"/"n" only exist as their lowercase stem/arch shapes, "u"/"s"
 * as their uppercase U/5-shape. Zero new segment geometry or font
 * vendoring — reuses R1's exact QA'd bars via the shared `SegmentBars`
 * primitive segment-display.tsx exports.
 *
 * This also lands the "~1.2s boot" spec for free, on the app's one
 * metronome: 23 real bars across 5 letters, igniting one MOTION.step
 * (60ms) apart via the same `igniteSequence` the digit engine uses — 22
 * steps × 60ms ≈ 1.32s — rather than inventing a second, wordmark-only
 * timing constant.
 */
const WORDMARK_LETTERS: readonly { char: string; segments: readonly SegmentKey[] }[] = [
  { char: "T", segments: ["d", "e", "f", "g"] },
  { char: "o", segments: ["a", "b", "c", "d", "e", "f"] },
  { char: "n", segments: ["c", "e", "g"] },
  { char: "u", segments: ["b", "c", "d", "e", "f"] },
  { char: "s", segments: ["a", "c", "d", "f", "g"] },
];

export interface WordmarkIgniteProps {
  className?: string;
}

// The FIRST VIEWPORT's hero moment: boots once on mount, segment by
// segment. Self-contained (fires its own layout-timed effect) rather than
// exposing an imperative handle like SegmentDisplay does — the wordmark is
// the page's one authored motion moment, never sequenced against anything
// else, so there's nothing external to coordinate it with. SSR/no-JS
// default is fully lit (every bar in WORDMARK_LETTERS renders
// `data-lit="true"` up front) — a crawler or no-JS visitor always sees the
// finished wordmark; igniteSequence resets to unlit and cascades back up
// only once this effect actually runs, and is itself a no-op under
// prefers-reduced-motion (see its own doc comment in lib/motion.ts).
export function WordmarkIgnite({ className }: WordmarkIgniteProps) {
  const rootRef = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      if (!rootRef.current) return;
      igniteSequence(rootRef.current, "[data-segment-on]");
    },
    { scope: rootRef, dependencies: [] },
  );

  return (
    <span
      ref={rootRef}
      role="img"
      aria-label={WORDMARK_TEXT}
      className={cn("inline-flex items-center", className)}
    >
      {WORDMARK_LETTERS.map(({ char, segments }, i) => (
        <span key={i} className="segment-cell" data-wordmark-char={char}>
          <SegmentBars onSegments={segments} />
        </span>
      ))}
    </span>
  );
}
