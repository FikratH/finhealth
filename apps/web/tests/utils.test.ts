import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("resolves conflicting Tailwind classes, keeping the last one", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("drops falsy values and keeps truthy class names", () => {
    expect(cn("text-ink", false && "hidden", "font-mono")).toBe(
      "text-ink font-mono",
    );
  });
});
