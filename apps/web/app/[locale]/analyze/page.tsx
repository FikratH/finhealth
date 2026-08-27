import { getTranslations, setRequestLocale } from "next-intl/server";
import { AnalyzeFlow } from "@/components/analyze/analyze-flow";
import { pageMetadata } from "@/lib/seo";

type AnalyzePageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: AnalyzePageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Analyze.meta" });

  return pageMetadata({ title: t("title"), description: t("description"), locale });
}

export default async function AnalyzePage({ params }: AnalyzePageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <AnalyzeFlow />;
}
