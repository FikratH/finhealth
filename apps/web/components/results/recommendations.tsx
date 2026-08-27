import { useTranslations } from "next-intl";
import { SectionHeading } from "@/components/section-heading";
import { SpecimenChip } from "@/components/specimen-chip";
import { MetricNumber } from "@/components/metric-number";
import { sortRecommendationsByPriority } from "@/lib/results";
import type { Recommendation } from "@/lib/api-types";
import type { Locale } from "@/lib/format";

export interface RecommendationsProps {
  recommendations: Recommendation[];
  locale: Locale;
}

const PRIORITY_KEY: Record<string, "priorityHigh" | "priorityMedium" | "priorityLow"> = {
  high: "priorityHigh",
  medium: "priorityMedium",
  low: "priorityLow",
};
const DIFFICULTY_KEY: Record<string, "difficultyHigh" | "difficultyMedium" | "difficultyLow"> = {
  high: "difficultyHigh",
  medium: "difficultyMedium",
  low: "difficultyLow",
};

// The prescription list: priority-sorted (so the numbering itself carries
// information — the one case the craft floor's section-number ban doesn't
// cover), tradeoffs always visible rather than hidden behind a toggle,
// because the tradeoff IS the decision the reader has to make.
export function Recommendations({ recommendations, locale }: RecommendationsProps) {
  const t = useTranslations("Results.recommendations");

  if (recommendations.length === 0) return null;

  const sorted = sortRecommendationsByPriority(recommendations);

  return (
    <section className="space-y-4">
      <SectionHeading>{t("heading")}</SectionHeading>
      <ol className="space-y-4">
        {sorted.map((rec, index) => (
          <li
            key={`${rec.ratio}-${index}`}
            className="border border-line p-4 print:break-inside-avoid"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <span className="font-mono text-sm text-ink-muted">№ {index + 1}</span>
              <SpecimenChip tone={rec.priority === "high" ? "attention" : "neutral"}>
                {t(PRIORITY_KEY[rec.priority] ?? "priorityLow")}
              </SpecimenChip>
            </div>
            <p className="mt-2 text-sm text-ink-muted">{rec.problem}</p>
            <p className="mt-2 text-ink">{rec.action}</p>
            {rec.current_value !== null && rec.current_value !== undefined && (
              <p className="mt-2 font-mono text-xs text-ink-muted">
                {rec.ratio}: <MetricNumber value={rec.current_value} locale={locale} /> ·{" "}
                {rec.benchmark_hint}
              </p>
            )}
            <p className="mt-3 text-sm text-ink">
              <span className="font-mono text-xs uppercase tracking-wide text-ink-muted">
                {t("expectedEffectLabel")}:
              </span>{" "}
              {rec.expected_effect}
            </p>
            <p className="mt-2 text-sm text-ink">
              <span className="font-mono text-xs uppercase tracking-wide text-ink-muted">
                {t("tradeoffsLabel")}:
              </span>{" "}
              {rec.tradeoffs}
            </p>
            <p className="mt-2 font-mono text-xs text-ink-muted">
              {t("difficultyLabel")} {t(DIFFICULTY_KEY[rec.difficulty] ?? "difficultyMedium")}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
