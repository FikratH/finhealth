import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface RevealSectionProps {
  /** Anchor id for the mini-nav — omit for sections that aren't a nav
   * target (WarningsAccordion, MissingMetricsHint, Footnotes, disclaimer)
   * but still get the document's rhythm of a scroll reveal. */
  id?: string;
  children: ReactNode;
  className?: string;
}

// One scroll-revealed block of the diagnosis document — a plain anchor +
// reveal wrapper, not its own landmark (the real <section>/heading
// semantics live in whatever's passed as children, e.g. RiskRadar's own
// <section>). `data-reveal-rule` is the hairline that draws in
// (scaleX 0→1); `data-reveal-content` is what fades up 12px. Both are
// driven by exactly one ScrollTrigger per section
// (results-document.tsx's useGSAP), never per-element or per-row, and
// both render fully visible in the DOM at all times — the hidden "from"
// state is set imperatively via gsap.set() at effect time, never a
// render-time class, so no-JS visitors, crawlers, and reduced-motion
// readers always see the finished document without any scroll dependency.
export function RevealSection({ id, children, className }: RevealSectionProps) {
  return (
    <div id={id} data-reveal-section className="scroll-mt-24">
      <div aria-hidden="true" data-reveal-rule className="mb-6 h-px w-full origin-left bg-line" />
      <div data-reveal-content className={cn(className)}>
        {children}
      </div>
    </div>
  );
}
