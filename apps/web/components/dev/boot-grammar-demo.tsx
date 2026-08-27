"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MOTION, igniteSequence, scanlineSweep, usePrefersReducedMotion } from "@/lib/motion";

gsap.registerPlugin(useGSAP);

const CELL_COUNT = 6;

type BootGrammarDemoProps = {
  stepLabel: string;
  stepCopy: string;
  sweepLabel: string;
  sweepCopy: string;
  replayLabel: string;
  reducedNotice: string;
};

// The boot grammar's two newer verbs, evolved past the original three-beat
// metronome (fast/base/reveal, demonstrated above by MotionDemo):
// igniteSequence's MOTION.step cascade (a row of cells lighting one at a
// time, 60ms apart — the same primitive SegmentDisplay's ignition and the
// wordmark's boot both draw through) and scanlineSweep's MOTION.sweep beam
// (RevealSection's own section-entry sweep, at demo scale). Same replay
// discipline as MotionDemo: GSAP sets every "from" state via JS at effect
// time, never a render-time class, so a no-JS visitor or a reduced-motion
// reader always sees the finished state — cells already lit, the sweep
// beam's content already fully visible — and the effect (and the replay
// control) simply never runs under prefers-reduced-motion.
export function BootGrammarDemo({
  stepLabel,
  stepCopy,
  sweepLabel,
  sweepCopy,
  replayLabel,
  reducedNotice,
}: BootGrammarDemoProps) {
  const scope = useRef<HTMLDivElement>(null);
  const replayRef = useRef<() => void>(() => {});
  const prefersReducedMotion = usePrefersReducedMotion();

  useGSAP(
    (_context, contextSafe) => {
      const root = scope.current;
      if (!root || !contextSafe) return;

      const sweepSection = root.querySelector<HTMLElement>("[data-sweep-demo]");

      const replay = contextSafe(() => {
        igniteSequence(root, "[data-boot-cell]");
        if (sweepSection) scanlineSweep(sweepSection);
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
      <div data-beat="step" className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-muted">
          {stepLabel} — {Math.round(MOTION.step * 1000)}ms
        </p>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: CELL_COUNT }, (_, i) => (
            <span
              key={i}
              data-boot-cell
              data-lit="true"
              // Unlit state uses the world's own --ghost tone (bg-ghost),
              // the same "unlit segments are designed too" treatment
              // SegmentDisplay's .segment-ghost cells use — not bg-panel,
              // which is a surface tone, not the ghost-cell tone.
              className="size-7 border border-line bg-ghost data-[lit=true]:border-brand data-[lit=true]:bg-brand data-[lit=true]:shadow-[0_0_6px_1px_var(--accent)]"
            />
          ))}
        </div>
        <p className="border border-line bg-panel p-4 text-sm text-ink">{stepCopy}</p>
      </div>

      <div data-beat="sweep" className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-muted">
          {sweepLabel} — {Math.round(MOTION.sweep * 1000)}ms
        </p>
        {/* Same three-layer structure as RevealSection (rule / beam strip /
         * content) at demo scale, driven directly by scanlineSweep() above
         * rather than a ScrollTrigger — this box has no scroll cinema of
         * its own to hook into. */}
        <div data-sweep-demo className="relative overflow-hidden border border-line bg-panel p-4">
          <span
            data-scanline
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-full opacity-0 bg-[linear-gradient(90deg,transparent,var(--accent)_45%,var(--accent)_55%,transparent)]"
          />
          <p data-scanline-content className="text-sm text-ink">
            {sweepCopy}
          </p>
        </div>
      </div>

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
