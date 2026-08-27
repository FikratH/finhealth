import { cn } from "@/lib/utils";
import { formatNumber, type Locale } from "@/lib/format";

export interface ConfidenceMeterProps {
  /** 0-100, or null when no confidence figure applies yet. */
  value: number | null;
  locale?: Locale;
  /** Accessible name for the meter, e.g. «Уверенность извлечения». */
  label: string;
  /** Translated «Н/Д» wording for the null state. */
  naLabel?: string;
  className?: string;
}

const LOW_CONFIDENCE_THRESHOLD = 60;

// A thin bar + %, not a progress ring — a scalar reading (how much of the
// analysis to trust), so it carries role="meter" rather than
// role="progressbar" (which implies a task moving toward completion).
export function ConfidenceMeter({
  value,
  locale,
  label,
  naLabel,
  className,
}: ConfidenceMeterProps) {
  const clamped = value === null ? null : Math.min(100, Math.max(0, value));
  const low = clamped !== null && clamped < LOW_CONFIDENCE_THRESHOLD;
  const fillClass = clamped === null ? "" : low ? "bg-attention" : "bg-brand";
  const valueText =
    clamped === null
      ? (naLabel ?? formatNumber(null))
      : formatNumber(clamped, { locale, unit: "%", decimals: 0 });

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped ?? undefined}
        aria-valuetext={valueText}
        className="h-1 w-24 flex-1 bg-line"
      >
        {clamped !== null && (
          <div
            className={cn("h-full transition-[width] duration-700 ease-out motion-reduce:transition-none", fillClass)}
            style={{ width: `${clamped}%` }}
          />
        )}
      </div>
      <span className="font-mono text-xs tabular-nums text-ink-muted">
        {valueText}
      </span>
    </div>
  );
}
