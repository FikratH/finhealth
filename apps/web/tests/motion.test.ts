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
    // jsdom's window.matchMedia is unimplemented by default in this
    // project's setup — the hook must not throw when it's missing, and
    // must fall back to the "motion allowed" default.
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });
});
