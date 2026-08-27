import { cn } from "@/lib/utils";
import { StatusGlyph } from "@/components/icons";
import type { Status } from "@/components/status-pill";

const TEXT_CLASS: Record<Status, string> = {
  good: "text-good",
  attention: "text-attention",
  critical: "text-critical",
  na: "text-ink-muted",
};

const GLOW_CLASS: Record<Status, string> = {
  good: "[text-shadow:0_0_0.3em_var(--good)]",
  attention: "[text-shadow:0_0_0.3em_var(--attention)]",
  critical: "[text-shadow:0_0_0.3em_var(--critical)]",
  na: "",
};

export interface AnnunciatorCellProps {
  status: Status;
  /** The lit label, e.g. «СИЛЬНОЕ СОСТОЯНИЕ» — becomes both the visible
   * text and the cell's accessible name. */
  label: string;
  /** Supporting line under the label, e.g. a one-sentence verdict gloss. */
  description?: string;
  className?: string;
}

// The «заключение» verdict primitive: a large lit annunciator cell inside a
// bezel, in its status LED color — the always-lit-rail idiom applied to the
// single most important reading on the page. Same glyph-plus-color
// discipline as StatusPill (never color alone). The glow is a text-shadow
// decoration on top of the AA-checked base color, not a substitute for it.
//
// role="img" (not "status"): every other read-only instrument reading in
// this family — SegmentDisplay, ScoreDial, CalibrationScale — treats its
// glyph-plus-text as one opaque "picture" named by aria-label, since the
// visible content itself is aria-hidden. role="img" matches the family's
// own naming convention. This component itself still never mutates
// post-mount (each render is a fresh instance, not a live update to an
// existing one), so its own role stays "img", not "status" — but see
// components/pricing/waitlist-form.tsx (P6.T6, its second real call site)
// for what a caller does when IT needs the live-region behavior: it wraps
// its own outer element in role="status" instead of asking this component
// to carry that responsibility, since only the caller knows whether its
// own mount is a live DOM swap that needs announcing.
//
// score-header.tsx (the original call site) goes a step further and wraps
// this whole component in aria-hidden="true": the sr-only <h1> beside it
// already carries the verdict as the document's one real heading landmark,
// and this component's own role="img" aria-label would otherwise name that
// same verdict a second time, adjacently (finish review, material_fixes
// 5) — this component still exposes role="img"/aria-label on its own (the
// /dev/tokens preview renders it un-hidden, and every other real call site
// gets the same self-contained accessible name for free); only the score
// header's specific instance opts out via its wrapper.
export function AnnunciatorCell({ status, label, description, className }: AnnunciatorCellProps) {
  return (
    <div
      role="img"
      aria-label={description ? `${label} — ${description}` : label}
      className={cn("border border-line bg-panel px-5 py-4", className)}
    >
      <p
        aria-hidden="true"
        className={cn(
          "flex items-center gap-2 font-mono text-xl uppercase tracking-wide sm:text-2xl",
          TEXT_CLASS[status],
          GLOW_CLASS[status],
        )}
      >
        <StatusGlyph status={status} />
        <span>{label}</span>
      </p>
      {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
    </div>
  );
}
