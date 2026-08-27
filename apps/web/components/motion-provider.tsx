"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { usePathname } from "@/i18n/navigation";
import { getPrefersReducedMotion, usePrefersReducedMotion } from "@/lib/motion";

// Register once per module load, not once per mount — mounted at the
// locale layout it only ever runs once anyway, but this guard keeps a
// stray remount (React Strict Mode, HMR) from re-registering the plugin.
let scrollTriggerRegistered = false;
function registerScrollTriggerOnce() {
  if (scrollTriggerRegistered) return;
  gsap.registerPlugin(ScrollTrigger);
  scrollTriggerRegistered = true;
}

// Matches both the ru (no prefix) and en ("/en" prefix) forms of
// /results/[id] under next-intl's "as-needed" locale prefix.
const RESULTS_ROUTE_SEGMENT = "/results/";

type MotionProviderProps = {
  children: ReactNode;
};

/**
 * The scroll layer of the one metronome. Registers ScrollTrigger once for
 * the whole app, and — only on /results/* (the diagnosis cinema) and only
 * when the visitor has not asked for reduced motion — creates a Lenis
 * smooth scroller wired into gsap.ticker per Lenis's official
 * ScrollTrigger integration (lenis.raf driven by the ticker, lag smoothing
 * disabled so GSAP and Lenis never fight over frame timing). Every other
 * route, and reduced motion on any route, gets native scroll: no Lenis
 * instance is ever constructed.
 *
 * Pure infrastructure — renders `children` directly, never a wrapper
 * element, so it never participates in layout.
 */
export function MotionProvider({ children }: MotionProviderProps) {
  const pathname = usePathname();
  const prefersReducedMotion = usePrefersReducedMotion();
  const isResultsRoute = pathname?.includes(RESULTS_ROUTE_SEGMENT) ?? false;

  useEffect(() => {
    registerScrollTriggerOnce();
  }, []);

  useEffect(() => {
    // Re-check synchronously rather than trusting `prefersReducedMotion`
    // directly: that value comes from usePrefersReducedMotion's own effect,
    // which hasn't necessarily run yet on this same first commit (effects
    // run in hook-declaration order, but a setState from an earlier effect
    // only takes effect on the *next* render) — reading fresh here means
    // reduced motion is honored from the very first run, not one render
    // late (which would otherwise construct-then-immediately-destroy Lenis
    // instead of never constructing it).
    if (!isResultsRoute || getPrefersReducedMotion()) {
      return;
    }

    const lenis = new Lenis();
    const onScroll = () => ScrollTrigger.update();
    lenis.on("scroll", onScroll);

    // The official Lenis + GSAP integration: drive Lenis's raf loop from
    // gsap.ticker (whose tick callback receives elapsed time in seconds,
    // hence *1000) instead of its own requestAnimationFrame loop, and turn
    // off GSAP's lag smoothing so a stalled frame doesn't fight Lenis's
    // own smoothing.
    const onTick = (time: number) => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(onTick);
    gsap.ticker.lagSmoothing(0);

    // Full cleanup on unmount or route change: kill only what this effect
    // created — our ticker callback and this Lenis instance. Never
    // ScrollTrigger.killAll() here; triggers belong to whichever component
    // created them, not to this provider.
    return () => {
      gsap.ticker.remove(onTick);
      lenis.off("scroll", onScroll);
      lenis.destroy();
    };
  }, [isResultsRoute, prefersReducedMotion]);

  return <>{children}</>;
}
