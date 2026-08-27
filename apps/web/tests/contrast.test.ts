import { describe, expect, it } from "vitest";
import { AA_NORMAL_TEXT, contrastRatio } from "@/lib/contrast";

describe("contrastRatio", () => {
  it("returns 21:1 for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  it("returns 1:1 for identical colors", () => {
    expect(contrastRatio("#19c2b0", "#19c2b0")).toBeCloseTo(1, 5);
  });

  it("is order-independent", () => {
    expect(contrastRatio("#0a0c0e", "#e6edf0")).toBeCloseTo(
      contrastRatio("#e6edf0", "#0a0c0e"),
      10,
    );
  });

  it("accepts 3-digit shorthand hex", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 0);
  });
});

// The direction's named text-token pairs (globals.css), computed against
// the ground/panel each register actually renders text on — never
// eyeballed. LED glow (text-shadow) is decoration layered on top of these
// base colors and is excluded, per the direction's own instruction
// ("compute [contrast] ... LED glows are decoration on top of AA-passing
// base colors").
const MONITOR_GROUND = "#0a0c0e";
const MONITOR_PANEL = "#101418";

const MONITOR_PAIRS: Array<[name: string, fg: string, bg: string]> = [
  ["ink on ground", "#e6edf0", MONITOR_GROUND],
  ["ink-muted on ground", "#7c8a92", MONITOR_GROUND],
  ["accent (teal) on ground", "#19c2b0", MONITOR_GROUND],
  ["good (LED) on ground", "#33e07a", MONITOR_GROUND],
  ["attention (LED) on ground", "#ffb020", MONITOR_GROUND],
  ["critical (LED) on ground", "#ff4a3a", MONITOR_GROUND],
  ["ink on panel", "#e6edf0", MONITOR_PANEL],
  ["ink-muted on panel", "#7c8a92", MONITOR_PANEL],
];

const PAPER_GROUND = "#fbfaf7";

const PAPER_PAIRS: Array<[name: string, fg: string, bg: string]> = [
  ["ink on paper", "#1a1d1c", PAPER_GROUND],
  ["ink-muted on paper", "#5a605d", PAPER_GROUND],
  ["accent on paper", "#0e7569", PAPER_GROUND],
  ["good on paper", "#177e4d", PAPER_GROUND],
  ["attention on paper", "#96601a", PAPER_GROUND],
  ["critical on paper", "#b23b2e", PAPER_GROUND],
];

describe("Monitor register — AA text contrast", () => {
  it.each(MONITOR_PAIRS)("%s clears 4.5:1", (_name, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
});

describe("Paper register — AA text contrast", () => {
  it.each(PAPER_PAIRS)("%s clears 4.5:1", (_name, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
});
