import { describe, expect, it } from "vitest";
import { formatDate, formatNumber } from "@/lib/format";

describe("formatNumber", () => {
  it("groups with a thin no-break space and a comma decimal for ru", () => {
    expect(formatNumber(1234567.891, { locale: "ru" })).toBe(
      "1 234 567,89",
    );
  });

  it("groups with commas and a dot decimal for en", () => {
    expect(formatNumber(1234567.891, { locale: "en" })).toBe(
      "1,234,567.89",
    );
  });

  it("renders a proper minus sign for negative values", () => {
    expect(formatNumber(-1234.5, { locale: "ru" })).toBe("−1 234,50");
    expect(formatNumber(-1234.5, { locale: "en" })).toBe("−1,234.50");
  });

  it("renders the placeholder for null and undefined", () => {
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(undefined)).toBe("—");
    expect(formatNumber(Number.NaN)).toBe("—");
  });

  it("suffixes the multiplier unit", () => {
    expect(formatNumber(1.6577, { unit: "x", decimals: 2 })).toBe("1,66×");
  });

  it("suffixes the percent unit", () => {
    expect(formatNumber(42.5, { unit: "%", decimals: 1 })).toBe("42,5%");
  });

  it("adds no suffix for the money unit", () => {
    expect(formatNumber(2271100, { unit: "money", decimals: 0 })).toBe(
      "2 271 100",
    );
  });

  it("defaults to ru locale and 2 decimals", () => {
    expect(formatNumber(3)).toBe("3,00");
  });
});

describe("formatDate", () => {
  it("renders DD.MM.YYYY for ru", () => {
    expect(formatDate("2026-08-27T10:00:00Z", "ru")).toBe("27.08.2026");
  });

  it("renders MM/DD/YYYY for en", () => {
    expect(formatDate("2026-08-27T10:00:00Z", "en")).toBe("08/27/2026");
  });

  it("defaults to ru", () => {
    expect(formatDate("2026-08-27T10:00:00Z")).toBe("27.08.2026");
  });

  it("renders the placeholder for an unparseable timestamp", () => {
    expect(formatDate("not-a-date")).toBe("—");
  });
});
