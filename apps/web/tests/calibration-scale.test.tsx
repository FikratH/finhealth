import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CalibrationScale } from "@/components/calibration-scale";

describe("CalibrationScale", () => {
  it("exposes value and range in the accessible name", () => {
    render(
      <CalibrationScale
        value={1.66}
        low={1.5}
        high={3.0}
        unit="x"
        locale="ru"
        label="Текущий коэффициент"
      />,
    );
    expect(
      screen.getByRole("img", { name: /Текущий коэффициент.*1,66.*1,50.*3,00/ }),
    ).toBeInTheDocument();
  });

  it("uses naLabel in the accessible name when value is null", () => {
    render(
      <CalibrationScale value={null} low={1.5} high={3.0} label="L" naLabel="Н/Д" locale="ru" />,
    );
    expect(screen.getByRole("img", { name: /Н\/Д/ })).toBeInTheDocument();
  });

  it("renders the low/high bound labels", () => {
    render(<CalibrationScale value={2} low={1.5} high={3.0} unit="x" locale="ru" label="L" />);
    expect(screen.getByText("1,50×")).toBeInTheDocument();
    expect(screen.getByText("3,00×")).toBeInTheDocument();
  });

  it("renders no cursor element when value is null", () => {
    const { container } = render(
      <CalibrationScale value={null} low={1.5} high={3.0} label="L" />,
    );
    expect(container.querySelector(".rounded-full")).toBeNull();
  });

  it("renders a cursor when value is present", () => {
    const { container } = render(<CalibrationScale value={2} low={1.5} high={3.0} label="L" />);
    expect(container.querySelector(".rounded-full")).not.toBeNull();
  });

  it("clamps an out-of-range value's cursor position within the headroom track (never past 100%)", () => {
    const { container } = render(
      <CalibrationScale value={9999} low={1.5} high={3.0} label="L" />,
    );
    const cursor = container.querySelector(".rounded-full") as HTMLElement;
    expect(cursor).not.toBeNull();
    const left = Number.parseFloat(cursor.style.left);
    expect(left).toBeLessThanOrEqual(100);
    expect(left).toBeGreaterThanOrEqual(0);
  });

  it("degrades gracefully when low equals high (zero-width range)", () => {
    expect(() =>
      render(<CalibrationScale value={2} low={2} high={2} label="L" />),
    ).not.toThrow();
  });
});

// --- KZ mark (Phase 7 Task 5) ------------------------------------------

describe("CalibrationScale — kz mark", () => {
  it("renders no square mark when kz is absent", () => {
    const { container } = render(
      <CalibrationScale value={2} low={1.5} high={3.0} label="L" />,
    );
    expect(container.querySelector("[data-calibration-kz-mark]")).toBeNull();
  });

  it("renders a square mark at the kz value's position when kz is on-axis", () => {
    const { container } = render(
      <CalibrationScale value={2} low={1.5} high={3.0} label="L" kz={{ value: 2.5, label: "ориентир КЗ" }} />,
    );
    const mark = container.querySelector("[data-calibration-kz-mark]") as HTMLElement;
    expect(mark).not.toBeNull();
    const left = Number.parseFloat(mark.style.left);
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThan(100);
  });

  // Finish review, material_fixes 1: a far-outside kz value used to CLAMP
  // onto the track at 100% — landing the mark against the value numeral
  // (desktop) or floating as debris (mobile), and silently asserting a
  // false on-track position. Suppressing the mark entirely for an
  // off-axis kz value (a designed absence, named in ratio-row.tsx's
  // provenance line instead) replaces that clamp.
  it("suppresses the mark entirely when kz is off-axis (far outside the headroom-extended axis)", () => {
    const { container } = render(
      <CalibrationScale value={2} low={1.5} high={3.0} label="L" kz={{ value: 9999, label: "ориентир КЗ" }} />,
    );
    expect(container.querySelector("[data-calibration-kz-mark]")).toBeNull();
  });

  it("still renders the mark right at the axis boundary (on-axis, not yet off)", () => {
    // low=1.5, high=3.0, default headroom 0.4 -> spanHigh = 3.0 + 1.5*0.4 = 3.6
    const { container } = render(
      <CalibrationScale value={2} low={1.5} high={3.0} label="L" kz={{ value: 3.6, label: "ориентир КЗ" }} />,
    );
    expect(container.querySelector("[data-calibration-kz-mark]")).not.toBeNull();
  });

  it("suppresses the mark just past the axis boundary", () => {
    const { container } = render(
      <CalibrationScale value={2} low={1.5} high={3.0} label="L" kz={{ value: 3.7, label: "ориентир КЗ" }} />,
    );
    expect(container.querySelector("[data-calibration-kz-mark]")).toBeNull();
  });

  it("keeps the kz value in the accessible name even when off-axis (aria retains the value either way)", () => {
    render(
      <CalibrationScale
        value={2}
        low={1.5}
        high={3.0}
        unit="x"
        locale="ru"
        label="норма"
        kz={{ value: 9999, label: "ориентир РК" }}
      />,
    );
    // Off-axis: no on-track square mark...
    expect(document.querySelector("[data-calibration-kz-mark]")).toBeNull();
    // ...but the accessible name still names the kz label and carries its
    // formatted value (9 999,00×, per formatNumber's RU grouping).
    const gauge = screen.getByRole("img");
    expect(gauge.getAttribute("aria-label")).toMatch(/норма/);
    expect(gauge.getAttribute("aria-label")).toContain("ориентир РК");
    expect(gauge.getAttribute("aria-label")).toContain("999");
  });

  it("appends the kz label and value to the accessible name", () => {
    render(
      <CalibrationScale
        value={2}
        low={1.5}
        high={3.0}
        unit="x"
        locale="ru"
        label="норма"
        kz={{ value: 2.5, label: "ориентир КЗ" }}
      />,
    );
    expect(
      screen.getByRole("img", { name: /норма.*ориентир КЗ.*2,50/ }),
    ).toBeInTheDocument();
  });

  it("keeps the accessible name kz-free when kz is absent", () => {
    render(<CalibrationScale value={2} low={1.5} high={3.0} locale="ru" label="норма" />);
    expect(screen.getByRole("img")).not.toHaveAccessibleName(/ориентир КЗ/);
  });

  // Round-1 fix, Finding 7: an earlier version used a rotated (45deg)
  // diamond, reintroducing the tilted-stamp idiom DESIGN.md explicitly
  // retired. The mark must be unrotated.
  it("renders the kz mark unrotated (no rotate-45), per DESIGN.md's shape grammar", () => {
    const { container } = render(
      <CalibrationScale value={2} low={1.5} high={3.0} label="L" kz={{ value: 2.5, label: "ориентир РК" }} />,
    );
    const mark = container.querySelector("[data-calibration-kz-mark]") as HTMLElement;
    expect(mark.className).not.toMatch(/rotate-45/);
  });

  // Round-1 fix, Finding 7 (related point): the kz mark used to share the
  // LED cursor's exact vertical center, so a coincident position (real for
  // banking, where a reading and its KZ mark can both land at the track's
  // edge) let the opaque mark occlude the cursor. Offset stacking (the
  // mark sits above the track, not on its center line) fixes this
  // regardless of horizontal position — verified structurally here since
  // jsdom doesn't compute real layout/paint order.
  it("positions the kz mark above the track's center line, never on the cursor's own line", () => {
    const { container } = render(
      <CalibrationScale value={2} low={1.5} high={3.0} label="L" kz={{ value: 2, label: "ориентир РК" }} />,
    );
    const mark = container.querySelector("[data-calibration-kz-mark]") as HTMLElement;
    const cursor = container.querySelector(".rounded-full") as HTMLElement;
    expect(mark.className).toMatch(/bottom-full/);
    expect(mark.className).not.toMatch(/top-1\/2/);
    expect(cursor.className).toMatch(/top-1\/2/);
  });

  // Round-1 fix, Findings 4/5: CalibrationScale used to ship its own KZ
  // print twin, duplicating (and, missing `as_of`, under-informing
  // relative to) ratio-row.tsx's own screen-visible provenance line, which
  // is now the single print register for this fact. Guards against that
  // regression: no print-only paragraph mentioning the kz label should
  // exist inside this component at all.
  it("renders no print-only twin of its own for the kz mark (ratio-row.tsx owns that register)", () => {
    const { container } = render(
      <CalibrationScale value={2} low={1.5} high={3.0} label="L" kz={{ value: 2.5, label: "ориентир РК" }} />,
    );
    const printParagraphs = Array.from(container.querySelectorAll("p"));
    const kzPrintTwin = printParagraphs.filter((p) => p.textContent?.includes("ориентир РК"));
    expect(kzPrintTwin).toHaveLength(0);
  });
});
