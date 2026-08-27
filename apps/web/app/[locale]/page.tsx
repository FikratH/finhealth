import { getTranslations, setRequestLocale } from "next-intl/server";
import { LandingHero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Trust } from "@/components/landing/trust";
import { PrivacyStrip } from "@/components/landing/privacy-strip";
import { pageMetadata, SITE_NAME } from "@/lib/seo";

type HomePageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: HomePageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Landing.meta" });
  const title = t("title");

  return pageMetadata({
    title,
    description: t("description"),
    locale,
    // This page shares its route segment with app/[locale]/layout.tsx —
    // see pageMetadata's documentTitle doc comment for why that means the
    // root title template doesn't reach it, and it has to spell out the
    // brand suffix itself.
    documentTitle: `${title} — ${SITE_NAME}`,
  });
}

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <LandingHero />
      <HowItWorks />
      <Trust />
      <PrivacyStrip />
    </>
  );
}
