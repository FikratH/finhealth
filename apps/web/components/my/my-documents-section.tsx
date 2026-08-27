"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SectionHeading } from "@/components/section-heading";
import { MyDocumentsTable } from "./my-documents-table";
import { ApiError, deleteMyDocument, getMyDocuments } from "@/lib/api";
import type { MyDocumentSummary } from "@/lib/api-types";
import type { Locale } from "@/lib/format";

export interface MyDocumentsSectionProps {
  locale: Locale;
  onSessionExpired: () => void;
}

type LoadState = "loading" | "ready" | "error";

// «Мои документы» — P5.T7's opt-in document vault, a second section on the
// already-auth-gated /my page (MyAnalysesView owns the signed-in gate and
// the identity-keyed remount; this component only owns its own fetch/
// delete state, the same split MyAnalysesContent uses for analyses). A
// 401 here reuses the exact same onSessionExpired callback as the
// analyses section, so an expired session collapses to one shared
// signed-out prompt regardless of which section's request hit it first.
export function MyDocumentsSection({ locale, onSessionExpired }: MyDocumentsSectionProps) {
  const t = useTranslations("My.documents");
  const [state, setState] = useState<LoadState>("loading");
  const [documents, setDocuments] = useState<MyDocumentSummary[]>([]);
  const [deleteError, setDeleteError] = useState(false);

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
      await deleteMyDocument(id);
      setDocuments((current) => current.filter((doc) => doc.doc_id !== id));
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
          <MyDocumentsTable documents={documents} locale={locale} onDelete={handleDelete} />
        </>
      )}
    </div>
  );
}
