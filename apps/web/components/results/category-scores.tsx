import { useTranslations } from "next-intl";
import { SectionHeading } from "@/components/section-heading";
import { MetricNumber } from "@/components/metric-number";
import type { CategoryScore } from "@/lib/api-types";
import type { Locale } from "@/lib/format";

export interface CategoryScoresProps {
  categories: CategoryScore[];
  locale: Locale;
}

// The category strip re-skinned as an instrument bar row: each category
// gets a bezelled track (border + panel surface, same grammar
// ConfidenceMeter's own bar already carries) with a brand-LED fill and a
// low-spread glow, instead of the retired lab-report's flat hairline +
// accent fill. Accent-trap discipline: Tailwind's `accent-*` utilities
// resolve to --accent-surface (a pale wash) here, not real teal — the LED
// fill uses `bg-brand`, the actual `--accent` token.
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
              <div className="h-1.5 w-full border border-line bg-panel">
                {hasScore && (
                  <div
                    className="h-full bg-brand shadow-[0_0_4px_0px_var(--accent)] transition-[width] duration-700 ease-out motion-reduce:transition-none"
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
