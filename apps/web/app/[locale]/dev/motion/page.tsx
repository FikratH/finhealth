import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionHeading } from "@/components/section-heading";
import { MotionDemo } from "@/components/dev/motion-demo";
import { BootGrammarDemo } from "@/components/dev/boot-grammar-demo";

// Dev-only visual QA surface for the motion metronome — not linked from
// product navigation; 404s outside dev, same discipline as /dev/tokens.
type DevMotionPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function DevMotionPage({ params }: DevMotionPageProps) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("DevMotion");

  return (
    <div className="mx-auto max-w-3xl space-y-12 px-6 py-12">
      <div>
        <h1 className="font-display text-3xl text-ink">{t("title")}</h1>
        <p className="mt-2 max-w-prose text-ink-muted">{t("lede")}</p>
      </div>

      <section className="space-y-4">
        <SectionHeading>{t("beatsHeading")}</SectionHeading>
        <MotionDemo
          beatLabels={{
            fast: t("fastLabel"),
            base: t("baseLabel"),
            reveal: t("revealLabel"),
          }}
          beatCopy={{
            fast: t("fastCopy"),
            base: t("baseCopy"),
            reveal: t("revealCopy"),
          }}
          replayLabel={t("replayLabel")}
          reducedNotice={t("reducedNotice")}
        />
      </section>

      <section className="space-y-4">
        <SectionHeading>{t("bootHeading")}</SectionHeading>
        <BootGrammarDemo
          stepLabel={t("stepLabel")}
          stepCopy={t("stepCopy")}
          sweepLabel={t("sweepLabel")}
          sweepCopy={t("sweepCopy")}
          replayLabel={t("replayLabel")}
          reducedNotice={t("reducedNotice")}
        />
      </section>
    </div>
  );
}
