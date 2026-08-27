import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CalibrationScale } from "@/components/calibration-scale";

describe("CalibrationScale", () => {
  it("exposes value and range in the accessible name", () => {
    render(
      <CalibrationScale
        value={1.66}
        low={1.5}
        high={3.0}
        unit="x"
        locale="ru"
        label="Текущий коэффициент"
      />,
    );
    expect(
      screen.getByRole("img", { name: /Текущий коэффициент.*1,66.*1,50.*3,00/ }),
    ).toBeInTheDocument();
  });

  it("uses naLabel in the accessible name when value is null", () => {
    render(
      <CalibrationScale value={null} low={1.5} high={3.0} label="L" naLabel="Н/Д" locale="ru" />,
    );
    expect(screen.getByRole("img", { name: /Н\/Д/ })).toBeInTheDocument();
  });

  it("renders the low/high bound labels", () => {
    render(<CalibrationScale value={2} low={1.5} high={3.0} unit="x" locale="ru" label="L" />);
    expect(screen.getByText("1,50×")).toBeInTheDocument();
    expect(screen.getByText("3,00×")).toBeInTheDocument();
  });

  it("renders no cursor element when value is null", () => {
    const { container } = render(
      <CalibrationScale value={null} low={1.5} high={3.0} label="L" />,
    );
    expect(container.querySelector(".rounded-full")).toBeNull();
  });

  it("renders a cursor when value is present", () => {
    const { container } = render(<CalibrationScale value={2} low={1.5} high={3.0} label="L" />);
    expect(container.querySelector(".rounded-full")).not.toBeNull();
  });

  it("clamps an out-of-range value's cursor position within the headroom track (never past 100%)", () => {
    const { container } = render(
      <CalibrationScale value={9999} low={1.5} high={3.0} label="L" />,
    );
    const cursor = container.querySelector(".rounded-full") as HTMLElement;
    expect(cursor).not.toBeNull();
    const left = Number.parseFloat(cursor.style.left);
    expect(left).toBeLessThanOrEqual(100);
    expect(left).toBeGreaterThanOrEqual(0);
  });

  it("degrades gracefully when low equals high (zero-width range)", () => {
    expect(() =>
      render(<CalibrationScale value={2} low={2} high={2} label="L" />),
    ).not.toThrow();
  });
});
