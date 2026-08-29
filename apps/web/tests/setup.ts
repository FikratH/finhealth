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
// `window` itself doesn't exist under a `// @vitest-environment node`
// override (tests/auth-token-route.test.ts — a pure Node/API integration
// test with no DOM involved) — guard the whole block, not just the
// property check.
if (typeof window !== "undefined" && typeof window.matchMedia === "undefined") {
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

// jsdom has no layout engine and doesn't implement Element.scrollIntoView
// at all — Radix's Select (components/ui/select.tsx, used by every
// industry/scale/currency combobox in the app) calls it internally the
// moment its popup content mounts, to scroll the highlighted item into
// view. Without this stub, any test that actually opens a Select (rather
// than only asserting on its closed trigger) throws synchronously.
if (typeof window !== "undefined" && typeof window.HTMLElement.prototype.scrollIntoView === "undefined") {
  window.HTMLElement.prototype.scrollIntoView = () => {};
}
