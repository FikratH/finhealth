import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { MOTION, usePrefersReducedMotion } from "@/lib/motion";

describe("MOTION", () => {
  it("exposes the metronome's three durations and one ease family", () => {
    expect(MOTION).toEqual({
      fast: 0.15,
      base: 0.2,
      reveal: 0.6,
      ease: "power2.out",
    });
  });

  it("orders durations fast < base < reveal — the metronome accelerates for micro-feedback, slows for scroll-scrubbed reveals", () => {
    expect(MOTION.fast).toBeLessThan(MOTION.base);
    expect(MOTION.base).toBeLessThan(MOTION.reveal);
  });
});

describe("usePrefersReducedMotion", () => {
  it("reports false before the media query has been read (SSR-safe default)", () => {
    // tests/setup.ts stubs window.matchMedia to matches: false by default
    // (jsdom implements no matchMedia of its own at all — needed so that
    // merely registering gsap's ScrollTrigger, which reads matchMedia
    // unconditionally, doesn't throw in every test file that touches it).
    // This test exercises the hook's normal read of that default, not a
    // "matchMedia is missing" fallback path — getPrefersReducedMotion's own
    // typeof-guarded fallback is what still protects against an
    // environment with no matchMedia at all (e.g. true SSR).
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });
});
