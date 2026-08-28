import { useTranslations } from "next-intl";
import { SectionHeading } from "@/components/section-heading";
import { Link } from "@/i18n/navigation";

export interface FootnotesProps {
  /** source string -> 1-based footnote number, from lib/results.ts's
   * buildFootnoteIndex. */
  sources: Map<string, number>;
  /** Additive (Phase 7 Task 5): whether any ratio in this analysis carries
   * a `benchmark_kz` mark — when true, shows a single, honest "partial
   * coverage" note once here rather than repeating it on every KZ-marked
   * ratio row. */
  hasKzOverlay?: boolean;
}

export function Footnotes({ sources, hasKzOverlay = false }: FootnotesProps) {
  const t = useTranslations("Results.footnotes");

  if (sources.size === 0) return null;

  const entries = Array.from(sources.entries()).sort((a, b) => a[1] - b[1]);

  return (
    <section className="space-y-2">
      <SectionHeading level={3}>{t("heading")}</SectionHeading>
      <ol className="space-y-1 font-mono text-xs text-ink-muted">
        {entries.map(([source, number]) => (
          <li key={source} id={`fn-${number}`}>
            [{number}] {source}
          </li>
        ))}
      </ol>
      {hasKzOverlay && <p className="text-sm text-ink-muted">{t("kzPartialCoverageNote")}</p>}
      <p className="font-mono text-sm">
        <Link href="/methodology" className="text-brand no-underline hover:underline">
          {t("methodologyLinkLabel")}
        </Link>
      </p>
    </section>
  );
}
