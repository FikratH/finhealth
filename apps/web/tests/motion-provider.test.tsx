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

const { MotionProvider } = await import("@/components/motion-provider");

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
  it("renders children directly, with no wrapper element", () => {
    usePathname.mockReturnValue("/analyze");
    mockMatchMedia(false);

    const { container } = render(
      <MotionProvider>
        <p>child content</p>
      </MotionProvider>,
    );

    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild?.tagName).toBe("P");
  });

  it("on a /results/* route, adds exactly one gsap.ticker callback and removes it again on unmount — no leak", () => {
    usePathname.mockReturnValue("/results/abc123");
    mockMatchMedia(false);

    const baseline = tickerListenerCount();

    const { unmount } = render(
      <MotionProvider>
        <p>child</p>
      </MotionProvider>,
    );

    expect(tickerListenerCount()).toBe(baseline + 1);
    expect(LenisMock).toHaveBeenCalledTimes(1);

    unmount();

    expect(tickerListenerCount()).toBe(baseline);
    expect(lenisInstances[0]?.destroy).toHaveBeenCalledTimes(1);
  });

  it("matches the /en/results/* prefixed form too", () => {
    usePathname.mockReturnValue("/en/results/abc123");
    mockMatchMedia(false);

    render(
      <MotionProvider>
        <p>child</p>
      </MotionProvider>,
    );

    expect(LenisMock).toHaveBeenCalledTimes(1);
  });

  it("never constructs Lenis under prefers-reduced-motion, even on a /results/* route", () => {
    usePathname.mockReturnValue("/results/abc123");
    mockMatchMedia(true);

    const baseline = tickerListenerCount();

    render(
      <MotionProvider>
        <p>child</p>
      </MotionProvider>,
    );

    expect(LenisMock).not.toHaveBeenCalled();
    expect(tickerListenerCount()).toBe(baseline);
  });

  it("never constructs Lenis on a non-results route", () => {
    usePathname.mockReturnValue("/analyze");
    mockMatchMedia(false);

    const baseline = tickerListenerCount();

    render(
      <MotionProvider>
        <p>child</p>
      </MotionProvider>,
    );

    expect(LenisMock).not.toHaveBeenCalled();
    expect(tickerListenerCount()).toBe(baseline);
  });
});
