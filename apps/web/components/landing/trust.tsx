import { useTranslations } from "next-intl";
import { SectionHeading } from "@/components/section-heading";
import { Link } from "@/i18n/navigation";

const POINT_KEYS = [
  "pointOpenMethodology",
  "pointDeterministic",
  "pointTraceable",
  "pointBenchmarks",
] as const;

// A systems-status panel: each methodology claim is its own annunciator
// line — a small lit LED (same glow recipe as StatusPill's "good" dot) plus
// the claim text — inside one bezel. One bezel, not four identical cards:
// nesting a bordered card per claim would be the "same-size cards" scaffold
// the craft floor bans; a single panel with internal rows is the systems-
// status idiom the quality-bar reference itself uses.
export function Trust() {
  const t = useTranslations("Landing.trust");

  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <SectionHeading>{t("heading")}</SectionHeading>
      <ul className="mt-8 max-w-3xl divide-y divide-line border border-line bg-panel">
        {POINT_KEYS.map((key) => (
          <li key={key} className="flex items-start gap-3 px-5 py-4">
            <span
              aria-hidden="true"
              className="mt-2 size-2 shrink-0 rounded-full bg-good shadow-[0_0_4px_1px_var(--good)]"
            />
            <p className="text-ink">{t(key)}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 max-w-3xl font-mono text-xs text-ink-muted">
        {t("footnote")}
      </p>
      <p className="mt-4 max-w-3xl font-mono text-sm">
        <Link
          href="/methodology"
          className="text-brand underline decoration-brand/50 underline-offset-4 hover:decoration-brand"
        >
          {t("methodologyLinkLabel")}
        </Link>
      </p>
    </section>
  );
}
