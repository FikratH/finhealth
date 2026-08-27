"use client";

import { useId, useRef, useState } from "react";
import type { DragEvent } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorBanner } from "./error-banner";
import { bytesToMB, exceedsMaxSize, isAcceptedExtension } from "@/lib/analyze-reducer";
import type { AnalyzeError, UploadPhase } from "@/lib/analyze-reducer";
import type { Industry } from "@/lib/api-types";

export interface UploadStepProps {
  file: File | null;
  industries: Industry[];
  industry: string;
  uploadPhase: UploadPhase;
  error: AnalyzeError | null;
  retain: boolean;
  onFileSelected: (file: File) => void;
  onFileCleared: () => void;
  onIndustryChange: (industry: string) => void;
  onRetainChange: (retain: boolean) => void;
  onSubmit: () => void;
}

const ACCEPT_ATTR = ".pdf,.xlsx,.xls,.csv";

// Step 1: dropzone + picker, 15MB client pre-check, industry select. Sits at
// the top of the same continuous document as Step 2 — analyze-flow.tsx
// swaps this out for VerifyStep in place, it never routes to a new page.
export function UploadStep({
  file,
  industries,
  industry,
  uploadPhase,
  error,
  retain,
  onFileSelected,
  onFileCleared,
  onIndustryChange,
  onRetainChange,
  onSubmit,
}: UploadStepProps) {
  const t = useTranslations("Analyze.upload");
  const hintT = useTranslations("Analyze.upload.hints");
  const inputId = useId();
  const retainId = `${inputId}-retain`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  // isPending collapses to "not signed in" — same convention as
  // account-menu.tsx and my-analyses-view.tsx: a checkbox that briefly
  // flashes in once the session check resolves reads worse than it simply
  // not being there yet for something this optional.
  const { data: session, isPending: sessionPending } = useSession();
  const signedIn = !sessionPending && !!session;

  const busy = uploadPhase !== "idle";
  const canSubmit = file !== null && industry !== "" && !busy;

  function handleFiles(files: FileList | null) {
    const next = files?.[0];
    if (!next) return;
    if (!isAcceptedExtension(next.name)) {
      setLocalError(t("extensionError"));
      return;
    }
    if (exceedsMaxSize(next)) {
      setLocalError(
        t("sizeError", { name: next.name, size: bytesToMB(next.size).toFixed(1) }),
      );
      return;
    }
    setLocalError(null);
    onFileSelected(next);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    handleFiles(event.dataTransfer.files);
  }

  const missingReason = !file
    ? t("missingFileError")
    : industry === ""
      ? t("missingIndustryError")
      : null;
  const statusText =
    uploadPhase === "uploading"
      ? t("uploadingStatus")
      : uploadPhase === "extracting"
        ? t("extractingStatus")
        : null;
  const displayError = localError ? { message: localError, status: 0 } : error;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink">{t("heading")}</h1>
        <p className="mt-1 max-w-prose text-ink-muted">{t("lede")}</p>
      </div>

      {displayError && <ErrorBanner error={displayError} hintT={hintT} />}

      {/* The docking bay: an empty bezel awaiting media. Idle = a plain
       * instrument slot (solid 1px border, ghost-cell perforation texture
       * inside — "unlit segments are designed too" extended to an empty
       * bay). Drag = teal edge lighting, the transient border-accent
       * exemption re-skinned as a lit bezel edge + soft glow rather than a
       * filled color wash. */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "ghost-cell-texture border bg-panel p-10 text-center transition-colors duration-150",
          dragging
            ? "border-brand shadow-[0_0_0_1px_var(--accent),0_0_24px_2px_color-mix(in_oklch,var(--accent)_35%,transparent)]"
            : "border-line",
        )}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPT_ATTR}
          className="sr-only"
          disabled={busy}
          onChange={(event) => handleFiles(event.target.files)}
        />
        <p className="font-display text-lg text-ink">{t("dropzoneLabel")}</p>
        <p className="mt-1.5 font-mono text-xs uppercase tracking-wide text-ink-muted">
          {t("dropzoneHint")}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-4 font-mono text-xs uppercase tracking-wide"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {t("browseButton")}
        </Button>
      </div>

      {file && (
        <div className="flex items-center justify-between border border-line bg-panel px-3 py-2 font-mono text-sm text-ink">
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block size-1.5 shrink-0 rounded-full bg-brand shadow-[0_0_4px_1px_var(--accent)]"
            />
            {t("selectedFile", { name: file.name })}
          </span>
          <button
            type="button"
            onClick={onFileCleared}
            disabled={busy}
            className="text-ink-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
          >
            {t("removeFile")}
          </button>
        </div>
      )}

      {/* Industry select as an instrument switch panel: the same
       * grid-paper + bezel + panel-surface recipe DocumentControls uses in
       * Step 2, so the two "choose the document's industry" moments read
       * as the same instrument, not two different UI languages. */}
      <div className="grid-paper space-y-1.5 border border-line bg-panel p-4">
        <label htmlFor={`${inputId}-industry`} className="block font-mono text-xs uppercase tracking-wide text-ink-muted">
          {t("industryLabel")}
        </label>
        {/* Always pass a defined string (never undefined) so Select stays
         * controlled from the first render — switching between undefined
         * and a real value trips React's controlled/uncontrolled warning.
         * "" matches no SelectItem, so the placeholder still shows. */}
        <Select value={industry} onValueChange={onIndustryChange} disabled={busy}>
          <SelectTrigger id={`${inputId}-industry`} className="w-full sm:w-80">
            <SelectValue placeholder={t("industryPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {industries.map((ind) => (
              <SelectItem key={ind.id} value={ind.id}>
                {ind.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-ink-muted">{t("industryHint")}</p>
      </div>

      {/* Opt-in document retention (P5.T7) — visible ONLY when signed in
       * (default off, matching the product's privacy default — see
       * PRODUCT.md). Same instrument switch grammar as DocumentControls'
       * `audited` toggle: a visually-hidden native checkbox driving a
       * bezelled track + LED thumb via the peer pattern, so behavior and
       * screen-reader semantics stay on the real control while the visible
       * focus ring lands on its decorative sibling. */}
      {signedIn && (
        <div className="grid-paper space-y-2 border border-line bg-panel p-4">
          <label htmlFor={retainId} className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <span className="relative inline-flex h-4 w-8 shrink-0 items-center border border-line bg-panel">
              <input
                id={retainId}
                type="checkbox"
                checked={retain}
                disabled={busy}
                onChange={(event) => onRetainChange(event.target.checked)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className="absolute left-0.5 size-2.5 bg-ink-muted transition-transform duration-150 peer-checked:translate-x-4 peer-checked:bg-brand peer-checked:shadow-[0_0_4px_1px_var(--accent)]"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 border border-transparent peer-focus-visible:border-ring"
              />
            </span>
            {t("retainLabel")}
          </label>
          <p className="text-xs text-ink-muted">{t("retainDisclosure")}</p>
        </div>
      )}

      <div>
        <Button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          aria-describedby={missingReason && !busy ? `${inputId}-submit-hint` : undefined}
          className="font-mono text-xs uppercase tracking-wide shadow-[0_0_10px_1px_color-mix(in_oklch,var(--accent)_28%,transparent)] hover:shadow-[0_0_14px_2px_color-mix(in_oklch,var(--accent)_38%,transparent)] active:shadow-[0_0_6px_1px_color-mix(in_oklch,var(--accent)_28%,transparent)]"
        >
          {statusText ?? t("submitButton")}
        </Button>
        {missingReason && !busy && (
          <p
            id={`${inputId}-submit-hint`}
            role="status"
            aria-live="polite"
            className="mt-2 text-xs text-ink-muted"
          >
            {missingReason}
          </p>
        )}
        {statusText && (
          <p role="status" aria-live="polite" className="sr-only">
            {statusText}
          </p>
        )}
      </div>
    </div>
  );
}
