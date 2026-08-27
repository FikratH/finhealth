import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SectionHeadingProps {
  children: ReactNode;
  /** Defaults to 2 (the ordinary section heading). 1 is for the rare page
   * whose own content region needs a real `<h1>` here rather than a bare
   * `<h1>` written out by hand (P5 close wave: signed-in /my's «Мои
   * анализы», my-analyses-view.tsx — the page's first heading had no h1 at
   * all before this) — sized to match this site's other page-level h1s
   * (`text-3xl`, e.g. the signed-out /my prompt right next to it, the
   * methodology page, the landing hero), not level 2's smaller size. */
  level?: 1 | 2 | 3;
  className?: string;
}

// Serif + hairline rule carries section structure the way a printed
// document would — no eyebrow/kicker (banned by the craft floor: the
// heading carries its own weight).
export function SectionHeading({
  children,
  level = 2,
  className,
}: SectionHeadingProps) {
  const Tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
  const textSize = level === 1 ? "text-3xl" : level === 2 ? "text-2xl" : "text-lg";

  return (
    <div className={cn("border-b border-line pb-2", className)}>
      <Tag className={cn("font-display text-ink", textSize)}>
        {children}
      </Tag>
    </div>
  );
}
