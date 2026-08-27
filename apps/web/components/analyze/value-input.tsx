"use client";

import { useState } from "react";
import { formatNumber, type Locale } from "@/lib/format";

export interface ValueInputProps {
  id?: string;
  value: number | null;
  locale: Locale;
  ariaLabel: string;
  placeholder: string;
  onChange: (value: number | null) => void;
  disabled?: boolean;
}

/** Parses RU/EN-typed input back into a number: strips grouping spaces,
 * accepts either decimal separator. Mirrors the shapes `formatNumber`
 * produces, not the full backend parser — good enough for a human retyping
 * a figure they can already see printed elsewhere on the page. */
function parseTypedNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const normalized = trimmed.replace(/[\s ]/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

// Reads as the document's own printed figure (RU thin-space grouping) until
// focused, when it reveals the raw digits for editing — the "lab report"
// grammar's numbers stay legible at rest, without asking the user to parse
// a formatting mask while retyping one.
export function ValueInput({
  id,
  value,
  locale,
  ariaLabel,
  placeholder,
  onChange,
  disabled,
}: ValueInputProps) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");

  const displayValue = focused
    ? draft
    : value === null
      ? ""
      : formatNumber(value, { locale, decimals: 0 });

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      placeholder={placeholder}
      disabled={disabled}
      value={displayValue}
      onFocus={() => {
        setFocused(true);
        setDraft(value === null ? "" : String(value));
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        setFocused(false);
        onChange(parseTypedNumber(draft));
      }}
      className="w-full border border-line bg-paper px-2 py-1 font-mono text-sm tabular-nums text-ink transition-colors focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
    />
  );
}
