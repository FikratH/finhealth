"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "@/lib/auth-client";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/section-heading";
import { MyAnalysesTable } from "./my-analyses-table";
import { MyDocumentsSection } from "./my-documents-section";
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
// This gate is driven by `session`/`isPending` ONLY, from the exact same
// `useSession()` store SiteHeader's AccountMenu/AccountNavLink read (see
// lib/auth-client.ts — one shared Better Auth nanostores atom, same
// instance everywhere) — never by a page-local flag. Earlier this page had
// a `sessionExpired` boolean that a 401 from MyAnalysesContent's own fetch
// set directly, forcing this gate regardless of what `session` said. That
// was wrong: apps/api/app/auth.py's `require_user` returns the identical
// 401 whether the caller's Bearer JWT is genuinely invalid/expired OR the
// web<->API bridge itself failed to mint one at all (misconfigured
// AUTH_JWT_SECRET, a transient /auth/token failure, a race before
// AuthBootstrap registers lib/api.ts's tokenProvider) — a 401 from that
// endpoint does NOT mean the Better Auth session is gone. Trusting it
// anyway produced a real, reproduced bug: the header (reading only
// Better Auth's own session) correctly showed the signed-in identity while
// this page's main content showed "Требуется вход" underneath it — two
// contradictory answers to "am I signed in?" on the same screen, from two
// components subscribed to the same store. See MyAnalysesContent's own
// comment for what a 401 does instead (asks Better Auth's `refetch()` —
// the one honest source of truth both surfaces already share — rather
// than deciding locally).
export function MyAnalysesView({ locale }: MyAnalysesViewProps) {
  const t = useTranslations("My");
  const { data: session, isPending, refetch } = useSession();

  if (isPending || !session) {
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
      onAuthFailure={refetch}
    />
  );
}

interface MyAnalysesContentProps {
  locale: Locale;
  // Better Auth's own session refetch (see MyAnalysesView's header comment)
  // — called, never trusted blindly, on a 401 from either request below.
  onAuthFailure: () => void;
}

function MyAnalysesContent({ locale, onAuthFailure }: MyAnalysesContentProps) {
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
          // Ask Better Auth to re-verify its own session rather than
          // assuming this 401 means "signed out" — see MyAnalysesView's
          // header comment. Still surfaces as an ordinary load error here
          // (never a silent hang): if the session really is gone, this
          // component unmounts in favor of MyAnalysesView's own gate the
          // instant the shared store updates; if it's still valid (a
          // bridge-only failure), the user sees a normal, honest "couldn't
          // load" message instead of a false "please sign in" screen.
          onAuthFailure();
        }
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [onAuthFailure]);

  async function handleDelete(id: string) {
    try {
      await deleteMyAnalysis(id);
      setAnalyses((current) => current.filter((row) => row.analysis_id !== id));
      setDeleteError(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onAuthFailure();
        return;
      }
      setDeleteError(true);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-16">
      {/* level={1}: this is the signed-in /my page's own first heading —
       * it had no h1 at all before (close-wave finish-review fix 4). The
       * documents section right below stays its own peer h2. */}
      <SectionHeading level={1}>{t("heading")}</SectionHeading>

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

      {/* P5.T7's opt-in document vault: its own fetch/delete state, own
       * loading/empty/error rendering — deliberately not blocked on the
       * analyses table above finishing first (a slow/failed analyses list
       * must not hide an unrelated, already-loaded documents section). */}
      <MyDocumentsSection locale={locale} onAuthFailure={onAuthFailure} />
    </div>
  );
}
