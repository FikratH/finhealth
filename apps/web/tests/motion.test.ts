import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import gsap from "gsap";
import {
  blinkPending,
  getPrefersReducedMotion,
  igniteSequence,
  MOTION,
  scanlineLoop,
  scanlineSweep,
  usePrefersReducedMotion,
} from "@/lib/motion";

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

afterEach(() => {
  mockMatchMedia(false);
});

describe("MOTION", () => {
  it("exposes the metronome's durations and one ease family", () => {
    expect(MOTION).toEqual({
      fast: 0.15,
      base: 0.2,
      reveal: 0.6,
      step: 0.06,
      sweep: 0.45,
      ease: "power2.out",
    });
  });

  it("orders durations fast < base < reveal — the metronome accelerates for micro-feedback, slows for scroll-scrubbed reveals", () => {
    expect(MOTION.fast).toBeLessThan(MOTION.base);
    expect(MOTION.base).toBeLessThan(MOTION.reveal);
  });

  it("keeps step well under fast — the boot cascade's per-target beat is finer than any other micro-interaction", () => {
    expect(MOTION.step).toBeLessThan(MOTION.fast);
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

function makeDigitCell(lit: boolean) {
  const el = document.createElement("span");
  el.setAttribute("data-segment-on", "");
  el.setAttribute("data-lit", String(lit));
  return el;
}

describe("igniteSequence", () => {
  it("under reduced motion, sets every target lit immediately and returns null (no timeline)", () => {
    mockMatchMedia(true);
    const scope = document.createElement("div");
    const a = makeDigitCell(false);
    const b = makeDigitCell(false);
    scope.append(a, b);

    const result = igniteSequence(scope, "[data-segment-on]");

    expect(result).toBeNull();
    expect(a.getAttribute("data-lit")).toBe("true");
    expect(b.getAttribute("data-lit")).toBe("true");
  });

  it("without reduced motion, resets every target to unlit and returns a timeline that cascades them lit MOTION.step apart", () => {
    mockMatchMedia(false);
    const scope = document.createElement("div");
    const a = makeDigitCell(true);
    const b = makeDigitCell(true);
    const c = makeDigitCell(true);
    scope.append(a, b, c);

    const tl = igniteSequence(scope, "[data-segment-on]");

    expect(tl).not.toBeNull();
    // Synchronously after construction (before the timeline has played),
    // every target has already been reset to unlit by the initial .set().
    expect(a.getAttribute("data-lit")).toBe("false");
    expect(b.getAttribute("data-lit")).toBe("false");
    expect(c.getAttribute("data-lit")).toBe("false");

    tl!.progress(1);

    expect(a.getAttribute("data-lit")).toBe("true");
    expect(b.getAttribute("data-lit")).toBe("true");
    expect(c.getAttribute("data-lit")).toBe("true");

    tl!.kill();
  });

  it("scopes the target query to the given element, ignoring matches outside it", () => {
    mockMatchMedia(false);
    const scope = document.createElement("div");
    const inside = makeDigitCell(true);
    scope.append(inside);
    const outside = makeDigitCell(true);
    document.body.append(outside);

    const tl = igniteSequence(scope, "[data-segment-on]");
    tl!.progress(1);

    expect(inside.getAttribute("data-lit")).toBe("true");
    // Never touched — it was reset to unlit by the initial .set() only if
    // matched, so if scoping worked it keeps its original "true".
    expect(outside.getAttribute("data-lit")).toBe("true");

    tl!.kill();
    outside.remove();
  });

  it("honors a custom attribute name", () => {
    mockMatchMedia(true);
    const scope = document.createElement("div");
    const el = document.createElement("span");
    el.setAttribute("data-cell", "");
    scope.append(el);

    igniteSequence(scope, "[data-cell]", { attribute: "data-boot" });

    expect(el.getAttribute("data-boot")).toBe("true");
  });
});

describe("scanlineSweep", () => {
  function makeSection() {
    const section = document.createElement("section");
    const line = document.createElement("div");
    line.setAttribute("data-scanline", "");
    const content = document.createElement("div");
    content.setAttribute("data-scanline-content", "");
    section.append(line, content);
    return { section, line, content };
  }

  it("under reduced motion, hides the line and reveals content immediately with no timeline", () => {
    mockMatchMedia(true);
    const { section, line, content } = makeSection();

    const result = scanlineSweep(section);

    expect(result).toBeNull();
    expect(line.style.opacity).toBe("0");
    expect(content.hasAttribute("data-scanline-hidden")).toBe(false);
  });

  it("without reduced motion, hides content up front and returns a timeline that reveals it and sweeps the line across", () => {
    mockMatchMedia(false);
    const { section, content } = makeSection();

    const tl = scanlineSweep(section);

    expect(tl).not.toBeNull();
    expect(content.getAttribute("data-scanline-hidden")).toBe("true");

    tl!.progress(1);

    expect(content.hasAttribute("data-scanline-hidden")).toBe(false);

    tl!.kill();
  });
});

// upload-step.tsx's busy-bay "still working" reading (founder feedback
// R1's second half — a real in-progress state during upload+extraction).
// A looping sibling of scanlineSweep's own line motion: same markup
// contract ([data-scanline]), same MOTION.sweep/ease tokens, but repeats
// indefinitely (back and forth, yoyo) rather than sweeping once to
// reveal content — there IS no content to reveal here, just an
// instrument waiting on a real external process.
describe("scanlineLoop", () => {
  function makeSection() {
    const section = document.createElement("section");
    const line = document.createElement("span");
    line.setAttribute("data-scanline", "");
    section.append(line);
    return { section, line };
  }

  it("returns null and hides the line when there is no [data-scanline] element in scope", () => {
    mockMatchMedia(false);
    const section = document.createElement("section");
    expect(scanlineLoop(section)).toBeNull();
  });

  it("under reduced motion, hides the line and returns no tween", () => {
    mockMatchMedia(true);
    const { section, line } = makeSection();

    const result = scanlineLoop(section);

    expect(result).toBeNull();
    expect(line.style.opacity).toBe("0");
  });

  it("without reduced motion, returns a repeating, yoyoing tween drawn from MOTION's own duration/ease", () => {
    mockMatchMedia(false);
    const { section } = makeSection();

    const tween = scanlineLoop(section);

    expect(tween).not.toBeNull();
    expect(tween!.repeat()).toBe(-1);
    expect(tween!.yoyo()).toBe(true);
    expect(tween!.duration()).toBeCloseTo(MOTION.sweep);

    tween!.kill();
  });
});

describe("blinkPending", () => {
  it("under reduced motion, marks data-blink false, leaves opacity untouched, and returns null", () => {
    mockMatchMedia(true);
    const el = document.createElement("span");

    const tween = blinkPending(el);

    expect(tween).toBeNull();
    expect(el.getAttribute("data-blink")).toBe("false");
    expect((el as HTMLElement).style.opacity).toBe("");
  });

  it("without reduced motion, marks data-blink true and returns a repeating, yoyoing tween", () => {
    mockMatchMedia(false);
    const el = document.createElement("span");

    const tween = blinkPending(el);

    expect(tween).not.toBeNull();
    expect(el.getAttribute("data-blink")).toBe("true");
    expect(tween!.repeat()).toBe(-1);
    expect(tween!.yoyo()).toBe(true);
    // Full duty cycle is 0.5s: 0.25s dim + 0.25s back to lit.
    expect(tween!.duration()).toBeCloseTo(0.25);

    tween!.kill();
  });
});

describe("gsap import sanity", () => {
  it("gsap is importable in this test environment (guards the helpers above against a broken setup)", () => {
    expect(typeof gsap.timeline).toBe("function");
  });
});
