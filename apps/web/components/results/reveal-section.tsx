import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface RevealSectionProps {
  /** Anchor id for the mini-nav — omit for sections that aren't a nav
   * target (WarningsAccordion, MissingMetricsHint, Footnotes, disclaimer)
   * but still get the document's rhythm of a scroll reveal. */
  id?: string;
  children: ReactNode;
  className?: string;
  /** Hides the whole section — hairline rule included — on print. For
   * content that's already `print:hidden` on-screen-only-relevant content
   * like the what-if simulator, or the narrative section while it's still
   * just a button: without this, that inner `print:hidden` only hides the
   * content, leaving this wrapper's own hairline rule to print above
   * nothing, an orphaned rule with no section beneath it. */
  printHidden?: boolean;
  /** A stable identifier for results-document.tsx's own scroll-cinema
   * bookkeeping — distinct from `id`, which is optional (only sections
   * with a mini-nav anchor have one) and is a real DOM id used for
   * anchor navigation. Rendered as `data-section-key` so useGSAP's reveal
   * sweep can track "already revealed" sections by a key every section
   * has, id-less ones included. Unused (and omitted from the DOM
   * entirely) by any caller that doesn't need that bookkeeping — e.g.
   * methodology-document.tsx's static, non-animated sections. */
  sectionKey?: string;
}

// One scroll-revealed block of the diagnosis document — a plain anchor +
// reveal wrapper, not its own landmark (the real <section>/heading
// semantics live in whatever's passed as children, e.g. RiskRadar's own
// <section>). The boot grammar's section-entry verb (design-direction:
// "scanline sweep + ignition per section, replaces fade/y reveals"):
// `data-reveal-rule` is the permanent, unanimated document-structure
// hairline (always present, never a motion target — the printed/no-JS
// divider); `data-scanline` is lib/motion's scanlineSweep line, one thin
// teal beam that sweeps across the section once; `data-scanline-content`
// is what it reveals — an instant pop the moment the beam passes over it,
// never a fade/y tween ("every change is an instant segment swap").
//
// The beam lives in its own `absolute inset-x-0 top-0 overflow-hidden`
// strip, capped to one viewport tall (`h-screen`) and anchored to the
// section's own top rather than spanning `inset-y-0` the way
// how-it-works.tsx's short cards do — on a tall section (ratios, risk
// radar run thousands of px) a full-height beam reads as a saturated
// curtain rather than "one thin line," and the sweep only ever fires as
// the section's *top* crosses into view (SECTION_REVEAL_START, "top 75%"
// in results-document.tsx), so nothing below the first screenful is ever
// part of what's actually seen sweeping. That strip is a sibling of the
// content, not a wrapper around it, so its own `overflow-hidden` (the
// same how-it-works.tsx/logo-reveal.tsx fix — the beam's translate would
// otherwise transiently widen the document's scrollable width mid-sweep)
// clips only the beam, never the section's real content — an edge-pinned
// CalibrationScale cursor (translated half outside its own 0%/100% track
// bounds by design) stays fully visible instead of being cut in half by a
// clip box meant for the beam alone. Both the rule and the content render
// fully visible in the DOM at all times — the hidden "from" state is set
// imperatively via a data attribute at effect time, never a render-time
// class, so no-JS visitors, crawlers, and reduced-motion readers always
// see the finished document without any scroll dependency. Driven by
// exactly one ScrollTrigger per section (results-document.tsx's useGSAP),
// never per-element or per-row.
export function RevealSection({
  id,
  children,
  className,
  printHidden,
  sectionKey,
}: RevealSectionProps) {
  return (
    <div
      id={id}
      data-reveal-section
      data-section-key={sectionKey}
      className={cn("relative scroll-mt-24", printHidden && "print:hidden")}
    >
      <div aria-hidden="true" data-reveal-rule className="mb-6 h-px w-full bg-line" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-screen overflow-hidden">
        <span
          data-scanline
          className="absolute inset-y-0 left-0 w-full opacity-0 bg-[linear-gradient(90deg,transparent,var(--accent)_45%,var(--accent)_55%,transparent)]"
        />
      </div>
      <div data-scanline-content className={cn(className)}>
        {children}
      </div>
    </div>
  );
}
