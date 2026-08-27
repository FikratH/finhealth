"use client";

import { useEffect, useState } from "react";
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
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const hasScore = score !== null;
  const clamped = hasScore ? Math.min(100, Math.max(0, score)) : 0;
  const filled = drawn ? (clamped / 100) * ARC_LENGTH : 0;
  const valueDasharray = `${filled} ${100 - filled}`;
  const ariaLabel = hasScore
    ? formatNumber(score, { locale, decimals: 1 })
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
          fill="none"
          stroke="var(--line)"
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${ARC_LENGTH} ${GAP_LENGTH}`}
          transform={ROTATE}
        />
        {hasScore && (
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={valueDasharray}
            transform={ROTATE}
            className="transition-[stroke-dasharray] duration-700 ease-out motion-reduce:transition-none"
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
