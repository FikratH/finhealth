import { useTranslations } from "next-intl";
import { SectionHeading } from "@/components/section-heading";
import { Link } from "@/i18n/navigation";

const POINT_KEYS = [
  "pointOpenMethodology",
  "pointDeterministic",
  "pointTraceable",
  "pointBenchmarks",
] as const;

// The заключение voice applied to positioning itself: read as an excerpt
// from the report's own "методика" section (serif-set, rule-framed), with
// the benchmark claim carrying a footnote — not a marketing bullet list.
export function Trust() {
  const t = useTranslations("Landing.trust");

  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <SectionHeading>{t("heading")}</SectionHeading>
      <div className="mt-8 max-w-3xl space-y-4 border-l border-line pl-6 font-display text-lg leading-relaxed text-ink">
        {POINT_KEYS.map((key) => (
          <p key={key}>{t(key)}</p>
        ))}
      </div>
      <p className="mt-4 max-w-3xl font-mono text-xs text-ink-muted">
        {t("footnote")}
      </p>
      <p className="mt-4 max-w-3xl font-mono text-sm">
        <Link href="/methodology" className="text-accent underline">
          {t("methodologyLinkLabel")}
        </Link>
      </p>
    </section>
  );
}
