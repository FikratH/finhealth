import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusPill } from "@/components/status-pill";

describe("StatusPill", () => {
  it("exposes the status word as its accessible name", () => {
    render(<StatusPill status="good" label="Хорошо" />);
    expect(screen.getByLabelText("Хорошо")).toBeInTheDocument();
  });

  it("pairs every status with a distinct symbol, not color alone", () => {
    const { rerender } = render(<StatusPill status="good" label="Хорошо" />);
    expect(screen.getByText("✓")).toBeInTheDocument();

    rerender(<StatusPill status="attention" label="Внимание" />);
    expect(screen.getByText("▲")).toBeInTheDocument();

    rerender(<StatusPill status="critical" label="Критично" />);
    expect(screen.getByText("✕")).toBeInTheDocument();

    rerender(<StatusPill status="na" label="Н/Д" />);
    expect(screen.getByText("·")).toBeInTheDocument();
  });

  it("renders the visible label text", () => {
    render(<StatusPill status="critical" label="Критично" />);
    expect(screen.getByText("Критично")).toBeInTheDocument();
  });
});
