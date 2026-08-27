import { cn } from "@/lib/utils";
import type { Status } from "@/components/status-pill";

export interface IconProps {
  className?: string;
}

// The world's functional-glyph set. Craft floor bans "unicode glyphs or
// emoji standing in for an icon system" — every status/marker glyph in
// this codebase used to be a raw character (✓ ▲ ✕ ▼, plus the browser's
// own <summary> disclosure triangle). One voice replaces all of them: a
// solid or single-stroke mark on a 16-unit grid, sized off font-size
// (1em, so it composes inline with text exactly like the characters it
// replaces) and colored via currentColor (so it inherits whatever
// status/tone class the caller already applies — no separate color prop
// to keep in sync). Typographic legends (chip text, the na status's own
// middle dot) stay real characters; only glyphs standing in for icons move
// here.

export function CheckIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      aria-hidden="true"
      className={cn("inline-block shrink-0", className)}
    >
      <path
        d="M3 8.5L6.5 12L13 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CrossIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      aria-hidden="true"
      className={cn("inline-block shrink-0", className)}
    >
      <path
        d="M4 4L12 12M12 4L4 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TriangleUpIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      aria-hidden="true"
      className={cn("inline-block shrink-0", className)}
    >
      <path d="M8 3.5L13.5 12.5H2.5L8 3.5Z" fill="currentColor" />
    </svg>
  );
}

export function TriangleDownIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      aria-hidden="true"
      className={cn("inline-block shrink-0", className)}
    >
      <path d="M8 12.5L2.5 3.5H13.5L8 12.5Z" fill="currentColor" />
    </svg>
  );
}

// The disclosure marker for every <summary> in this world — replaces the
// browser's own default triangle (craft floor: "the parts you did not
// draw still carry the design"). Draws the shape only; the caller rotates
// it on [open] via its own group-open: styling.
export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      aria-hidden="true"
      className={cn("inline-block shrink-0", className)}
    >
      <path
        d="M6 3.5L11 8L6 12.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// The lab-flag glyph family shared by StatusPill and AnnunciatorCell — one
// status, one shape, wherever a status renders as an icon. "na" stays a
// literal middle dot: a typographic separator (matching CalibrationScale's
// own «·» convention), not something an icon reads more clearly.
export function StatusGlyph({ status, className }: { status: Status; className?: string }) {
  switch (status) {
    case "good":
      return <CheckIcon className={className} />;
    case "attention":
      return <TriangleUpIcon className={className} />;
    case "critical":
      return <CrossIcon className={className} />;
    case "na":
      return (
        <span aria-hidden="true" className={cn("inline-block shrink-0", className)}>
          ·
        </span>
      );
  }
}
