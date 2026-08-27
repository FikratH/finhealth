"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Button } from "@/components/ui/button";
import { SegmentDisplay, type SegmentDisplayHandle } from "@/components/segment-display";
import { InstrumentModule } from "@/components/instrument-module";
import { StatusPill } from "@/components/status-pill";
import { MetricNumber } from "@/components/metric-number";
import { OriginTicket } from "@/components/origin-ticket";
import { SectionHeading } from "@/components/section-heading";
import {
  DEFAULT_LEVER_STATE,
  LEVER_KEYS,
  LEVER_LIMITS,
  clampLever,
  runSimulation,
  type LeverKey,
  type LeverState,
} from "@/lib/simulator";
import { metricDisplayName } from "@/lib/metric-names";
import { formatNumber } from "@/lib/format";
import type { AnalysisResult } from "@/lib/api-types";
import type { Locale } from "@/lib/format";

gsap.registerPlugin(useGSAP);

export interface WhatIfSimulatorProps {
  analysis: AnalysisResult;
  locale: Locale;
}

// The brief's timing: sliders move immediately (leverState, below), but the
// actual recompute only runs after the pointer has been still for 150ms —
// cheap arithmetic either way, but debouncing keeps a fast drag from
// re-rendering the changed-ratios list on every intermediate frame.
const DEBOUNCE_MS = 150;

// Matches score-header.tsx's own SCORE_DIGITS: up to "100.0" (3 integer
// digits + 1 decimal, 4 digit-cells) — every reading below that pads with
// ghost leading cells, so the two readouts here stay the same width.
const SCORE_DIGITS = 4;

interface LeverSliderProps {
  leverKey: LeverKey;
  value: number;
  onChange: (value: number) => void;
  locale: Locale;
}

// The control bench's lever, a slider-instrument: a bezel (border +
// panel surface, InstrumentModule's own grammar) around a native
// <input type="range"> — keyboard-operable (arrow keys, Home/End) for
// free, no custom widget to reimplement. The brand accent is the
// browser's native `accent-color` thumb, PT Mono for the numeric
// readout. The readout is aria-hidden — `aria-valuetext` on the input
// itself is what a screen reader announces, so the two never have to be
// kept in sync by hand.
function LeverSlider({ leverKey, value, onChange, locale }: LeverSliderProps) {
  const limit = LEVER_LIMITS[leverKey];
  const id = `lever-${leverKey}`;
  const percentText = `${value > 0 ? "+" : ""}${formatNumber(value * 100, { locale, decimals: 0 })}%`;

  return (
    <div className="space-y-1.5 border border-line bg-panel px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="font-mono text-xs uppercase tracking-wide text-ink-muted">
          {metricDisplayName(leverKey, locale)}
        </label>
        <span aria-hidden="true" className="font-mono text-sm tabular-nums text-ink">
          {percentText}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={-limit}
        max={limit}
        step={0.01}
        value={value}
        onChange={(event) => onChange(clampLever(leverKey, Number(event.target.value)))}
        aria-valuetext={percentText}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-none bg-line accent-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      />
    </div>
  );
}

// «Что если?» — a deterministic, client-only what-if panel: six levers
// scale their own metric (see lib/simulator/inputs.ts's applyLevers for
// the exact, documented dependent adjustments), debounced-recomputed
// through the same engine apps/api's ratios.py/scoring.py mirror
// (lib/simulator, contract-tested against the stored demo analysis).
// Nothing here is ever sent to the server or persisted — the
// «не сохраняется» chip below is a literal description of the code, not
// just copy.
export function WhatIfSimulator({ analysis, locale }: WhatIfSimulatorProps) {
  const t = useTranslations("Results.whatIf");
  const tStatus = useTranslations("Status");
  const tRatios = useTranslations("Results.ratios");

  const [leverState, setLeverState] = useState<LeverState>(DEFAULT_LEVER_STATE);
  const [debouncedState, setDebouncedState] = useState<LeverState>(DEFAULT_LEVER_STATE);
  const simulatedScoreRef = useRef<SegmentDisplayHandle>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedState(leverState), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [leverState]);

  const isDefault = LEVER_KEYS.every((key) => leverState[key] === 0);

  const result = useMemo(() => runSimulation(analysis, debouncedState), [analysis, debouncedState]);

  // "Numbers changing (simulator) = digit swap with a 60ms inter-digit
  // cascade, never morphing" (design-direction, Motion) — every recompute
  // re-ignites the ghost readout through the same boot-grammar cascade the
  // hero score uses, rather than a plain re-render. Reduced motion is
  // already handled inside igniteSequence (sets every segment lit
  // synchronously, no tween), so this needs no reduced-motion gate of its
  // own. The real (left) readout never changes within this component, so
  // only the simulated one re-ignites.
  useGSAP(() => {
    simulatedScoreRef.current?.ignite();
  }, { dependencies: [result.overallScore] });

  const baselineByKey = useMemo(
    () => new Map(analysis.ratios.map((r) => [r.key, r] as const)),
    [analysis.ratios],
  );

  const changedRatios = useMemo(() => {
    return result.ratios.flatMap((sim) => {
      const baseline = baselineByKey.get(sim.key);
      if (!baseline || !baseline.applicable) return [];
      if (baseline.value === sim.value && baseline.status === sim.status) return [];
      return [{ sim, baseline }];
    });
  }, [result.ratios, baselineByKey]);

  function handleReset() {
    setLeverState(DEFAULT_LEVER_STATE);
    setDebouncedState(DEFAULT_LEVER_STATE);
  }

  const delta =
    result.overallScore !== null && analysis.overall_score !== null
      ? result.overallScore - analysis.overall_score
      : null;
  const deltaSign = delta !== null && delta > 0 ? "+" : "";
  const deltaTone = delta === null ? "neutral" : delta >= 0 ? "accent" : "attention";

  return (
    <section className="space-y-6 print:hidden">
      <SectionHeading>{t("heading")}</SectionHeading>
      <p className="text-sm text-ink-muted">{t("intro")}</p>

      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        {LEVER_KEYS.map((key) => (
          <LeverSlider
            key={key}
            leverKey={key}
            value={leverState[key]}
            onChange={(value) => setLeverState((prev) => ({ ...prev, [key]: value }))}
            locale={locale}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <Button type="button" variant="outline" onClick={handleReset} disabled={isDefault}>
          {t("reset")}
        </Button>
        <OriginTicket tone="attention">{t("notPersisted")}</OriginTicket>
      </div>

      {/* The control bench's own readout pair: the real score stays a
       * steady instrument reading; the ghost score is a second
       * SegmentDisplay in a dashed, dimmed bezel — visibly provisional,
       * never a substitute for the real one. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <InstrumentModule
          label={t("currentLabel")}
          figure={
            <SegmentDisplay
              value={analysis.overall_score}
              decimals={1}
              digits={SCORE_DIGITS}
              locale={locale}
              caption={analysis.health_label}
              className="text-3xl"
            />
          }
        />
        <InstrumentModule
          className="border-dashed opacity-80"
          label={t("simulatedLabel")}
          figure={
            <SegmentDisplay
              ref={simulatedScoreRef}
              value={result.overallScore}
              decimals={1}
              digits={SCORE_DIGITS}
              locale={locale}
              naLabel={tRatios("naLabel")}
              className="text-3xl"
            />
          }
        >
          {delta !== null && (
            <OriginTicket tone={deltaTone}>
              {t("deltaLabel")}: {deltaSign}
              {formatNumber(delta, { locale, decimals: 1 })}
            </OriginTicket>
          )}
        </InstrumentModule>
      </div>

      <div className="space-y-3">
        <h3 className="font-mono text-xs uppercase tracking-wide text-ink-muted">
          {t("changedHeading")}
        </h3>
        {changedRatios.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("noChanges")}</p>
        ) : (
          <ul className="space-y-2">
            {changedRatios.map(({ sim, baseline }) => (
              <li
                key={sim.key}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2 last:border-b-0"
              >
                <span className="text-ink">{baseline.name}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="sr-only">{t("oldValueLabel")}</span>
                  <MetricNumber
                    value={baseline.value}
                    unit={baseline.unit}
                    locale={locale}
                    naLabel={tRatios("naLabel")}
                    muted
                  />
                  <StatusPill status={baseline.status} label={tStatus(baseline.status)} className="opacity-60" />
                  <span aria-hidden="true" className="text-ink-muted">
                    →
                  </span>
                  <span className="sr-only">{t("newValueLabel")}</span>
                  <MetricNumber
                    value={sim.value}
                    unit={baseline.unit}
                    locale={locale}
                    naLabel={tRatios("naLabel")}
                  />
                  <StatusPill status={sim.status} label={tStatus(sim.status)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="border-t border-line pt-4 text-xs text-ink-muted">{t("disclosure")}</p>
    </section>
  );
}
