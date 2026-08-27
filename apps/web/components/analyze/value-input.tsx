"use client";

import { useId, useState } from "react";
import { formatNumber, type Locale } from "@/lib/format";
import { parseTypedNumber } from "@/lib/number-input";
import { cn } from "@/lib/utils";

export interface ValueInputProps {
  id?: string;
  value: number | null;
  locale: Locale;
  ariaLabel: string;
  placeholder: string;
  /** Shown when the current draft can't be read as a number or an NA token
   * — the input keeps the unparsed draft on screen and does NOT call
   * `onChange`, so a bad keystroke never silently wipes a stored value. */
  invalidMessage: string;
  onChange: (value: number | null) => void;
  disabled?: boolean;
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
  invalidMessage,
  onChange,
  disabled,
}: ValueInputProps) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  // Set only by a real edit (the input's change event), never by focus —
  // a blur with no edit must be a no-op regardless of what the seeded
  // draft parses to (see commit()).
  const [dirty, setDirty] = useState(false);
  const errorId = useId();

  // While invalid, keep showing the user's own (unparsed) draft even after
  // the DOM blur — reverting to the last-good formatted value would erase
  // exactly what they typed, right when they need to see it to fix it.
  const displayValue =
    focused || invalid
      ? draft
      : value === null
        ? ""
        : formatNumber(value, { locale, decimals: 0 });

  function commit() {
    setFocused(false);
    // A plain keyboard tab-through (or a refocus of an already-invalid,
    // untouched draft) must not flag manually_edited or overwrite
    // anything. This is the fix for a real corruption bug: the draft is
    // seeded with `String(value)` (e.g. "1234.567" for a 3-decimal
    // figure), and parseTypedNumber reads a bare "1234.567" as
    // thousands-grouped (mirroring how a document renders it) — 1234567.
    // Without this dirty check, a focus+blur with zero keystrokes would
    // silently multiply the stored value by 1000. Leave any existing
    // invalid/error state exactly as it was — nothing changed, so there's
    // nothing new to parse or report.
    if (!dirty) {
      return;
    }
    const result = parseTypedNumber(draft);
    if (!result.ok) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (result.value !== value) {
      onChange(result.value);
    }
  }

  return (
    <div>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        placeholder={placeholder}
        disabled={disabled}
        value={displayValue}
        onFocus={() => {
          setFocused(true);
          setDirty(false);
          // Keep an invalid draft as-is so the user can keep fixing it
          // instead of it snapping back to the last committed value.
          if (!invalid) {
            setDraft(value === null ? "" : String(value));
          }
        }}
        onChange={(event) => {
          setDirty(true);
          setDraft(event.target.value);
        }}
        onBlur={commit}
        className={cn(
          "w-full border bg-paper px-2 py-1 font-mono text-sm tabular-nums text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50",
          invalid ? "border-critical" : "border-line focus-visible:border-accent",
        )}
      />
      {invalid && (
        <p id={errorId} role="alert" className="mt-1 text-xs text-critical">
          {invalidMessage}
        </p>
      )}
    </div>
  );
}
