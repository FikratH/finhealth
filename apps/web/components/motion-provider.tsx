"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { usePathname } from "@/i18n/navigation";
import { getPrefersReducedMotion, usePrefersReducedMotion } from "@/lib/motion";
import { RESULTS_ROUTE_SEGMENT } from "@/lib/motion-routes";
import { setLenis } from "@/components/lenis-slot";

// Register once per module load, not once per mount — mounted at the
// locale layout it only ever runs once anyway, but this guard keeps a
// stray remount (React Strict Mode, HMR) from re-registering the plugin.
let scrollTriggerRegistered = false;
function registerScrollTriggerOnce() {
  if (scrollTriggerRegistered) return;
  gsap.registerPlugin(ScrollTrigger);
  scrollTriggerRegistered = true;
}

// GSAP's own factory defaults (gsap-core: threshold 500ms, adjustedLag
// 33ms) — restored explicitly on cleanup below, since this provider is the
// only thing in the app that ever calls lagSmoothing(0). Without this, a
// visitor who leaves /results/* still carries the "never smooth over a
// stalled frame" setting into every other route's GSAP work (the
// MotionDemo beats, any future non-results motion) for the rest of the
// session.
const GSAP_DEFAULT_LAG_SMOOTHING_THRESHOLD = 500;
const GSAP_DEFAULT_LAG_SMOOTHING_ADJUSTED_LAG = 33;

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
 * Pure infrastructure — takes no children and renders nothing (`null`).
 * components/motion-provider-lazy.tsx (the only caller) mounts this as an
 * effects-only SIBLING of the app's actual content, not a wrapper around
 * it (review-t4-verdict.md, Finding 7): a wrapper's own type flips between
 * a Fragment and this component's `next/dynamic()` boundary depending on
 * route, and React remounts everything at that tree position on a type
 * change — which was unmounting/remounting the whole app shell
 * (AuthBootstrap, SiteHeader, main, SiteFooter) on every results↔non-
 * results client navigation. Rendering nothing and living beside the
 * content instead of around it means this component's own mount/unmount
 * cycle (which SHOULD happen exactly on that route boundary) never touches
 * anything else's.
 */
export function MotionProvider() {
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
    setLenis(lenis);
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
      setLenis(null);
      lenis.off("scroll", onScroll);
      lenis.destroy();
    };
  }, [isResultsRoute, prefersReducedMotion]);

  return null;
}
