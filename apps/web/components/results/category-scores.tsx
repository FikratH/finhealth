import { useTranslations } from "next-intl";
import { SectionHeading } from "@/components/section-heading";
import { MetricNumber } from "@/components/metric-number";
import type { CategoryScore } from "@/lib/api-types";
import type { Locale } from "@/lib/format";

export interface CategoryScoresProps {
  categories: CategoryScore[];
  locale: Locale;
}

// Document-grammar bars, not a chart library widget: a hairline track, an
// accent fill, PT Mono figures — the same instrument-precision motion as
// ScoreDial/ConfidenceMeter (draws once, respects reduced motion).
export function CategoryScores({ categories, locale }: CategoryScoresProps) {
  const t = useTranslations("Results.categories");

  return (
    <section className="space-y-4">
      <SectionHeading>{t("heading")}</SectionHeading>
      <ul className="space-y-4">
        {categories.map((category) => {
          const hasScore = category.score !== null;
          const clamped = hasScore
            ? Math.min(100, Math.max(0, category.score as number))
            : 0;
          return (
            <li key={category.category} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-ink">{category.label}</span>
                <MetricNumber
                  value={category.score}
                  decimals={1}
                  locale={locale}
                  naLabel={t("insufficientData")}
                  className="text-lg"
                />
              </div>
              <div className="h-1.5 w-full bg-line">
                {hasScore && (
                  <div
                    className="h-full bg-accent transition-[width] duration-700 ease-out motion-reduce:transition-none"
                    style={{ width: `${clamped}%` }}
                  />
                )}
              </div>
              <p className="font-mono text-xs text-ink-muted">
                {t("ratiosUsed", { count: category.ratios_used })}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
