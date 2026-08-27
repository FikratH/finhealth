import type { Status } from "@/components/status-pill";

// Score → status triad tiering, shared between the results header's
// verdict stamp (components/results/score-header.tsx) and the history
// table's StatusPill (components/my/my-analyses-table.tsx) — mirrors
// apps/api's health_label tiering (schemas.py: <45 weak/critical, <65
// satisfactory/attention, else good/strong) collapsed onto the status
// triad. A null score isn't a verdict at all, so it maps to "na" rather
// than borrowing a status color that would imply a real result.
export function verdictTone(score: number | null): Status {
  if (score === null) return "na";
  if (score < 45) return "critical";
  if (score < 65) return "attention";
  return "good";
}
