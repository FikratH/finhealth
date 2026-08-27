"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "@/lib/auth-client";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/section-heading";
import { MyAnalysesTable } from "./my-analyses-table";
import { OriginTicket } from "@/components/origin-ticket";
import { ApiError, deleteMyAnalysis, getMyAnalyses } from "@/lib/api";
import type { MyAnalysisSummary } from "@/lib/api-types";
import type { Locale } from "@/lib/format";

export interface MyAnalysesViewProps {
  locale: Locale;
}

type LoadState = "loading" | "ready" | "error";

// «Мои анализы» — the product's one auth-gated page, and the one page
// showing identity-scoped private data. The gate is client-side (Better
// Auth's session lives in the browser, not on the server render):
// `isPending || !session` renders the signed-out prompt, the same
// isPending-collapses-to-signed-out convention as
// components/account-menu.tsx (see its own header comment) — a page that
// briefly shows the prompt before settling into the real table reads
// better than a loading skeleton for something this size.
//
// A 401 from either request inside MyAnalysesContent (session expired
// mid-view — Better Auth's client-side session cache can outlive the JWT
// it minted) reuses the exact same designed-absence prompt via
// `sessionExpired`, rather than a separate "your session expired" state.
export function MyAnalysesView({ locale }: MyAnalysesViewProps) {
  const t = useTranslations("My");
  const { data: session, isPending } = useSession();
  const [sessionExpired, setSessionExpired] = useState(false);
  // Stable across re-renders so it's safe as MyAnalysesContent's fetch
  // effect dependency below without forcing a re-fetch on every parent
  // render.
  const handleSessionExpired = useCallback(() => setSessionExpired(true), []);

  if (isPending || !session || sessionExpired) {
    // Designed absence, same grammar as results/[id]/not-found.tsx and the
    // upload dropzone's empty state: an unlit instrument bay (ghost-cell
    // perforation texture, hairline bezel), never a bare "please sign in"
    // line. Neutral tone — an unauthenticated visit isn't a failure, so
    // this stays off the critical/attention LED colors entirely.
    return (
      <div className="mx-auto max-w-2xl px-6 py-20">
        <div className="ghost-cell-texture border border-line bg-panel p-10 text-center">
          <h1 className="font-display text-3xl text-ink">{t("signedOut.heading")}</h1>
          <p className="mt-4 text-ink-muted">{t("signedOut.body")}</p>
          <Button asChild className="mt-6">
            <Link href="/signin">{t("signedOut.cta")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <MyAnalysesContent
      // Keyed on identity: if the signed-in user changes without this
      // component unmounting (sign out, a different account signs back
      // in), a key change forces a full remount — every piece of fetched
      // state (rows, load state, delete errors) starts fresh rather than
      // the previous user's rows lingering on screen until the new fetch
      // resolves. Deliberately not solved by resetting state inside an
      // effect (see git history) — that fights React's set-state-in-
      // effect discipline and still leaves a stale-render window; a key
      // change has no such window by construction.
      key={session.user.id}
      locale={locale}
      onSessionExpired={handleSessionExpired}
    />
  );
}

interface MyAnalysesContentProps {
  locale: Locale;
  onSessionExpired: () => void;
}

function MyAnalysesContent({ locale, onSessionExpired }: MyAnalysesContentProps) {
  const t = useTranslations("My");
  const [state, setState] = useState<LoadState>("loading");
  const [analyses, setAnalyses] = useState<MyAnalysisSummary[]>([]);
  const [plan, setPlan] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // No synchronous setState("loading") here (react-hooks/set-state-in-
    // effect, same discipline as analyze-flow.tsx's own mount fetch) —
    // `state` already starts at "loading" on every fresh mount (including
    // the remount a key change on MyAnalysesView produces), which covers
    // this case; the only state changes below happen inside the promise
    // callbacks.
    getMyAnalyses()
      .then((res) => {
        if (cancelled) return;
        setAnalyses(res.analyses);
        setPlan(res.plan);
        setState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          onSessionExpired();
          return;
        }
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [onSessionExpired]);

  async function handleDelete(id: string) {
    try {
      await deleteMyAnalysis(id);
      setAnalyses((current) => current.filter((row) => row.analysis_id !== id));
      setDeleteError(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
        return;
      }
      setDeleteError(true);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-16">
      <SectionHeading>{t("heading")}</SectionHeading>

      {/* Quiet, display-only — no endpoint enforces a limit yet (P5.T5,
       * see apps/api/app/entitlements.py). Same specimen-label idiom as
       * every other chip on the site, never a badge or banner. */}
      {plan && (
        <div className="flex flex-wrap gap-2">
          <OriginTicket>{t(plan === "pro" ? "plan.pro" : "plan.free")}</OriginTicket>
        </div>
      )}

      {state === "loading" && (
        <p className="font-mono text-sm text-ink-muted">{t("loading")}</p>
      )}

      {state === "error" && <p className="text-sm text-critical">{t("loadError")}</p>}

      {state === "ready" && analyses.length === 0 && (
        // Same unlit-bay idiom as the signed-out state above — no history
        // yet is a designed absence, not an error.
        <div className="ghost-cell-texture border border-line bg-panel p-10 text-center">
          <h2 className="font-display text-2xl text-ink">{t("empty.heading")}</h2>
          <p className="mt-4 text-ink-muted">{t("empty.body")}</p>
          <Button asChild className="mt-6">
            <Link href="/analyze">{t("empty.cta")}</Link>
          </Button>
        </div>
      )}

      {state === "ready" && analyses.length > 0 && (
        <>
          {deleteError && <p className="text-sm text-critical">{t("deleteError")}</p>}
          <MyAnalysesTable analyses={analyses} locale={locale} onDelete={handleDelete} />
        </>
      )}
    </div>
  );
}
