import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnnunciatorCell } from "@/components/annunciator-cell";

describe("AnnunciatorCell", () => {
  it("exposes the label as its accessible name via role=img", () => {
    render(<AnnunciatorCell status="good" label="Сильное состояние" />);
    expect(screen.getByRole("img", { name: "Сильное состояние" })).toBeInTheDocument();
  });

  it("combines label and description into the accessible name when both are given", () => {
    render(
      <AnnunciatorCell status="critical" label="Критично" description="Требует внимания" />,
    );
    expect(
      screen.getByRole("img", { name: "Критично — Требует внимания" }),
    ).toBeInTheDocument();
  });

  it("pairs every status with a distinct symbol, not color alone", () => {
    // Shares StatusPill's StatusGlyph icon set (craft floor: icons are
    // drawn, never a raw unicode/emoji stand-in) — "na" alone stays a
    // literal middle dot.
    const { container, rerender } = render(<AnnunciatorCell status="good" label="L" />);
    expect(container.querySelector("svg")).toBeInTheDocument();

    rerender(<AnnunciatorCell status="attention" label="L" />);
    expect(container.querySelector("svg")).toBeInTheDocument();

    rerender(<AnnunciatorCell status="critical" label="L" />);
    expect(container.querySelector("svg")).toBeInTheDocument();

    rerender(<AnnunciatorCell status="na" label="L" />);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
    expect(screen.getByText("·")).toBeInTheDocument();
  });

  it("renders the visible label text", () => {
    render(<AnnunciatorCell status="good" label="Сильное состояние" />);
    expect(screen.getByText("Сильное состояние")).toBeInTheDocument();
  });

  it("renders the description as visible supporting text when given", () => {
    render(<AnnunciatorCell status="good" label="L" description="Gloss line" />);
    expect(screen.getByText("Gloss line")).toBeInTheDocument();
  });
});
