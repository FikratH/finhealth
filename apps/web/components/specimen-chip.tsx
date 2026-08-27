import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SpecimenChipTone = "neutral" | "accent" | "attention";

const TONE_CLASS: Record<SpecimenChipTone, string> = {
  neutral: "border-line text-ink-muted",
  accent: "border-accent text-accent",
  attention: "border-attention text-attention",
};

export interface SpecimenChipProps {
  children: ReactNode;
  tone?: SpecimenChipTone;
  className?: string;
}

// The specimen-label idiom: a small bordered uppercase mono chip, used for
// industry / period / currency / «ДЕМО-ДАННЫЕ» / confidence stickers.
export function SpecimenChip({
  children,
  tone = "neutral",
  className,
}: SpecimenChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 border bg-paper px-2 py-0.5 font-mono text-xs uppercase tracking-wide",
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
