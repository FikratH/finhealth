import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SectionHeadingProps {
  children: ReactNode;
  level?: 2 | 3;
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
  const Tag = level === 2 ? "h2" : "h3";

  return (
    <div className={cn("border-b border-line pb-2", className)}>
      <Tag
        className={cn(
          "font-display text-ink",
          level === 2 ? "text-2xl" : "text-lg",
        )}
      >
        {children}
      </Tag>
    </div>
  );
}
