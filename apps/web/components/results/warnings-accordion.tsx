import { useTranslations } from "next-intl";
import { ChevronRightIcon } from "@/components/icons";
import type { AnalysisWarning } from "@/lib/api-types";

export interface WarningsAccordionProps {
  warnings: AnalysisWarning[];
}

export function WarningsAccordion({ warnings }: WarningsAccordionProps) {
  const t = useTranslations("Results.warnings");

  if (warnings.length === 0) return null;

  return (
    <details className="group border border-line p-4">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 font-mono text-sm text-ink hover:text-brand [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon className="transition-transform duration-150 group-open:rotate-90" />
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
