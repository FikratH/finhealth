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

// GSAP's own factory defaults (gsap-core: threshold 500ms, adjustedLag
// 33ms) — restored explicitly on cleanup below, since this provider is the
// only thing in the app that ever calls lagSmoothing(0). Without this, a
// visitor who leaves /results/* still carries the "never smooth over a
// stalled frame" setting into every other route's GSAP work (the
// MotionDemo beats, any future non-results motion) for the rest of the
// session.
const GSAP_DEFAULT_LAG_SMOOTHING_THRESHOLD = 500;
const GSAP_DEFAULT_LAG_SMOOTHING_ADJUSTED_LAG = 33;

let activeLenis: Lenis | null = null;

/**
 * The Lenis instance this provider is currently driving, or `null` when
 * none exists (non-results routes, reduced motion, or before the effect
 * below has run). Read-only accessor for descendants that need to trigger
 * a smooth scroll (the results mini-nav's click-to-navigate) — they call
 * this rather than constructing their own Lenis, and fall back to a plain
 * anchor jump when it returns `null`.
 */
export function getLenis(): Lenis | null {
  return activeLenis;
}

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
    activeLenis = lenis;
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
    // created them, not to this provider. lagSmoothing(0) is restored to
    // GSAP's own defaults so it doesn't leak into other routes' GSAP work.
    return () => {
      gsap.ticker.remove(onTick);
      gsap.ticker.lagSmoothing(
        GSAP_DEFAULT_LAG_SMOOTHING_THRESHOLD,
        GSAP_DEFAULT_LAG_SMOOTHING_ADJUSTED_LAG,
      );
      activeLenis = null;
      lenis.off("scroll", onScroll);
      lenis.destroy();
    };
  }, [isResultsRoute, prefersReducedMotion]);

  return <>{children}</>;
}
