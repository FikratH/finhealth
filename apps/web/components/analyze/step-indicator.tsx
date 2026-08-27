"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { blinkPending } from "@/lib/motion";
import type { AnalyzeStep } from "@/lib/analyze-reducer";

// "Always-lit you are here" (design-direction, from drum machine): every
// step shows its state unambiguously — not just the active one lit up with
// the rest greyed to near-invisibility. Три ступени, always all legible:
// Загрузка → Проверка → Диагноз. The third (diagnosis) is never reachable
// within this flow (T6 redirects there) — it renders as the flow's
// destination, not a clickable step.
const STEPS = ["upload", "verify", "diagnosis"] as const;
type StepKey = (typeof STEPS)[number];

export interface StepIndicatorProps {
  current: AnalyzeStep;
  /** True while the CURRENT step has a real async operation in flight
   * (upload/extract for "upload", analyze for "verify") — gates the
   * flashing-12:00 idiom (lib/motion's blinkPending) on that step's cell.
   * A current-but-idle step (the user is still filling the form) reads
   * steady-lit, never blinking; "done"/"upcoming" cells never blink
   * regardless of this prop. */
  pending?: boolean;
  className?: string;
}

function stepState(step: StepKey, current: AnalyzeStep): "done" | "current" | "upcoming" {
  const order: StepKey[] = ["upload", "verify", "diagnosis"];
  const currentIndex = order.indexOf(current);
  const stepIndex = order.indexOf(step);
  if (stepIndex < currentIndex) return "done";
  if (stepIndex === currentIndex) return "current";
  return "upcoming";
}

interface StepCellProps {
  index: number;
  state: "done" | "current" | "upcoming";
  pending: boolean;
  label: string;
}

// One annunciator cell of the hardware progress strip. Blink is wired
// directly to lib/motion's blinkPending — the flashing-12:00 idiom — and
// only while `pending` is true on the current cell; every other state
// (including "current" the moment it's just sitting there idle) is a
// steady instant state, per the boot grammar's "every change is an instant
// segment swap." All three cell states sit on the same --panel bezel
// surface (never a lighter/ghost background under the label text) —
// differentiated by border/text/glow only — so the always-verified
// text-ink-muted/text-brand-on-panel contrast pairs never shift with state.
function StepCell({ index, state, pending, label }: StepCellProps) {
  const cellRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = cellRef.current;
    if (!el || state !== "current" || !pending) return;
    const tween = blinkPending(el);
    return () => {
      tween?.kill();
      el.removeAttribute("data-blink");
      el.style.opacity = "";
    };
  }, [state, pending]);

  return (
    <span
      ref={cellRef}
      aria-current={state === "current" ? "step" : undefined}
      className={cn(
        "flex items-center gap-1.5 border bg-panel px-2.5 py-1.5 font-mono text-xs uppercase tracking-wide sm:text-sm",
        state === "current" && "border-brand text-brand [text-shadow:0_0_0.3em_var(--accent)]",
        state === "done" && "border-line text-brand",
        state === "upcoming" && "border-line/40 text-ink-muted",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-4 shrink-0 items-center justify-center border text-[10px]",
          (state === "current" || state === "done") && "border-brand text-brand",
          state === "upcoming" && "border-line/40 text-ink-muted",
        )}
      >
        {state === "done" ? "✓" : index + 1}
      </span>
      {label}
    </span>
  );
}

export function StepIndicator({ current, pending = false, className }: StepIndicatorProps) {
  const t = useTranslations("Analyze.stepIndicator");

  return (
    <ol className={cn("flex items-center gap-2", className)}>
      {STEPS.map((step, index) => {
        const state = stepState(step, current);
        return (
          <li key={step} className="flex items-center gap-2">
            {index > 0 && (
              <span
                aria-hidden="true"
                className={cn("h-px w-4 sm:w-6", state === "upcoming" ? "bg-line/40" : "bg-brand")}
              />
            )}
            <StepCell index={index} state={state} pending={pending} label={t(step)} />
          </li>
        );
      })}
    </ol>
  );
}
