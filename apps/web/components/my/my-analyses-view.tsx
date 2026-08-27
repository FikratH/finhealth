"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "@/lib/auth-client";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/section-heading";
import { MyAnalysesTable } from "./my-analyses-table";
import { ApiError, deleteMyAnalysis, getMyAnalyses } from "@/lib/api";
import type { MyAnalysisSummary } from "@/lib/api-types";
import type { Locale } from "@/lib/format";

export interface MyAnalysesViewProps {
  locale: Locale;
}

type LoadState = "loading" | "ready" | "error";

// «Мои анализы» — the product's one auth-gated page. The gate is
// client-side (Better Auth's session lives in the browser, not on the
// server render): `!isPending && !session` renders the signed-out
// prompt, and so does `isPending` itself — the same isPending-collapses-
// to-signed-out convention as components/account-menu.tsx (see its own
// header comment): a page that briefly shows the prompt before settling
// into the real table reads better than a loading skeleton for something
// this size.
//
// A 401 from either request (session expired mid-view — Better Auth's
// client-side session cache can outlive the JWT it minted) reuses the
// exact same designed-absence prompt via `sessionExpired`, rather than a
// separate "your session expired" state.
export function MyAnalysesView({ locale }: MyAnalysesViewProps) {
  const t = useTranslations("My");
  const { data: session, isPending } = useSession();
  const signedIn = !isPending && Boolean(session);

  const [state, setState] = useState<LoadState>("loading");
  const [analyses, setAnalyses] = useState<MyAnalysisSummary[]>([]);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    // No synchronous setState("loading") here (react-hooks/set-state-in-
    // effect, same discipline as analyze-flow.tsx's own mount fetch) —
    // `state` already starts at "loading", which covers the mount case;
    // the only state changes below happen inside the promise callbacks.
    getMyAnalyses()
      .then((res) => {
        if (cancelled) return;
        setAnalyses(res.analyses);
        setState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setSessionExpired(true);
          return;
        }
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  async function handleDelete(id: string) {
    try {
      await deleteMyAnalysis(id);
      setAnalyses((current) => current.filter((row) => row.analysis_id !== id));
      setDeleteError(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setSessionExpired(true);
        return;
      }
      setDeleteError(true);
    }
  }

  if (!signedIn || sessionExpired) {
    // Designed absence, same grammar as results/[id]/not-found.tsx: a
    // rule-framed composed block with a next action, never a bare
    // "please sign in" line.
    return (
      <div className="mx-auto max-w-2xl px-6 py-20">
        <div className="grid-paper border-2 border-ink p-10 text-center">
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
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-16">
      <SectionHeading>{t("heading")}</SectionHeading>

      {state === "loading" && (
        <p className="font-mono text-sm text-ink-muted">{t("loading")}</p>
      )}

      {state === "error" && <p className="text-sm text-critical">{t("loadError")}</p>}

      {state === "ready" && analyses.length === 0 && (
        <div className="grid-paper border-2 border-ink p-10 text-center">
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
