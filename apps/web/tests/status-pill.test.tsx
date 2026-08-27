import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusPill } from "@/components/status-pill";

describe("StatusPill", () => {
  it("exposes the status word as its accessible name", () => {
    render(<StatusPill status="good" label="Хорошо" />);
    expect(screen.getByLabelText("Хорошо")).toBeInTheDocument();
  });

  it("pairs every status with a distinct symbol, not color alone", () => {
    // good/attention/critical draw a StatusGlyph SVG icon (craft floor:
    // icons are drawn, never a raw unicode/emoji stand-in) — "na" alone
    // stays a literal middle dot, a typographic separator rather than an
    // icon (CalibrationScale's own «·» convention).
    const { container, rerender } = render(<StatusPill status="good" label="Хорошо" />);
    expect(container.querySelector("svg")).toBeInTheDocument();

    rerender(<StatusPill status="attention" label="Внимание" />);
    expect(container.querySelector("svg")).toBeInTheDocument();

    rerender(<StatusPill status="critical" label="Критично" />);
    expect(container.querySelector("svg")).toBeInTheDocument();

    rerender(<StatusPill status="na" label="Н/Д" />);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
    expect(screen.getByText("·")).toBeInTheDocument();
  });

  it("renders the visible label text", () => {
    render(<StatusPill status="critical" label="Критично" />);
    expect(screen.getByText("Критично")).toBeInTheDocument();
  });
});
