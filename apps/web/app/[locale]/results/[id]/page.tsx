import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ApiError } from "@/lib/api";
import { getAnalysisServer } from "@/lib/api-server";
import { ResultsDocument } from "@/components/results/results-document";
import type { Locale } from "@/lib/format";

type ResultsPageProps = {
  params: Promise<{ locale: string; id: string }>;
};

export async function generateMetadata({ params }: ResultsPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Results.meta" });

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function ResultsPage({ params }: ResultsPageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  let analysis;
  try {
    analysis = await getAnalysisServer(id);
  } catch (err) {
    // 404 (unknown/expired id) gets the designed not-found.tsx below.
    // Anything else (network, timeout, malformed response) is a real
    // server-side failure — let it propagate to Next's error boundary
    // rather than mislabeling it as "not found".
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return <ResultsDocument analysis={analysis} locale={locale as Locale} />;
}
