import { describe, expect, it } from "vitest";
import { parseTypedNumber } from "@/lib/number-input";

describe("parseTypedNumber", () => {
  it("parses a plain integer", () => {
    expect(parseTypedNumber("3245900")).toEqual({ ok: true, value: 3245900 });
  });

  it("parses EN-grouped input with a decimal dot: '1,234.5' -> 1234.5", () => {
    // The exact regression case: formatNumber's own EN output round-tripped
    // back through the parser used to silently become NaN → null.
    expect(parseTypedNumber("1,234.5")).toEqual({ ok: true, value: 1234.5 });
  });

  it("parses RU-grouped input with a decimal comma", () => {
    expect(parseTypedNumber("3 245 900,5")).toEqual({ ok: true, value: 3245900.5 });
  });

  it("parses RU dot-grouped input: '1.234.567' -> 1234567", () => {
    expect(parseTypedNumber("1.234.567")).toEqual({ ok: true, value: 1234567 });
  });

  it("treats a lone thousands-shaped dot group as grouping, mirroring the backend", () => {
    expect(parseTypedNumber("1.234")).toEqual({ ok: true, value: 1234 });
  });

  it("does not misread a genuine small decimal as thousands-grouped", () => {
    expect(parseTypedNumber("0.234")).toEqual({ ok: true, value: 0.234 });
  });

  it("parses a parenthesized figure as negative", () => {
    expect(parseTypedNumber("(1 234,5)")).toEqual({ ok: true, value: -1234.5 });
  });

  it("parses a plain negative", () => {
    expect(parseTypedNumber("-1234.5")).toEqual({ ok: true, value: -1234.5 });
  });

  it.each(["", "  ", "-", "—", "–", "n/a", "N/A", "x", "*"])(
    "reads NA token %j as an explicit null, not an error",
    (token) => {
      expect(parseTypedNumber(token)).toEqual({ ok: true, value: null });
    },
  );

  it.each(["abc", "$", "###", "тест"])(
    "flags pure non-numeric garbage %j as invalid rather than silently nulling it",
    (garbage) => {
      expect(parseTypedNumber(garbage)).toEqual({ ok: false });
    },
  );

  it("round-trips a value's raw String() form back to the same number", () => {
    // This is exactly what ValueInput seeds `draft` with on focus — it must
    // parse back losslessly for the unchanged-value no-op path to work.
    const value = 3245900.4567;
    expect(parseTypedNumber(String(value))).toEqual({ ok: true, value });
  });
});
