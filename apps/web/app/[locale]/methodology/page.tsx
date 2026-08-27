import { getTranslations, setRequestLocale } from "next-intl/server";
import { MethodologyDocument } from "@/components/methodology/methodology-document";
import type { Locale } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

type MethodologyPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: MethodologyPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Methodology.meta" });

  return pageMetadata({ title: t("title"), description: t("description"), locale });
}

export default async function MethodologyPage({ params }: MethodologyPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <MethodologyDocument locale={locale as Locale} />;
}
