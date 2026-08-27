import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import gsap from "gsap";

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));

// MotionProvider reads next-intl's usePathname (via "@/i18n/navigation") to
// decide whether it's on a /results/* route — mock just that export, same
// pattern as tests/site-header.test.tsx.
vi.mock("@/i18n/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/i18n/navigation")>();
  return { ...actual, usePathname };
});

const { LenisMock, lenisInstances } = vi.hoisted(() => {
  const instances: {
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    raf: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }[] = [];

  // `new Lenis()` requires a constructor function, not an arrow function.
  const ctor = vi.fn().mockImplementation(function MockLenis() {
    const instance = {
      on: vi.fn(),
      off: vi.fn(),
      raf: vi.fn(),
      destroy: vi.fn(),
    };
    instances.push(instance);
    return instance;
  });

  return { LenisMock: ctor, lenisInstances: instances };
});

// Real Lenis touches browser scroll/ResizeObserver APIs jsdom doesn't fully
// implement. What these tests verify is the provider's own contract — when
// it constructs Lenis and what it tears down — so a mock with the same
// on/off/raf/destroy surface is enough; vi.mock('lenis') is also the
// requested way to assert "the constructor was never called".
vi.mock("lenis", () => ({ default: LenisMock }));

const { MotionProvider, getLenis } = await import("@/components/motion-provider");

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

// gsap.ticker's internal "tick" listener array. Not public API, but it's
// the only direct way to prove the provider adds exactly one callback on
// mount and removes exactly that one again on unmount, with nothing left
// over — the leak this task's brief calls out by name.
function tickerListenerCount() {
  return (gsap.ticker as unknown as { _listeners: unknown[] })._listeners.length;
}

beforeEach(() => {
  usePathname.mockReset();
  LenisMock.mockClear();
  lenisInstances.length = 0;
});

afterEach(() => {
  cleanup();
});

describe("MotionProvider", () => {
  // review-t4-verdict.md Finding 7 (P6 close wave): MotionProvider is now
  // an effects-only sibling, not a wrapper — components/motion-provider-
  // lazy.tsx renders it beside `children`, not around them, so a route
  // change never flips the element TYPE at `children`'s own tree position
  // (the bug: that flip was unmounting/remounting the whole app shell on
  // every results↔non-results navigation). This module's own contract
  // shrinks accordingly: it takes no children and renders nothing.
  it("takes no children and renders nothing itself", () => {
    usePathname.mockReturnValue("/analyze");
    mockMatchMedia(false);

    const { container } = render(<MotionProvider />);

    expect(container.children).toHaveLength(0);
  });

  it("on a /results/* route, adds exactly one gsap.ticker callback and removes it again on unmount — no leak", () => {
    usePathname.mockReturnValue("/results/abc123");
    mockMatchMedia(false);

    const baseline = tickerListenerCount();

    const { unmount } = render(<MotionProvider />);

    expect(tickerListenerCount()).toBe(baseline + 1);
    expect(LenisMock).toHaveBeenCalledTimes(1);

    unmount();

    expect(tickerListenerCount()).toBe(baseline);
    expect(lenisInstances[0]?.destroy).toHaveBeenCalledTimes(1);
  });

  it("matches the /en/results/* prefixed form too", () => {
    usePathname.mockReturnValue("/en/results/abc123");
    mockMatchMedia(false);

    render(<MotionProvider />);

    expect(LenisMock).toHaveBeenCalledTimes(1);
  });

  it("never constructs Lenis under prefers-reduced-motion, even on a /results/* route", () => {
    usePathname.mockReturnValue("/results/abc123");
    mockMatchMedia(true);

    const baseline = tickerListenerCount();

    render(<MotionProvider />);

    expect(LenisMock).not.toHaveBeenCalled();
    expect(tickerListenerCount()).toBe(baseline);
  });

  it("never constructs Lenis on a non-results route", () => {
    usePathname.mockReturnValue("/analyze");
    mockMatchMedia(false);

    const baseline = tickerListenerCount();

    render(<MotionProvider />);

    expect(LenisMock).not.toHaveBeenCalled();
    expect(tickerListenerCount()).toBe(baseline);
  });

  it("exposes the live Lenis instance via getLenis() while mounted on a /results/* route, and clears it again on unmount", () => {
    usePathname.mockReturnValue("/results/abc123");
    mockMatchMedia(false);

    expect(getLenis()).toBeNull();

    const { unmount } = render(<MotionProvider />);

    expect(getLenis()).toBe(lenisInstances[0]);

    unmount();

    expect(getLenis()).toBeNull();
  });

  it("getLenis() stays null when no Lenis was ever constructed (non-results route)", () => {
    usePathname.mockReturnValue("/analyze");
    mockMatchMedia(false);

    render(<MotionProvider />);

    expect(getLenis()).toBeNull();
  });

  it("restores gsap.ticker.lagSmoothing to GSAP's own defaults (500ms, 33ms) on unmount, so the setting doesn't leak into other routes", () => {
    usePathname.mockReturnValue("/results/abc123");
    mockMatchMedia(false);

    const lagSmoothingSpy = vi.spyOn(gsap.ticker, "lagSmoothing");

    const { unmount } = render(<MotionProvider />);

    expect(lagSmoothingSpy).toHaveBeenCalledWith(0);

    unmount();

    expect(lagSmoothingSpy).toHaveBeenLastCalledWith(500, 33);

    lagSmoothingSpy.mockRestore();
  });
});
