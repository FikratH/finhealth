"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { cn } from "@/lib/utils";
import { MOTION, getPrefersReducedMotion } from "@/lib/motion";

gsap.registerPlugin(useGSAP);

// Founder ruling: the real brand mark outranks the segment-rendered
// wordmark concept — the hero's boot moment reveals the actual logo
// (apps/web/assets/tonus_teal_png.png, optimized copy at
// public/brand/logo-teal.png), not a SegmentDisplay-drawn "Tonus". Teal
// over the monitor's near-black ground (not white): the logo's own teal
// (~#01C1A9) sits close enough to --accent (#19C2B0) to read as the same
// brand color, and stays legible/on-voice against #0A0C0E the way white
// would read as generic rather than branded.
const WIPE_DURATION = MOTION.sweep * 2;

export interface LogoRevealProps {
  className?: string;
}

// The FIRST VIEWPORT's hero moment: a clip-path wipe reveals the logo
// left-to-right, once, on load — a thin teal scanline leads the reveal
// edge (the same "one thin line sweeps, content behind it appears" grammar
// as lib/motion's scanlineSweep, but load-timed and single-target rather
// than scroll-triggered/multi-target, so it's its own small effect rather
// than a reuse of that helper). SSR/no-JS default is the fully revealed
// logo (no clip, line hidden) — a crawler or no-JS visitor always sees the
// finished mark, matching every other load-time animation in this app
// (ScoreDial's arc, SegmentDisplay's ignite). Reduced motion: the effect
// returns immediately, leaving that same default state untouched.
export function LogoReveal({ className }: LogoRevealProps) {
  const scope = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      if (getPrefersReducedMotion()) return;

      const root = scope.current;
      const mask = root?.querySelector<HTMLElement>("[data-logo-mask]");
      const line = root?.querySelector<HTMLElement>("[data-logo-scanline]");
      if (!root || !mask) return;

      gsap.set(mask, { clipPath: "inset(0 100% 0 0)" });
      const tl = gsap.timeline();
      tl.to(mask, { clipPath: "inset(0 0% 0 0)", duration: WIPE_DURATION, ease: MOTION.ease }, 0);

      if (line) {
        gsap.set(line, { opacity: 1, left: "0%" });
        tl.fromTo(
          line,
          { left: "0%" },
          { left: "100%", duration: WIPE_DURATION, ease: MOTION.ease },
          0,
        );
        tl.set(line, { opacity: 0 });
      }
    },
    { scope, dependencies: [] },
  );

  return (
    <span ref={scope} className={cn("relative inline-block", className)}>
      <span data-logo-mask className="block h-full" style={{ clipPath: "inset(0 0% 0 0)" }}>
        <img
          src="/brand/logo-teal.png"
          alt="Tonus"
          width={800}
          height={450}
          className="h-full w-auto"
        />
      </span>
      <span
        data-logo-scanline
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 w-px bg-brand opacity-0 shadow-[0_0_12px_2px_var(--accent)]"
      />
    </span>
  );
}
