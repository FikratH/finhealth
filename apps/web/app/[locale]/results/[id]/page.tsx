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
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "Results.meta" });

  // The share-link OG card: title includes the health_label verdict (the
  // shareable headline), description deliberately stays generic — no score,
  // no ratio values — so a shared link's link-preview card never leaks a
  // company's actual numbers to whoever it's shared with before they open
  // it (see docs/superpowers/plans/2026-08-27-plan-4-diagnosis-experience.md,
  // Task 6's share-metadata privacy requirement).
  try {
    const analysis = await getAnalysisServer(id);
    return {
      title: t("titleWithLabel", { label: analysis.health_label }),
      description: t("description"),
    };
  } catch {
    // Unknown/expired id, or a real fetch failure — the page body's own
    // error handling covers the user-visible outcome; metadata just falls
    // back to the generic (non-personalized) title/description.
    return {
      title: t("title"),
      description: t("description"),
    };
  }
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
