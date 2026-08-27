import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Vitest's `globals` option is off (tests import describe/it/expect
// explicitly), so Testing Library can't auto-detect `afterEach` to
// self-register its DOM cleanup — without this, one test's render leaks
// into the next test's queries within the same file.
afterEach(cleanup);

// jsdom has no layout engine and doesn't implement requestAnimationFrame —
// gsap.ticker (the metronome's clock, driving every GSAP tween and Lenis's
// raf loop on /results/*) needs it polyfilled to run at all under jsdom.
if (typeof globalThis.requestAnimationFrame === "undefined") {
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0) as unknown as number;
  globalThis.cancelAnimationFrame = (handle: number) => clearTimeout(handle);
}

// jsdom doesn't implement window.matchMedia at all. Most of this suite
// already works around that per-test (usePrefersReducedMotion's own
// "unavailable" fallback, motion-provider.test.tsx's local mock) — but
// gsap's ScrollTrigger plugin calls matchMedia unconditionally the moment
// it's *registered* (gsap-core's MatchMedia.add, used for its own internal
// media-query bookkeeping), regardless of whether any component's effects
// have run yet. Without this default stub, importing any component that
// registers ScrollTrigger throws synchronously in every test file, not
// just the ones that exercise scroll behavior. `matches: false` mirrors
// usePrefersReducedMotion's own SSR-safe default ("motion allowed"); tests
// that need the reduced-motion branch still override `window.matchMedia`
// locally, which takes precedence over this default.
if (typeof window.matchMedia === "undefined") {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
