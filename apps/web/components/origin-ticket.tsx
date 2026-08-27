import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type OriginTicketTone = "neutral" | "accent" | "attention";

const TONE_CLASS: Record<OriginTicketTone, string> = {
  neutral: "border-line text-ink-muted",
  accent: "border-brand text-brand",
  attention: "border-attention text-attention",
};

export interface OriginTicketProps {
  children: ReactNode;
  tone?: OriginTicketTone;
  className?: string;
}

// The origin-ticket idiom (evolved specimen chip): a small bordered
// uppercase mono tag on the panel surface, for industry / period /
// currency / «ДЕМО-ДАННЫЕ» / confidence stickers and — per the "visible
// seams" raise — the wired origin marker beside a figure's source line.
// SpecimenChip (specimen-chip.tsx) is a thin alias over this component so
// every existing call site keeps working unchanged.
export function OriginTicket({ children, tone = "neutral", className }: OriginTicketProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 border bg-panel px-2 py-0.5 font-mono text-xs uppercase tracking-wide",
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
