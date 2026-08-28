import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ApiError } from "@/lib/api";
import { getAnalysisServer } from "@/lib/api-server";
import { ResultsDocument } from "@/components/results/results-document";
import type { Locale } from "@/lib/format";

type ResultsPageProps = {
  params: Promise<{ locale: string; id: string }>;
};

// P7.T2: forwards an already-established X-Request-ID from the incoming
// page request (e.g. a proxy/CDN header) to the API's own analysis fetch,
// so both legs of one page load trace under the same id. `headers()` sees
// the real incoming request today only behind an infrastructure layer
// that actually sets this header on page navigations — nothing in this
// stack currently does, so `undefined` (nothing forwarded, the API
// generates its own id for this fetch) is the expected common case, not a
// bug. Deliberately not generated HERE even when absent: see
// lib/api-server.ts's own comment on why the API stays the id authority.
async function _incomingRequestId(): Promise<string | undefined> {
  return (await headers()).get("x-request-id") ?? undefined;
}

export async function generateMetadata({ params }: ResultsPageProps) {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "Results.meta" });
  const requestId = await _incomingRequestId();

  // The share-link OG card: title includes the health_label verdict (the
  // shareable headline), description deliberately stays generic — no score,
  // no ratio values — so a shared link's link-preview card never leaks a
  // company's actual numbers to whoever it's shared with before they open
  // it (see docs/superpowers/plans/2026-08-27-plan-4-diagnosis-experience.md,
  // Task 6's share-metadata privacy requirement).
  try {
    const analysis = await getAnalysisServer(id, requestId);
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
  const requestId = await _incomingRequestId();

  let analysis;
  try {
    analysis = await getAnalysisServer(id, requestId);
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
