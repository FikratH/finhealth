import type { ReactNode } from "react";
import { OriginTicket, type OriginTicketTone } from "@/components/origin-ticket";

/**
 * @deprecated Thin alias over OriginTicket, kept only so the ~14 existing
 * call sites across the app don't need touching in this task — R4/R5
 * sweeps them onto OriginTicket directly and this file retires. Same
 * props, same rendered output; this is the "surfaces restyle globally at
 * once" alias strategy the redesign plan calls for (SpecimenChip ↔
 * ScoreDial), not a second visual language living alongside OriginTicket.
 */
export type SpecimenChipTone = OriginTicketTone;

export interface SpecimenChipProps {
  children: ReactNode;
  tone?: SpecimenChipTone;
  className?: string;
}

export function SpecimenChip(props: SpecimenChipProps) {
  return <OriginTicket {...props} />;
}
