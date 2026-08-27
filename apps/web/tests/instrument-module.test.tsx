import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { InstrumentModule } from "@/components/instrument-module";

describe("InstrumentModule", () => {
  it("renders the label, figure, and unit", () => {
    render(<InstrumentModule label="Чистая маржа" figure={<span>4.58</span>} unit="%" />);
    expect(screen.getByText("Чистая маржа")).toBeInTheDocument();
    expect(screen.getByText("4.58")).toBeInTheDocument();
    expect(screen.getByText("%")).toBeInTheDocument();
  });

  it("omits the unit node entirely when none is given", () => {
    const { container } = render(<InstrumentModule label="Оборот" figure={<span>100</span>} />);
    expect(container.querySelectorAll(".font-mono.text-sm.text-ink-muted")).toHaveLength(0);
  });

  it("renders footer children below the figure row when given", () => {
    render(
      <InstrumentModule label="Ликвидность" figure={<span>1.66</span>}>
        <p>Footer content</p>
      </InstrumentModule>,
    );
    expect(screen.getByText("Footer content")).toBeInTheDocument();
  });

  it("wears the bezel grammar — a bordered panel surface, no shadow utility", () => {
    const { container } = render(<InstrumentModule label="X" figure={<span>1</span>} />);
    const bezel = container.firstElementChild;
    expect(bezel).toHaveClass("border", "border-line", "bg-panel");
    expect(bezel?.className).not.toMatch(/shadow-(?!\[0)/);
  });
});
