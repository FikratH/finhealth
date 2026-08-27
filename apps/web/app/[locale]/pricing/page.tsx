import { getTranslations, setRequestLocale } from "next-intl/server";
import { PricingTiers } from "@/components/pricing/pricing-tiers";
import { pageMetadata } from "@/lib/seo";

type PricingPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: PricingPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Pricing.meta" });

  return pageMetadata({ title: t("title"), description: t("description"), locale });
}

export default async function PricingPage({ params }: PricingPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <PricingTiers />;
}
