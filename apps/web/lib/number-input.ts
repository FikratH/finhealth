// Parses a human-retyped figure back into a number. Mirrors
// apps/api/app/services/metrics.py's `parse_number` philosophy (RU/EN
// grouping and decimal separators, parenthesized negatives, NA tokens) as
// closely as JS allows — same branching, same "rightmost separator wins"
// rule for mixed comma+dot input, same ambiguous-"1.234"-means-thousands
// convention.
//
// Where the backend and this parser diverge on purpose: `parse_number`
// reads untrusted document text and silently returns `None` for anything
// it can't make sense of (there's no one to show an error to). This parser
// backs an editable input a human is actively typing into, so genuinely
// malformed text (not an NA token, not a recognizable number) reports
// `{ok:false}` instead of quietly wiping the stored value — the caller
// keeps the draft on screen and shows a validation message rather than
// discarding what the user typed.
const NA_TOKENS = new Set(["", "-", "—", "–", "n/a", "na", "нет данных", "x", "*"]);

export type NumberParseResult = { ok: true; value: number | null } | { ok: false };

const INVALID: NumberParseResult = { ok: false };

// U+00A0 (non-breaking space) and U+202F (narrow no-break space) — both
// show up as RU-style thousands grouping (lib/format.ts RU_GROUP_SEPARATOR).
const NBSP_RE = /[\u00A0\u202F]/g;

export function parseTypedNumber(raw: string): NumberParseResult {
  let s = raw.trim().toLowerCase();
  if (NA_TOKENS.has(s)) return { ok: true, value: null };

  let negative = false;
  if (s.length > 2 && s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1);
  }

  s = s.replace(NBSP_RE, " ");
  s = s.replace(/[^\d,.\-+ ]/g, "").trim();
  if (s === "" || s === "-" || s === "+") return INVALID;

  s = s.replace(/\s/g, "");

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // Whichever separator appears last is the decimal separator — mirrors
    // "1,234.56" (EN grouped) vs "1.234,56" (RU grouped).
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = s.split(",");
    if (parts.length === 2 && parts[1].length !== 3) {
      s = s.replace(",", "."); // decimal comma: "3245900,5"
    } else {
      s = s.replace(/,/g, ""); // thousands comma: "3,245,900"
    }
  } else if (hasDot) {
    const parts = s.split(".");
    if (parts.length > 2) {
      if (parts.slice(1).every((p) => p.length === 3)) {
        s = s.replace(/\./g, ""); // "1.234.567" → thousands
      } else {
        return INVALID;
      }
    } else if (
      parts.length === 2 &&
      parts[1].length === 3 &&
      !["0", "-0", "+0"].includes(parts[0])
    ) {
      s = s.replace(".", ""); // "1.234" → 1234, mirroring "1,234"
    }
  }

  if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return INVALID;

  const parsed = Number(s);
  if (!Number.isFinite(parsed)) return INVALID;

  return { ok: true, value: negative ? -parsed : parsed };
}
