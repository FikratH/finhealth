import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScoreDial } from "@/components/score-dial";

describe("ScoreDial", () => {
  it("renders the em-dash placeholder and caption when score is null", () => {
    render(<ScoreDial score={null} caption="Недостаточно данных" />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Недостаточно данных")).toBeInTheDocument();
  });

  it("does not draw a value arc when score is null", () => {
    const { container } = render(
      <ScoreDial score={null} caption="Недостаточно данных" />,
    );
    // Only the neutral track circle should be present — no accent-stroked
    // value arc — when there is nothing to draw.
    expect(container.querySelectorAll("circle")).toHaveLength(1);
  });

  it("renders the formatted score and both track + value arcs when present", () => {
    const { container } = render(<ScoreDial score={86.8} locale="ru" />);
    expect(screen.getByText("86,8")).toBeInTheDocument();
    expect(container.querySelectorAll("circle")).toHaveLength(2);
  });
});
