"use client";

import { useSyncExternalStore } from "react";
import gsap from "gsap";

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
  /** The boot grammar's inter-segment/inter-digit cascade step — each
   * target in an igniteSequence() lights this far after the previous one. */
  step: 0.06,
  /** The scanline sweep's own duration — one thin teal line crossing a
   * section as content ignites behind it. */
  sweep: 0.45,
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

/**
 * The boot grammar's law: "every change is an instant segment swap." Every
 * element `targets` resolves to (queried via `gsap.utils.toArray`, scoped
 * to `scope` the same way `gsap.utils.selector` scopes a ref) is flipped
 * from "off" to "lit" — by toggling `attribute` (default "data-lit") to
 * `"true"` — one at a time, MOTION.step apart, via a GSAP timeline of
 * `.set()` calls. Never a tween: each target's own lit/unlit color comes
 * from CSS reading that attribute, not from an animated property, so the
 * "instant state" stays instant at every step.
 *
 * Elements should render with `[attribute]="true"` (already lit) by
 * default — the SSR/no-JS baseline, same discipline as the score
 * SegmentDisplay's own ignition cascade (score-header.tsx): a crawler or
 * no-JS visitor always sees the finished state, never an empty one. Call
 * this from a layout-timed effect (`useGSAP`, not a plain `useEffect`) so
 * the reset-to-off-then-cascade happens before the browser's first paint —
 * exactly how results-document.tsx's load-time timeline drives that
 * ignition from an unlit state without a visible flash of the final state
 * first.
 *
 * Reduced motion: every target is set lit immediately and synchronously,
 * no timeline is created, and this returns `null` — "instruments simply
 * already on."
 */
export function igniteSequence(
  scope: Element,
  targets: string,
  options: { attribute?: string } = {},
): gsap.core.Timeline | null {
  const attribute = options.attribute ?? "data-lit";
  const els = gsap.utils.toArray<Element>(targets, scope);

  if (getPrefersReducedMotion()) {
    for (const el of els) el.setAttribute(attribute, "true");
    return null;
  }

  for (const el of els) el.setAttribute(attribute, "false");

  const tl = gsap.timeline();
  els.forEach((el, i) => {
    tl.set(el, { attr: { [attribute]: "true" } }, i * MOTION.step);
  });
  return tl;
}

/**
 * Section-entry motion: one thin teal line sweeps across `section` over
 * MOTION.sweep seconds (a genuine tween — the line's own travel is
 * continuous, not stepped) while the content behind it ignites in the
 * boot grammar's discrete instant steps, timed to land under where the
 * line currently is. `section` must contain exactly one `[data-scanline]`
 * element (the line itself) and any number of `[data-scanline-content]`
 * elements (revealed via the "hidden" attribute below, so no-JS/reduced
 * motion visitors see them unconditionally — they simply lack the
 * attribute that would hide them).
 *
 * Reduced motion: the line never appears (opacity 0) and every content
 * target is revealed immediately, synchronously, no timeline — returns
 * `null`.
 */
export function scanlineSweep(section: Element): gsap.core.Timeline | null {
  const line = section.querySelector<HTMLElement>("[data-scanline]");
  const content = gsap.utils.toArray<Element>("[data-scanline-content]", section);

  if (getPrefersReducedMotion()) {
    if (line) line.style.opacity = "0";
    for (const el of content) el.removeAttribute("data-scanline-hidden");
    return null;
  }

  if (line) gsap.set(line, { opacity: 1, xPercent: -100 });
  for (const el of content) el.setAttribute("data-scanline-hidden", "true");

  const tl = gsap.timeline();
  if (line) {
    tl.to(line, { xPercent: 100, duration: MOTION.sweep, ease: MOTION.ease });
  }
  content.forEach((el, i) => {
    tl.call(() => el.removeAttribute("data-scanline-hidden"), undefined, i * MOTION.step);
  });
  if (line) {
    tl.set(line, { opacity: 0 });
  }
  return tl;
}

/**
 * The flashing-12:00 idiom, for a value that is pending/unset — never for
 * anything else. A 0.5s full duty cycle (0.25s dim, 0.25s back to lit),
 * looped indefinitely until the caller kills the returned tween (e.g. once
 * the real value arrives). Toggles `data-blink="true"` on `el` for the
 * duration so CSS can key any accompanying (non-opacity) styling off it.
 *
 * Reduced motion: `el` is left at full opacity, `data-blink` is set to
 * "false", and no tween is created — a pending value reads as steady
 * (still legible via its own "—"/N/A text), never strobing.
 */
export function blinkPending(el: Element): gsap.core.Tween | null {
  if (getPrefersReducedMotion()) {
    el.setAttribute("data-blink", "false");
    return null;
  }

  el.setAttribute("data-blink", "true");
  return gsap.to(el, {
    opacity: 0.25,
    duration: 0.25,
    repeat: -1,
    yoyo: true,
    ease: "none",
  });
}
