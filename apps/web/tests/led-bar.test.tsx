import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { LedBar, type LedBarHandle } from "@/components/led-bar";

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

describe("LedBar — cell count and quantization", () => {
  it("renders the default 10 cells", () => {
    const { container } = render(<LedBar value={50} />);
    expect(container.querySelectorAll("[data-cell-on], .bg-ghost").length).toBe(10);
  });

  it("respects a custom cells count", () => {
    const { container } = render(<LedBar value={50} cells={4} />);
    expect(container.querySelectorAll("[data-cell-on], .bg-ghost").length).toBe(4);
  });

  it.each([
    [0, 10, 0],
    [4, 10, 0], // 4/100 × 10 = 0.4 → rounds down to 0
    [50, 10, 5],
    [50, 4, 2], // cells prop changes the quantization, not just the count
    [96, 10, 10], // 9.6 → rounds up to 10 (all lit, not 9)
    [100, 10, 10],
  ])("value %d with %d cells lights exactly %d cells", (value, cells, expectedLit) => {
    const { container } = render(<LedBar value={value} cells={cells} />);
    expect(container.querySelectorAll("[data-cell-on]").length).toBe(expectedLit);
  });

  it("clamps an out-of-range value into [0, 100] before quantizing", () => {
    const { container: over } = render(<LedBar value={250} cells={10} />);
    expect(over.querySelectorAll("[data-cell-on]").length).toBe(10);

    const { container: under } = render(<LedBar value={-40} cells={10} />);
    expect(under.querySelectorAll("[data-cell-on]").length).toBe(0);
  });
});

describe("LedBar — designed absence", () => {
  it("renders every cell as ghost — never hidden — when value is null", () => {
    const { container } = render(<LedBar value={null} cells={10} />);
    expect(container.querySelectorAll("[data-cell-on]").length).toBe(0);
    expect(container.querySelectorAll(".bg-ghost").length).toBe(10);
  });
});

describe("LedBar — accessibility", () => {
  it("is aria-hidden — the real value lives on whatever the caller wraps this in", () => {
    const { container } = render(<LedBar value={50} />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});

describe("LedBar — ignition and reduced motion", () => {
  it("under reduced motion, ignite() leaves lit cells lit (the SSR/no-JS default) with no error", () => {
    mockMatchMedia(true);
    const ref = createRef<LedBarHandle>();
    const { container } = render(<LedBar ref={ref} value={50} />);

    expect(() => ref.current?.ignite()).not.toThrow();

    const litCells = container.querySelectorAll("[data-cell-on]");
    expect(litCells.length).toBeGreaterThan(0);
    for (const el of Array.from(litCells)) {
      expect(el.getAttribute("data-lit")).toBe("true");
    }
  });

  it("without reduced motion, ignite() resets lit cells to unlit before cascading them back on", () => {
    mockMatchMedia(false);
    const ref = createRef<LedBarHandle>();
    const { container } = render(<LedBar ref={ref} value={50} />);

    ref.current?.ignite();

    const litCells = container.querySelectorAll("[data-cell-on]");
    expect(litCells.length).toBeGreaterThan(0);
    for (const el of Array.from(litCells)) {
      expect(el.getAttribute("data-lit")).toBe("false");
    }
  });

  it("never marks a ghost cell data-cell-on — ghost cells stay outside ignition entirely", () => {
    mockMatchMedia(false);
    const ref = createRef<LedBarHandle>();
    const { container } = render(<LedBar ref={ref} value={30} cells={10} />);

    ref.current?.ignite();

    const ghostCells = container.querySelectorAll(".bg-ghost");
    expect(ghostCells.length).toBeGreaterThan(0);
    for (const el of Array.from(ghostCells)) {
      expect(el.hasAttribute("data-cell-on")).toBe(false);
    }
  });

  it("ignite() is a harmless no-op when nothing is lit (a null reading)", () => {
    const ref = createRef<LedBarHandle>();
    render(<LedBar ref={ref} value={null} />);
    expect(() => ref.current?.ignite()).not.toThrow();
  });
});
