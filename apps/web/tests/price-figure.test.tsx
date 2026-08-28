import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PriceFigure } from "@/components/pricing/price-figure";

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

// finish-wave material_fix 3: pricing's one authored moment — each price
// figure ignites on mount via useGSAP + SegmentDisplay's own ignite()
// handle. Mirrors segment-display.test.tsx's own ignition assertions
// (data-lit before/after) rather than re-testing SegmentDisplay's digit
// truth table, which PriceFigure doesn't touch.
describe("PriceFigure", () => {
  it("renders the value as a segment figure with the given caption", () => {
    render(<PriceFigure value={19} caption="Цена" />);
    expect(screen.getByRole("img", { name: "19 — Цена" })).toBeInTheDocument();
  });

  it("without reduced motion, ignites on mount — active segments start unlit, mid-cascade", () => {
    mockMatchMedia(false);
    const { container } = render(<PriceFigure value={7} />);

    const onSegments = container.querySelectorAll("[data-segment-on]");
    expect(onSegments.length).toBeGreaterThan(0);
    for (const el of Array.from(onSegments)) {
      expect(el.getAttribute("data-lit")).toBe("false");
    }
  });

  it("under reduced motion, renders fully lit immediately — instruments simply already on", () => {
    mockMatchMedia(true);
    const { container } = render(<PriceFigure value={7} />);

    const onSegments = container.querySelectorAll("[data-segment-on]");
    expect(onSegments.length).toBeGreaterThan(0);
    for (const el of Array.from(onSegments)) {
      expect(el.getAttribute("data-lit")).toBe("true");
    }
  });

  it("renders a lit zero, not designed absence — a real price of 0 is a real value", () => {
    mockMatchMedia(true);
    render(<PriceFigure value={0} caption="Цена" />);
    expect(screen.getByRole("img", { name: "0 — Цена" })).toBeInTheDocument();
  });
});
