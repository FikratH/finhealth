import { useTranslations } from "next-intl";
import type { AnalysisWarning } from "@/lib/api-types";

export interface WarningsAccordionProps {
  warnings: AnalysisWarning[];
}

export function WarningsAccordion({ warnings }: WarningsAccordionProps) {
  const t = useTranslations("Results.warnings");

  if (warnings.length === 0) return null;

  return (
    <details className="border border-line p-4">
      <summary className="cursor-pointer font-mono text-sm text-ink hover:text-accent">
        {t("summary", { count: warnings.length })}
      </summary>
      <ul className="mt-3 space-y-2 text-sm text-ink-muted">
        {warnings.map((warning) => (
          <li key={warning.code}>{warning.message}</li>
        ))}
      </ul>
    </details>
  );
}
