import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SegmentDisplay, type SegmentDisplayHandle } from "@/components/segment-display";

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

const ALL_SEGMENTS = ["a", "b", "c", "d", "e", "f", "g"] as const;

// The standard seven-segment truth table — asserted independently of
// SegmentDisplay's own internal lookup table, against the rendered DOM.
const DIGIT_SEGMENTS: Record<string, string[]> = {
  "0": ["a", "b", "c", "d", "e", "f"],
  "1": ["b", "c"],
  "2": ["a", "b", "g", "e", "d"],
  "3": ["a", "b", "g", "c", "d"],
  "4": ["f", "g", "b", "c"],
  "5": ["a", "f", "g", "c", "d"],
  "6": ["a", "f", "g", "e", "c", "d"],
  "7": ["a", "b", "c"],
  "8": ["a", "b", "c", "d", "e", "f", "g"],
  "9": ["a", "b", "c", "d", "f", "g"],
};

function onSegmentsOf(cell: Element): string[] {
  return ALL_SEGMENTS.filter(
    (seg) => cell.querySelector(`[data-segment="${seg}"]`)?.hasAttribute("data-segment-on"),
  );
}

describe("SegmentDisplay — digit correctness matrix", () => {
  it.each(Object.entries(DIGIT_SEGMENTS))("lights exactly the right segments for digit %s", (digit, expected) => {
    const { container } = render(<SegmentDisplay value={Number(digit)} />);
    const cell = container.querySelector(`[data-segment-char="${digit}"]`);
    expect(cell).not.toBeNull();
    expect(onSegmentsOf(cell!).sort()).toEqual([...expected].sort());
  });

  it("renders the minus sign as segment g only", () => {
    const { container } = render(<SegmentDisplay value={-1} />);
    const minusCell = container.querySelector('[data-segment-char="-"]');
    expect(minusCell).not.toBeNull();
    expect(onSegmentsOf(minusCell!)).toEqual(["g"]);
  });

  it("attaches the decimal point to the preceding digit's cell rather than its own cell", () => {
    const { container } = render(<SegmentDisplay value={4.58} decimals={2} />);
    const cells = container.querySelectorAll("[data-segment-char]");
    // "4", "5", "8" — three cells, not four; the dot rides on the "4" cell.
    expect(cells).toHaveLength(3);
    expect(cells[0]?.getAttribute("data-segment-char")).toBe("4");
    expect(cells[0]?.querySelector('[data-segment="dp"]')).not.toBeNull();
    expect(cells[0]?.querySelector('[data-segment="dp"]')).toHaveAttribute("data-segment-on");
  });
});

describe("SegmentDisplay — ghost rendering", () => {
  it("pads unused leading cells with the ghost glyph when digits exceeds the value's natural width", () => {
    const { container } = render(<SegmentDisplay value={5} digits={4} />);
    const cells = container.querySelectorAll("[data-segment-char]");
    expect(cells).toHaveLength(4);

    // Three leading ghost-pad cells: full "8" outline, nothing lit.
    for (const cell of Array.from(cells).slice(0, 3)) {
      expect(cell.getAttribute("data-segment-char")).toBe("8");
      expect(onSegmentsOf(cell)).toEqual([]);
    }
    // The real value cell.
    expect(cells[3]?.getAttribute("data-segment-char")).toBe("5");
    expect(onSegmentsOf(cells[3]!)).toEqual(["a", "c", "d", "f", "g"].sort());
  });

  it("renders every cell as a ghost 8 when value is null — absence is designed, never hidden", () => {
    const { container } = render(<SegmentDisplay value={null} digits={3} />);
    const cells = container.querySelectorAll("[data-segment-char]");
    expect(cells).toHaveLength(3);
    for (const cell of Array.from(cells)) {
      expect(cell.getAttribute("data-segment-char")).toBe("8");
      expect(onSegmentsOf(cell)).toEqual([]);
    }
  });

  it("omits padding entirely when ghost is false, even if digits exceeds the value's width", () => {
    const { container } = render(<SegmentDisplay value={5} digits={4} ghost={false} />);
    expect(container.querySelectorAll("[data-segment-char]")).toHaveLength(1);
  });

  it("does not pad when digits is omitted — width matches the value exactly", () => {
    const { container } = render(<SegmentDisplay value={123} />);
    expect(container.querySelectorAll("[data-segment-char]")).toHaveLength(3);
  });
});

describe("SegmentDisplay — accessible name", () => {
  it("exposes the formatted value as the accessible name", () => {
    render(<SegmentDisplay value={4.58} decimals={2} locale="ru" />);
    expect(screen.getByRole("img", { name: "4,58" })).toBeInTheDocument();
  });

  it("combines value and caption, same pattern as ScoreDial", () => {
    render(<SegmentDisplay value={86} caption="Сильное состояние" locale="ru" />);
    expect(screen.getByRole("img", { name: "86 — Сильное состояние" })).toBeInTheDocument();
  });

  it("uses naLabel for the null-value accessible name", () => {
    render(<SegmentDisplay value={null} naLabel="Н/Д" />);
    expect(screen.getByRole("img", { name: "Н/Д" })).toBeInTheDocument();
  });
});

describe("SegmentDisplay — ignition and reduced motion", () => {
  it("under reduced motion, ignite() leaves active segments lit (the SSR/no-JS default) with no error", () => {
    mockMatchMedia(true);
    const ref = createRef<SegmentDisplayHandle>();
    const { container } = render(<SegmentDisplay ref={ref} value={7} />);

    expect(() => ref.current?.ignite()).not.toThrow();

    const onSegments = container.querySelectorAll("[data-segment-on]");
    expect(onSegments.length).toBeGreaterThan(0);
    for (const el of Array.from(onSegments)) {
      expect(el.getAttribute("data-lit")).toBe("true");
    }
  });

  it("without reduced motion, ignite() resets active segments to unlit before cascading them back on", () => {
    mockMatchMedia(false);
    const ref = createRef<SegmentDisplayHandle>();
    const { container } = render(<SegmentDisplay ref={ref} value={7} />);

    ref.current?.ignite();

    const onSegments = container.querySelectorAll("[data-segment-on]");
    expect(onSegments.length).toBeGreaterThan(0);
    for (const el of Array.from(onSegments)) {
      expect(el.getAttribute("data-lit")).toBe("false");
    }
  });

  it("never touches ghost segments — they stay permanently ghost-colored regardless of ignition", () => {
    mockMatchMedia(false);
    const ref = createRef<SegmentDisplayHandle>();
    const { container } = render(<SegmentDisplay ref={ref} value={1} />);

    ref.current?.ignite();

    const ghostSegments = container.querySelectorAll(".segment-ghost");
    expect(ghostSegments.length).toBeGreaterThan(0);
    for (const el of Array.from(ghostSegments)) {
      expect(el.hasAttribute("data-segment-on")).toBe(false);
    }
  });
});

describe("SegmentDisplay — static DSEG mode", () => {
  it("falls back to a static DSEG-font string beyond the animated mask's cell threshold", () => {
    const { container } = render(<SegmentDisplay value={1234567} />);
    expect(container.querySelector(".segment-cell")).toBeNull();
    const img = screen.getByRole("img");
    expect(img).toHaveClass("font-segment");
    expect(img).toHaveTextContent("1234567");
  });

  it("stays animated at exactly the threshold width and switches to static one past it", () => {
    const { container: sixDigits } = render(<SegmentDisplay value={123456} />);
    expect(sixDigits.querySelector(".segment-cell")).not.toBeNull();

    const { container: sevenDigits } = render(<SegmentDisplay value={1234567} />);
    expect(sevenDigits.querySelector(".segment-cell")).toBeNull();
  });

  it("honors an explicit mode override in either direction", () => {
    const { container: forcedStatic } = render(<SegmentDisplay value={5} mode="static" />);
    expect(forcedStatic.querySelector(".segment-cell")).toBeNull();

    const { container: forcedAnimated } = render(<SegmentDisplay value={1234567} mode="animated" />);
    expect(forcedAnimated.querySelector(".segment-cell")).not.toBeNull();
  });

  it("ignite() is a harmless no-op in static mode", () => {
    const ref = createRef<SegmentDisplayHandle>();
    render(<SegmentDisplay ref={ref} value={1234567} />);
    expect(() => ref.current?.ignite()).not.toThrow();
  });
});
