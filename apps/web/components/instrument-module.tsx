import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface InstrumentModuleProps {
  /** Mono-caps label, top-left of the bezel — e.g. «ЧИСТАЯ МАРЖА». */
  label: ReactNode;
  /** The figure — typically a <SegmentDisplay>, but any node is accepted
   * so a module can host a non-numeric readout (an AnnunciatorCell, a
   * CalibrationScale) inside the same bezel grammar. */
  figure: ReactNode;
  /** Small unit text beside the figure, e.g. "%" or "×" — per the
   * direction's "figure in segments, unit small," units are never folded
   * into the segment mask itself. */
  unit?: ReactNode;
  /** Optional footer content below the figure row — a CalibrationScale, a
   * connector-wired origin ticket, a caption. */
  children?: ReactNode;
  className?: string;
}

// The instrument-module grammar: a bezel (1px border, panel surface, no
// shadow — depth comes from the border line alone), label top-left in mono
// caps, figure in segments, unit small. This is the module every metric
// tile, score readout, and demo instrument on the monitor uses.
export function InstrumentModule({ label, figure, unit, children, className }: InstrumentModuleProps) {
  return (
    <div
      className={cn(
        "border border-line bg-panel px-4 py-3",
        className,
      )}
    >
      <p className="font-mono text-xs uppercase tracking-wide text-ink-muted">{label}</p>
      <div className="mt-2 flex items-baseline gap-1.5">
        {figure}
        {unit && <span className="font-mono text-sm text-ink-muted">{unit}</span>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
