import { useTranslations } from "next-intl";
import { SectionHeading } from "@/components/section-heading";

const STEPS = ["stepOne", "stepTwo", "stepThree"] as const;

// A document's numbered protocol, not a wizard: the sequence (upload before
// verify before diagnose) is real information, so numbering is earned, not
// decorative. Every step renders with the same accent weight — the
// "always-lit" grammar — because this is an overview, not a live flow with
// a current step; nothing here should read as "not yet reached."
export function HowItWorks() {
  const t = useTranslations("Landing.howItWorks");

  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <SectionHeading>{t("heading")}</SectionHeading>
      <ol className="mt-8 grid gap-8 border-t border-line pt-8 md:grid-cols-3 md:divide-x md:divide-line">
        {STEPS.map((step, index) => (
          <li key={step} className="md:px-8 md:first:pl-0 md:last:pr-0">
            <div className="flex items-baseline gap-3">
              <span aria-hidden="true" className="font-mono text-sm text-brand">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="font-display text-xl text-ink">
                {t(`${step}Title`)}
              </h3>
            </div>
            <p className="mt-3 text-ink-muted">{t(`${step}Body`)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
