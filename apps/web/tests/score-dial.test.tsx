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

  it("combines the score and caption into a descriptive accessible name when both are given", () => {
    render(<ScoreDial score={86.8} locale="ru" caption="Сильное состояние" />);
    expect(
      screen.getByRole("img", { name: "86,8 — Сильное состояние" }),
    ).toBeInTheDocument();
  });

  it("falls back to the bare formatted score as the accessible name when no caption is given", () => {
    render(<ScoreDial score={86.8} locale="ru" />);
    expect(screen.getByRole("img", { name: "86,8" })).toBeInTheDocument();
  });

  it("sets pathLength=100 on every arc circle, so dasharray reads as plain percentages against the 270° gauge rather than the true SVG circumference", () => {
    const { container } = render(<ScoreDial score={86.8} locale="ru" />);
    const circles = container.querySelectorAll("circle");
    expect(circles).toHaveLength(2);
    for (const circle of circles) {
      expect(circle.getAttribute("pathLength")).toBe("100");
    }
  });

  it("marks the value arc with data-score-arc and its final filled length as data-filled — the contract results-document.tsx's load-time GSAP timeline draws from", () => {
    const { container } = render(<ScoreDial score={86.8} locale="ru" />);
    const arc = container.querySelector("[data-score-arc]");
    expect(arc).not.toBeNull();
    // ARC_LENGTH is 75 pathLength units (270° of 360°); 86.8/100 of that.
    expect(arc).toHaveAttribute("data-filled", String((86.8 / 100) * 75));
    // The arc already renders its *final* dasharray directly — no
    // animation of its own, no "from" (hidden) state at render time, so a
    // no-JS or crawler visitor always sees the completed arc.
    expect(arc).toHaveAttribute("stroke-dasharray", `${(86.8 / 100) * 75} ${100 - (86.8 / 100) * 75}`);
  });

  it("never sets data-score-arc when there is no value circle to draw (null score)", () => {
    const { container } = render(<ScoreDial score={null} caption="Недостаточно данных" />);
    expect(container.querySelector("[data-score-arc]")).toBeNull();
  });
});
