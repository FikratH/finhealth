import { useTranslations } from "next-intl";

export interface MissingMetricsHintProps {
  missingMetrics: string[];
}

// The standard-case hint (confidence is fine, but this data would sharpen
// it) — distinct from ScoreHeader's emphasized "composed guidance" panel
// for the insufficient-data state, which reuses the same list differently.
export function MissingMetricsHint({ missingMetrics }: MissingMetricsHintProps) {
  const t = useTranslations("Results.missingMetrics");

  if (missingMetrics.length === 0) return null;

  return (
    <section className="border border-line p-4">
      <p className="font-mono text-xs uppercase tracking-wide text-ink-muted">{t("heading")}</p>
      <p className="mt-2 text-sm text-ink">{t("hint")}</p>
      <p className="mt-1 text-sm text-ink-muted">{missingMetrics.join(", ")}</p>
    </section>
  );
}
