import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
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

export function StepIndicator({ current, className }: StepIndicatorProps) {
  const t = useTranslations("Analyze.stepIndicator");

  return (
    <ol className={cn("flex items-center gap-3 font-mono text-xs uppercase tracking-wide", className)}>
      {STEPS.map((step, index) => {
        const state = stepState(step, current);
        return (
          <li key={step} className="flex items-center gap-3">
            {index > 0 && (
              <span aria-hidden="true" className="h-px w-6 bg-line" />
            )}
            <span
              aria-current={state === "current" ? "step" : undefined}
              className={cn(
                "flex items-center gap-1.5",
                state === "current" && "text-ink",
                state === "done" && "text-accent",
                state === "upcoming" && "text-ink-muted",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-4 items-center justify-center rounded-full border text-[10px]",
                  state === "current" && "border-accent bg-accent text-paper",
                  state === "done" && "border-accent text-accent",
                  state === "upcoming" && "border-line text-ink-muted",
                )}
              >
                {state === "done" ? "✓" : index + 1}
              </span>
              {t(step)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
