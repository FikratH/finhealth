import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NormBand } from "@/components/norm-band";

const baseProps = {
  low: 1.5,
  high: 3.0,
  unit: "x" as const,
  locale: "ru" as const,
  normLabel: "норма",
  aboveLabel: "выше нормы",
  belowLabel: "ниже нормы",
  naLabel: "Н/Д",
};

describe("NormBand", () => {
  it("renders the value and the reference interval", () => {
    render(<NormBand {...baseProps} value={1.66} />);
    expect(screen.getByText("1,66×")).toBeInTheDocument();
    expect(screen.getByText(/норма 1,50×–3,00×/)).toBeInTheDocument();
  });

  it("separates the value from the reference interval with the binding «·» notation", () => {
    // design-direction.md's canonical grammar: «1,66 · норма 1,5–3,0».
    render(<NormBand {...baseProps} value={1.66} />);
    expect(screen.getByText("·")).toBeInTheDocument();
  });

  it("flags an above-range value with ▲ paired with text", () => {
    render(<NormBand {...baseProps} value={4.2} />);
    expect(screen.getByText("▲")).toBeInTheDocument();
    expect(screen.getByText("выше нормы")).toBeInTheDocument();
  });

  it("flags a below-range value with ▼ paired with text", () => {
    render(<NormBand {...baseProps} value={0.8} />);
    expect(screen.getByText("▼")).toBeInTheDocument();
    expect(screen.getByText("ниже нормы")).toBeInTheDocument();
  });

  it("renders no flag for an in-range value", () => {
    render(<NormBand {...baseProps} value={2.1} />);
    expect(screen.queryByText("▲")).not.toBeInTheDocument();
    expect(screen.queryByText("▼")).not.toBeInTheDocument();
  });

  it("renders the na label for a null value", () => {
    render(<NormBand {...baseProps} value={null} />);
    expect(screen.getByText("Н/Д")).toBeInTheDocument();
    expect(screen.queryByText("▲")).not.toBeInTheDocument();
  });
});
