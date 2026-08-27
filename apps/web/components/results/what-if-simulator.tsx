"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ScoreDial } from "@/components/score-dial";
import { StatusPill } from "@/components/status-pill";
import { MetricNumber } from "@/components/metric-number";
import { SpecimenChip } from "@/components/specimen-chip";
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

export interface WhatIfSimulatorProps {
  analysis: AnalysisResult;
  locale: Locale;
}

// The brief's timing: sliders move immediately (leverState, below), but the
// actual recompute only runs after the pointer has been still for 150ms —
// cheap arithmetic either way, but debouncing keeps a fast drag from
// re-rendering the changed-ratios list on every intermediate frame.
const DEBOUNCE_MS = 150;

interface LeverSliderProps {
  leverKey: LeverKey;
  value: number;
  onChange: (value: number) => void;
  locale: Locale;
}

// A native <input type="range"> — keyboard-operable (arrow keys, Home/End)
// for free, no custom widget to reimplement. Styling stays in the
// document grammar: a hairline track, the brand accent as the browser's
// native `accent-color` thumb, PT Mono for the numeric readout. The
// readout is aria-hidden — `aria-valuetext` on the input itself is what a
// screen reader announces, so the two never have to be kept in sync by
// hand.
function LeverSlider({ leverKey, value, onChange, locale }: LeverSliderProps) {
  const limit = LEVER_LIMITS[leverKey];
  const id = `lever-${leverKey}`;
  const percentText = `${value > 0 ? "+" : ""}${formatNumber(value * 100, { locale, decimals: 0 })}%`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm text-ink">
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

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedState(leverState), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [leverState]);

  const isDefault = LEVER_KEYS.every((key) => leverState[key] === 0);

  const result = useMemo(() => runSimulation(analysis, debouncedState), [analysis, debouncedState]);

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
        <SpecimenChip tone="attention">{t("notPersisted")}</SpecimenChip>
      </div>

      <div className="grid-paper flex flex-wrap items-center gap-6 p-4">
        <ScoreDial
          score={analysis.overall_score}
          locale={locale}
          caption={analysis.health_label}
          ghostScore={result.overallScore}
          size={160}
        />
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-wide text-ink-muted">
            {t("simulatedLabel")}
          </p>
          <MetricNumber
            value={result.overallScore}
            decimals={1}
            locale={locale}
            naLabel={tRatios("naLabel")}
            className="text-2xl"
          />
          {delta !== null && (
            <SpecimenChip tone={deltaTone}>
              {t("deltaLabel")}: {deltaSign}
              {formatNumber(delta, { locale, decimals: 1 })}
            </SpecimenChip>
          )}
        </div>
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
