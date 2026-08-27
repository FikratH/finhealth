/**
 * WCAG 2.x relative-luminance contrast ratio between two sRGB colors.
 * Used by tests/contrast.test.ts to compute (not assert-by-eyeball) the
 * direction's named text-token pairs against both registers — the LED
 * glow the direction layers on top (text-shadow/box-shadow) is decorative
 * and never load-bearing for legibility, so it's deliberately excluded
 * here: this measures the plain base colors alone, the AA floor they must
 * clear on their own.
 */

type RGB = readonly [number, number, number];

function parseHex(hex: string): RGB {
  const normalized = hex.replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;
  if (full.length !== 6) {
    throw new Error(`contrastRatio: not a #rgb or #rrggbb hex color: "${hex}"`);
  }
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return [r, g, b];
}

function linearizeChannel(c8bit: number): number {
  const c = c8bit / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance([r, g, b]: RGB): number {
  return 0.2126 * linearizeChannel(r) + 0.7152 * linearizeChannel(g) + 0.0722 * linearizeChannel(b);
}

/**
 * WCAG contrast ratio between two `#rgb`/`#rrggbb` hex colors, from 1
 * (identical) to 21 (black on white). Order doesn't matter — the lighter
 * color is always treated as L1.
 */
export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(parseHex(hexA));
  const lB = relativeLuminance(parseHex(hexB));
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG AA threshold for normal-size text. Large text (≥18pt / ≥14pt bold) uses 3:1 instead. */
export const AA_NORMAL_TEXT = 4.5;
