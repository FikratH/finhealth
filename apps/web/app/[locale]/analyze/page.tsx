import { getTranslations, setRequestLocale } from "next-intl/server";
import { AnalyzeFlow } from "@/components/analyze/analyze-flow";

type AnalyzePageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: AnalyzePageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Analyze.meta" });

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function AnalyzePage({ params }: AnalyzePageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <AnalyzeFlow />;
}
