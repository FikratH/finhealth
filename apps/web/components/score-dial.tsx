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
  /** The what-if simulator's live recomputed score, drawn as a second,
   * inset dashed arc beside the real one — never a substitute for it, and
   * never itself animated by results-document.tsx's load-time GSAP
   * timeline (that only ever targets `data-score-arc`). It updates on every
   * debounced slider recompute via a plain CSS transition, the same
   * pattern category-scores.tsx/confidence-meter.tsx already use for a
   * live-updating bar. Omit entirely outside the simulator. */
  ghostScore?: number | null;
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
// The ghost ring sits inset from the real one, on the same 270° sweep —
// "beside" it in depth rather than side by side, so the two stay legible
// at the dial's existing size instead of needing a second, separate dial.
const GHOST_RADIUS = 38;

export function ScoreDial({
  score,
  locale,
  caption,
  size = 160,
  className,
  ghostScore,
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

  const hasGhost = ghostScore !== undefined && ghostScore !== null;
  const ghostClamped = hasGhost ? Math.min(100, Math.max(0, ghostScore)) : 0;
  const ghostFilled = (ghostClamped / 100) * ARC_LENGTH;
  const ghostDasharray = `${ghostFilled} ${100 - ghostFilled}`;

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
        {hasGhost && (
          <>
            <circle
              aria-hidden="true"
              cx={CENTER}
              cy={CENTER}
              r={GHOST_RADIUS}
              pathLength={100}
              fill="none"
              stroke="var(--line)"
              strokeWidth={5}
              strokeDasharray={`${ARC_LENGTH} ${GAP_LENGTH}`}
              transform={ROTATE}
            />
            <circle
              data-score-ghost-arc
              aria-hidden="true"
              cx={CENTER}
              cy={CENTER}
              r={GHOST_RADIUS}
              pathLength={100}
              fill="none"
              stroke="var(--ink)"
              strokeOpacity={0.55}
              strokeWidth={5}
              strokeLinecap="round"
              strokeDasharray={ghostDasharray}
              transform={ROTATE}
              className="transition-[stroke-dasharray] duration-700 ease-out motion-reduce:transition-none"
            />
          </>
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
