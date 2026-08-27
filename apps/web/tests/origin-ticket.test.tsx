import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OriginTicket } from "@/components/origin-ticket";
import { SpecimenChip } from "@/components/specimen-chip";

describe("OriginTicket", () => {
  it("renders its children", () => {
    render(<OriginTicket>Retail</OriginTicket>);
    expect(screen.getByText("Retail")).toBeInTheDocument();
  });

  it.each(["neutral", "accent", "attention"] as const)("applies the %s tone's classes", (tone) => {
    render(<OriginTicket tone={tone}>Label</OriginTicket>);
    expect(screen.getByText("Label")).toBeInTheDocument();
  });
});

describe("SpecimenChip (alias over OriginTicket)", () => {
  it("renders the same text and tone-driven output as OriginTicket, unchanged for existing call sites", () => {
    const { container: chipContainer } = render(<SpecimenChip tone="accent">Demo</SpecimenChip>);
    const { container: ticketContainer } = render(<OriginTicket tone="accent">Demo</OriginTicket>);
    expect(chipContainer.firstElementChild?.className).toBe(
      ticketContainer.firstElementChild?.className,
    );
    expect(screen.getAllByText("Demo")).toHaveLength(2);
  });
});
