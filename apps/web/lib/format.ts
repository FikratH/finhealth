// Shared number formatting for the lab-report grammar. Every rendered
// number in the product goes through this: RU thin-space grouping (the
// document is read by an RU-first SMB owner), EN comma grouping for the
// `en` locale, PT Mono figures applied by the caller via className.
export type Locale = "ru" | "en";

// Mirrors the API contract's `unit` field (`docs/api-contract-v1.md`) so
// callers can pass a RatioResult's unit straight through.
export type NumberUnit = "x" | "%" | "money";

export interface FormatNumberOptions {
  locale?: Locale;
  unit?: NumberUnit;
  /** Decimal places to render. Defaults to 2. */
  decimals?: number;
}

/** The formatNumber null/undefined placeholder. Exported so components that
 * need to match it exactly (rather than substitute their own "Н/Д" label)
 * can reference one source of truth. */
export const NULL_PLACEHOLDER = "—";

const MINUS_SIGN = "−"; // proper minus, not a hyphen
const MULTIPLIER_SUFFIX = "×"; // ×
const RU_GROUP_SEPARATOR = " "; // narrow no-break space
const RU_DECIMAL_SEPARATOR = ",";
const EN_GROUP_SEPARATOR = ",";
const EN_DECIMAL_SEPARATOR = ".";

function groupDigits(digits: string, separator: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

function unitSuffix(unit: NumberUnit | undefined): string {
  if (unit === "x") return MULTIPLIER_SUFFIX;
  if (unit === "%") return "%";
  return "";
}

/**
 * Formats a number per the lab-report grammar. `null`/`undefined`/`NaN`
 * render as the placeholder «—» — callers needing the domain-specific
 * «Н/Д» (not available) wording for a null ratio value pass their own
 * `naLabel` at the component level instead of relying on this fallback.
 */
export function formatNumber(
  value: number | null | undefined,
  options: FormatNumberOptions = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return NULL_PLACEHOLDER;
  }

  const { locale = "ru", unit, decimals = 2 } = options;
  const groupSeparator = locale === "ru" ? RU_GROUP_SEPARATOR : EN_GROUP_SEPARATOR;
  const decimalSeparator = locale === "ru" ? RU_DECIMAL_SEPARATOR : EN_DECIMAL_SEPARATOR;

  const negative = value < 0;
  const fixed = Math.abs(value).toFixed(Math.max(0, decimals));
  const [integerPart, fractionPart] = fixed.split(".");
  const roundsToZero = Number(fixed) === 0;

  const grouped = groupDigits(integerPart, groupSeparator);
  const sign = negative && !roundsToZero ? MINUS_SIGN : "";
  const fraction = fractionPart ? `${decimalSeparator}${fractionPart}` : "";

  return `${sign}${grouped}${fraction}${unitSuffix(unit)}`;
}

/**
 * Formats an ISO 8601 timestamp as a plain date for the lab-report
 * grammar's PT Mono date cells (e.g. the history table's `created_at`
 * column). Locale controls only day/month/year ordering via
 * Intl.DateTimeFormat — RU renders DD.MM.YYYY, EN renders MM/DD/YYYY. An
 * unparseable timestamp renders the same NULL_PLACEHOLDER as
 * formatNumber, never a raw "Invalid Date" string.
 */
export function formatDate(iso: string, locale: Locale = "ru"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return NULL_PLACEHOLDER;
  }
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
