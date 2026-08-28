"use client";

import type { MouseEvent } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { getLenis } from "@/components/lenis-slot";
import { MOTION } from "@/lib/motion";

export interface MiniNavItem {
  id: string;
  label: string;
}

export interface MiniNavProps {
  items: MiniNavItem[];
  /** Currently-in-view section id, tracked by results-document.tsx's
   * per-section ScrollTriggers. Stays at the first item under reduced
   * motion or before JS runs — nothing here depends on it to function. */
  activeId: string | null;
}

// The always-lit mini-nav, re-skinned as the monitor's annunciator rail:
// every section anchor is its own small annunciator cell (a bezel border,
// LED text/glow only on the current one — see StepCell's identical
// discipline in analyze/step-indicator.tsx), rendered at full legibility
// simultaneously (StepIndicator's "always-lit you are here" raise,
// reapplied to the scroll cinema) — never a set of dimmed dots that reveal
// labels on hover. Both renderings are real <a href="#id"> anchors, so
// clicking works with zero JS via the browser's native jump; the onClick
// handler only intervenes when a Lenis instance is actually driving the
// page (motion allowed, on /results/*), calling its smooth scrollTo
// instead of letting the native jump happen.
//
// Desktop (xl+, where a fixed rail clears the max-w-5xl document column)
// gets a sticky right rail listing every anchor. Below that breakpoint —
// where the rail would collide with the document — a top hairline bar
// reflects how far through the section list the reader has scrolled
// instead: a discrete, always-legible readout, not a continuous
// scroll-scrub (this app's scroll cinema has none).
export function MiniNav({ items, activeId }: MiniNavProps) {
  const t = useTranslations("Results.nav");

  if (items.length === 0) return null;

  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.id === activeId),
  );
  const progress = ((activeIndex + 1) / items.length) * 100;

  function handleClick(event: MouseEvent<HTMLAnchorElement>, id: string) {
    const lenis = getLenis();
    // No Lenis: reduced motion, SSR/no-JS, or — since MotionProvider now
    // reaches for its gsap/lenis chunk lazily (components/motion-provider-
    // lazy.tsx) — the brief window between first paint and that chunk
    // actually landing. Every case degrades the same way: the native #id
    // jump already does the job, so there's nothing further to do here.
    if (!lenis) return;
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    lenis.scrollTo(target);
  }

  return (
    <>
      <nav
        aria-label={t("railLabel")}
        className="fixed top-1/2 right-6 z-40 hidden -translate-y-1/2 flex-col items-end gap-3 print:hidden xl:flex"
      >
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={(event) => handleClick(event, item.id)}
              aria-current={isActive ? "true" : undefined}
              className={cn(
                "flex items-center gap-2 border bg-panel px-2 py-1 font-mono text-xs uppercase tracking-wide transition-colors",
                isActive
                  ? "border-brand text-brand [text-shadow:0_0_0.3em_var(--accent)]"
                  : "border-line text-ink-muted hover:text-ink",
              )}
            >
              {item.label}
              <span
                aria-hidden="true"
                className={cn(
                  "h-px w-4 shrink-0 bg-current transition-[width]",
                  isActive && "w-8",
                )}
              />
            </a>
          );
        })}
      </nav>

      <div
        role="progressbar"
        aria-label={t("progressLabel")}
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="fixed inset-x-0 top-0 z-40 h-0.5 bg-line print:hidden xl:hidden"
      >
        <div
          className="h-full bg-brand shadow-[0_0_4px_0px_var(--accent)] transition-[width] ease-out motion-reduce:transition-none"
          // The metronome covers this CSS transition too, not just GSAP
          // tweens — duration comes from MOTION.base rather than a second,
          // independently-chosen number living in a Tailwind duration-*
          // class.
          style={{ width: `${progress}%`, transitionDuration: `${MOTION.base * 1000}ms` }}
        />
      </div>
    </>
  );
}
