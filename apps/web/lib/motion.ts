"use client";

import { useSyncExternalStore } from "react";

/**
 * The one metronome. Every GSAP/Lenis animation in the app draws its
 * duration and ease from here — one ease family (power2.out), three
 * durations. No component defines its own tween timing.
 */
export const MOTION = {
  /** Micro-interactions: hover/press feedback, ink-in state changes. */
  fast: 0.15,
  /** The default beat: reveals, entrances, the verdict stamp "applying". */
  base: 0.2,
  /** Scroll-scrubbed reveals (hairline draws, section fades). */
  reveal: 0.6,
  /** The one committed ease family — no bounce, no elastic, no scattered eases. */
  ease: "power2.out",
} as const;

export type MotionTokens = typeof MOTION;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Synchronous, one-shot read of the current preference. `false` on the
 * server or anywhere `matchMedia` is unavailable. Also usable directly
 * inside an effect (e.g. MotionProvider deciding whether to construct
 * Lenis) when the decision should read the live browser state at the
 * exact moment the effect runs, independent of React's render/commit
 * cycle — this is also `usePrefersReducedMotion`'s `getSnapshot`.
 */
export function getPrefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mql = window.matchMedia(REDUCED_MOTION_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * SSR-safe, reactive prefers-reduced-motion for conditional rendering.
 * Built on `useSyncExternalStore` (the React-sanctioned way to read a
 * value from an external, mutable source like `matchMedia`) rather than
 * `useState` + `useEffect`: the server snapshot is always `false`, and on
 * the client the real value is available synchronously on first read —
 * no extra effect-triggered re-render tick, so a sibling effect in the
 * same component never observes a stale default the way it would with a
 * state-synced-in-an-effect pattern.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getPrefersReducedMotion, getServerSnapshot);
}
