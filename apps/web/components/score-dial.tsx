import { cn } from "@/lib/utils";
import { formatNumber, type Locale } from "@/lib/format";

export interface ScoreDialProps {
  /** 0-100, or null when overall_score is insufficient-data. */
  score: number | null;
  locale?: Locale;
  /** Shown under the dial when score is null, e.g. «Недостаточно данных». */
  caption?: string;
  size?: number;
  className?: string;
}

// A 270° instrument gauge (the gap sits at the bottom, like a speedometer)
// rendered on the grid-paper ground, per design-direction's "score arc
// draws once on load" and "chart/score areas sit on a faint ... grid
// texture, never on flat cards." pathLength=100 keeps the dasharray math
// in plain percentage units instead of circle-circumference algebra.
const RADIUS = 50;
const CENTER = 60;
const ARC_LENGTH = 75; // 270° of the 360° circle, in pathLength units
const GAP_LENGTH = 100 - ARC_LENGTH;
const ROTATE = `rotate(135 ${CENTER} ${CENTER})`;

export function ScoreDial({
  score,
  locale,
  caption,
  size = 160,
  className,
}: ScoreDialProps) {
  const hasScore = score !== null;
  const clamped = hasScore ? Math.min(100, Math.max(0, score)) : 0;
  // Always the *final* filled length — this component no longer animates
  // its own draw. It renders the completed arc directly (SSR/no-JS visible
  // state); results-document.tsx's useGSAP finds this value circle via
  // `data-score-arc` and tweens `stroke-dasharray` from 0 up to this same
  // `data-filled` target as part of the заключение's load-time opening, so
  // no-JS and reduced-motion visitors simply never see the "from" state.
  const filled = (clamped / 100) * ARC_LENGTH;
  const valueDasharray = `${filled} ${100 - filled}`;
  // Give the dial an accessible name that describes what the number means,
  // not just the bare figure — combine it with the verdict caption
  // (health_label) when the caller has one, same as it already anchors the
  // insufficient-data announcement below.
  const formattedScore = formatNumber(score, { locale, decimals: 1 });
  const ariaLabel = hasScore
    ? caption
      ? `${formattedScore} — ${caption}`
      : formattedScore
    : (caption ?? formatNumber(null));

  return (
    <div
      className={cn("grid-paper inline-flex flex-col items-center gap-2 p-4", className)}
    >
      <svg
        role="img"
        aria-label={ariaLabel}
        width={size}
        height={size}
        viewBox="0 0 120 120"
      >
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          pathLength={100}
          fill="none"
          stroke="var(--line)"
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${ARC_LENGTH} ${GAP_LENGTH}`}
          transform={ROTATE}
        />
        {hasScore && (
          <circle
            data-score-arc
            data-filled={filled}
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            pathLength={100}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={valueDasharray}
            transform={ROTATE}
          />
        )}
        <text
          x={CENTER}
          y={CENTER}
          textAnchor="middle"
          dominantBaseline="central"
          className="font-mono text-[1.6rem] fill-ink"
        >
          {hasScore ? formatNumber(score, { locale, decimals: 1 }) : "—"}
        </text>
      </svg>
      {!hasScore && caption && (
        <p className="max-w-[12rem] text-center text-sm text-ink-muted">{caption}</p>
      )}
    </div>
  );
}
