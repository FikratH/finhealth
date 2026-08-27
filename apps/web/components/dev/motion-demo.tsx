"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MOTION, usePrefersReducedMotion } from "@/lib/motion";

gsap.registerPlugin(useGSAP);

type BeatKey = "fast" | "base" | "reveal";

const BEATS: { key: BeatKey; duration: number }[] = [
  { key: "fast", duration: MOTION.fast },
  { key: "base", duration: MOTION.base },
  { key: "reveal", duration: MOTION.reveal },
];

type MotionDemoProps = {
  beatLabels: Record<BeatKey, string>;
  beatCopy: Record<BeatKey, string>;
  replayLabel: string;
  reducedNotice: string;
};

// Demonstrates the three metronome beats as a hairline draw + fade-up, the
// same primitive Task 2's scroll cinema reveals will reuse. GSAP sets the
// "from" state via JS at effect time (gsap.fromTo), never via a
// render-time inline style — so with JS disabled, or before this effect
// runs, every beat's sample is already in its final, fully visible state.
// Under prefers-reduced-motion the effect never fires at all: no tween is
// created, nothing is ever set to a hidden "from" state, and the replay
// control is withheld (there is nothing to replay).
export function MotionDemo({
  beatLabels,
  beatCopy,
  replayLabel,
  reducedNotice,
}: MotionDemoProps) {
  const scope = useRef<HTMLDivElement>(null);
  const replayRef = useRef<() => void>(() => {});
  const prefersReducedMotion = usePrefersReducedMotion();

  useGSAP(
    (_context, contextSafe) => {
      // Read the ref once, here, at the top of the hook's own callback —
      // the one place this pattern is unambiguously safe — rather than
      // inside the contextSafe-wrapped closure below, so contextSafe's
      // returned function only ever touches already-resolved DOM elements.
      const root = scope.current;
      if (!root || !contextSafe) return;

      const targets = BEATS.map(({ key, duration }) => {
        const beat = root.querySelector<HTMLElement>(`[data-beat="${key}"]`);
        return {
          duration,
          rule: beat?.querySelector<HTMLElement>('[data-role="rule"]'),
          fade: beat?.querySelector<HTMLElement>('[data-role="fade"]'),
        };
      });

      const replay = contextSafe(() => {
        for (const { rule, fade, duration } of targets) {
          if (!rule || !fade) continue;

          gsap.fromTo(
            rule,
            { scaleX: 0 },
            { scaleX: 1, duration, ease: MOTION.ease },
          );
          gsap.fromTo(
            fade,
            { opacity: 0, y: 12 },
            { opacity: 1, y: 0, duration, ease: MOTION.ease, delay: duration * 0.2 },
          );
        }
      });

      replayRef.current = replay;
      if (!prefersReducedMotion) {
        replay();
      }
    },
    { scope, dependencies: [prefersReducedMotion] },
  );

  return (
    <div ref={scope} className="space-y-8">
      {BEATS.map(({ key, duration }) => (
        <div key={key} data-beat={key} className="space-y-3">
          <p className="font-mono text-xs uppercase tracking-wide text-ink-muted">
            {beatLabels[key]} — {Math.round(duration * 1000)}ms
          </p>
          <div
            data-role="rule"
            className="h-px w-full origin-left bg-accent"
          />
          <div
            data-role="fade"
            className="border border-line bg-paper p-4 text-sm text-ink"
          >
            {beatCopy[key]}
          </div>
        </div>
      ))}

      {prefersReducedMotion ? (
        <p className="font-mono text-xs text-ink-muted">{reducedNotice}</p>
      ) : (
        <Button type="button" variant="outline" onClick={() => replayRef.current()}>
          <RotateCcw aria-hidden />
          {replayLabel}
        </Button>
      )}
    </div>
  );
}
