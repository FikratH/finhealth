import { getTranslations, setRequestLocale } from "next-intl/server";

type HomePageProps = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <div className="grid-paper border-y border-line px-8 py-12">
        <h1 className="font-display text-4xl text-ink">{t("title")}</h1>
        <p className="mt-3 max-w-prose text-ink-muted">{t("lede")}</p>
        <span className="mt-6 inline-block border border-line bg-paper px-2 py-1 font-mono text-xs uppercase tracking-wide text-ink-muted">
          {t("specimenChip")}
        </span>
      </div>
    </div>
  );
}
