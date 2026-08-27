import { useTranslations } from "next-intl";
import { SectionHeading } from "@/components/section-heading";
import { MetricNumber } from "@/components/metric-number";
import { LedBar } from "@/components/led-bar";
import type { CategoryScore } from "@/lib/api-types";
import type { Locale } from "@/lib/format";

export interface CategoryScoresProps {
  categories: CategoryScore[];
  locale: Locale;
}

// The category strip re-skinned as an instrument bar row: each category
// gets a bezelled track (border + panel surface, same grammar
// ConfidenceMeter's own bar already carries) with the world's discrete LED
// bar-graph device (LedBar) instead of a continuous fill — the fintech
// dashboard default this world refuses (finish review, material_fixes 2).
// A null score renders an all-ghost track (LedBar's own designed-absence
// contract), never hidden.
export function CategoryScores({ categories, locale }: CategoryScoresProps) {
  const t = useTranslations("Results.categories");

  return (
    <section className="space-y-4">
      <SectionHeading>{t("heading")}</SectionHeading>
      <ul className="space-y-4">
        {categories.map((category) => (
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
              <LedBar value={category.score} tone="brand" />
            </div>
            <p className="font-mono text-xs text-ink-muted">
              {t("ratiosUsed", { count: category.ratios_used })}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
