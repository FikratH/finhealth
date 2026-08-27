import { useTranslations } from "next-intl";
import { SectionHeading } from "@/components/section-heading";
import { Link } from "@/i18n/navigation";

export interface FootnotesProps {
  /** source string -> 1-based footnote number, from lib/results.ts's
   * buildFootnoteIndex. */
  sources: Map<string, number>;
}

export function Footnotes({ sources }: FootnotesProps) {
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
      <p className="font-mono text-sm">
        <Link href="/methodology" className="text-accent no-underline hover:underline">
          {t("methodologyLinkLabel")}
        </Link>
      </p>
    </section>
  );
}
