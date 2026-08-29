"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SectionHeading } from "@/components/section-heading";
import { MyDocumentsTable } from "./my-documents-table";
import { ApiError, deleteMyDocument, downloadMyDocument, getMyDocuments } from "@/lib/api";
import type { MyDocumentSummary } from "@/lib/api-types";
import type { Locale } from "@/lib/format";

export interface MyDocumentsSectionProps {
  locale: Locale;
  onAuthFailure: () => void;
}

type LoadState = "loading" | "ready" | "error";

// «Мои документы» — P5.T7's opt-in document vault, a second section on the
// already-auth-gated /my page (MyAnalysesView owns the signed-in gate and
// the identity-keyed remount; this component only owns its own fetch/
// delete state, the same split MyAnalysesContent uses for analyses). A
// 401 here calls the exact same onAuthFailure callback as the analyses
// section — Better Auth's own session refetch(), not a local "you're
// signed out" flag (see my-analyses-view.tsx's header comment for why: a
// 401 from this resource API doesn't by itself prove the Better Auth
// session the header reads is gone, and asserting it was is what produced
// the reported bug — this section's own load failure below stays an
// ordinary error message so it never contradicts the header either).
export function MyDocumentsSection({ locale, onAuthFailure }: MyDocumentsSectionProps) {
  const t = useTranslations("My.documents");
  const [state, setState] = useState<LoadState>("loading");
  const [documents, setDocuments] = useState<MyDocumentSummary[]>([]);
  const [deleteError, setDeleteError] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  // The section owns this (not the table) because it's the one that calls
  // downloadMyDocument() and knows when the request settles — the table
  // only renders whichever row's doc_id matches. null = no download
  // in flight anywhere in this list.
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyDocuments()
      .then((res) => {
        if (cancelled) return;
        setDocuments(res.documents);
        setState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          // Re-verify via Better Auth rather than assuming — see this
          // file's own header comment. Still surfaces as a normal load
          // error (never a silent hang): if the session really is gone,
          // MyAnalysesView's own gate takes over and this whole section
          // unmounts; if it's still valid, the user sees an honest
          // "couldn't load" line instead of nothing at all.
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
      await deleteMyDocument(id);
      setDocuments((current) => current.filter((doc) => doc.doc_id !== id));
      setDeleteError(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onAuthFailure();
        return;
      }
      setDeleteError(true);
    }
  }

  async function handleDownload(id: string, filename: string) {
    // The table's own button is already disabled once a row is
    // downloading (see my-documents-table.tsx), but a re-entrant guard
    // here too costs nothing and keeps this function safe to call
    // directly (e.g. from a future keyboard-triggered path that doesn't
    // go through the disabled button at all).
    if (downloadingId !== null) return;
    setDownloadingId(id);
    try {
      await downloadMyDocument(id, filename);
      setDownloadError(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onAuthFailure();
        return;
      }
      setDownloadError(true);
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Default level (h2), same as "Мои анализы" above — a peer section,
       * not level={3}/h3 nested under it. Documents is its own section, and
       * the shared parent <div> in my-analyses-view.tsx already puts the
       * two side by side as siblings; the heading level should say so too,
       * for anyone navigating this page by heading. */}
      <SectionHeading>{t("heading")}</SectionHeading>

      {state === "loading" && (
        <p className="font-mono text-sm text-ink-muted">{t("loading")}</p>
      )}

      {state === "error" && <p className="text-sm text-critical">{t("loadError")}</p>}

      {state === "ready" && documents.length === 0 && (
        // Same designed-absence idiom as the rest of /my — no retained
        // documents yet is a quiet, expected state, not an error.
        <div className="ghost-cell-texture border border-line bg-panel p-8 text-center">
          <p className="text-ink-muted">{t("empty.body")}</p>
        </div>
      )}

      {state === "ready" && documents.length > 0 && (
        <>
          {deleteError && <p className="text-sm text-critical">{t("deleteError")}</p>}
          {downloadError && <p className="text-sm text-critical">{t("downloadError")}</p>}
          <MyDocumentsTable
            documents={documents}
            locale={locale}
            onDownload={handleDownload}
            onDelete={handleDelete}
            downloadingId={downloadingId}
          />
        </>
      )}
    </div>
  );
}
