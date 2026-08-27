import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OriginTicket } from "@/components/origin-ticket";

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
