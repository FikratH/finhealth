"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
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
import { localizedIndustryName, type Locale } from "@/lib/format";
import { igniteSequence, scanlineLoop } from "@/lib/motion";
import type { Industry } from "@/lib/api-types";

export interface UploadStepProps {
  file: File | null;
  industries: Industry[];
  industry: string;
  uploadPhase: UploadPhase;
  error: AnalyzeError | null;
  retain: boolean;
  locale: Locale;
  /** GET /api/health's `vault_enabled` (P5.T8) — whether the server
   * currently accepts `retain=1` at all. The checkbox renders only when
   * this AND signedIn are both true, so a signed-in user in the default
   * (vault-disabled) configuration never sees a control that would 503 the
   * whole upload — see analyze-flow.tsx for where this is fetched. */
  vaultEnabled: boolean;
  /** GET /api/health's `ocr_enabled` (P7.T4) — whether a scanned-PDF
   * upload error should show the "or enable OCR" hint (ErrorBanner, gated
   * off when OCR is already on — see errorHintKey's own comment). */
  ocrEnabled: boolean;
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
  vaultEnabled,
  ocrEnabled,
  locale,
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
  const bayRef = useRef<HTMLDivElement>(null);
  const fileRowRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  // isPending collapses to "not signed in" — same convention as
  // account-menu.tsx and my-analyses-view.tsx: a checkbox that briefly
  // flashes in once the session check resolves reads worse than it simply
  // not being there yet for something this optional.
  const { data: session, isPending: sessionPending } = useSession();
  const signedIn = !sessionPending && !!session;
  const retainOffered = signedIn && vaultEnabled;

  // Close-wave F4: a checked retain must not outlive the conditions that
  // made the checkbox visible in the first place. Without this, a user who
  // ticks retain and then signs out mid-flow (same tab — useSession is
  // reactive, so `signedIn` flips without a remount) still has
  // `state.retain === true` with the checkbox no longer rendered anywhere
  // to uncheck — the eventual submit would send retain=1 anonymously and
  // 401. Mirrors the same reset analyze-reducer.ts already does on
  // file_cleared/back_to_upload: retain never survives past the moment its
  // own precondition stops holding.
  useEffect(() => {
    if (retain && !retainOffered) {
      onRetainChange(false);
    }
  }, [retain, retainOffered, onRetainChange]);

  const busy = uploadPhase !== "idle";
  const canSubmit = file !== null && industry !== "" && !busy;

  // The bay's own "still working" reading for the whole upload+extract
  // duration (two sequential async legs behind one `busy` boolean — see
  // analyze-flow.tsx's handleUploadSubmit) — previously the ONLY signal
  // was the submit button's own text swapping to "Uploading…"/
  // "Extracting…" and the step indicator's blink two components away;
  // the bay itself sat inert for however long extraction actually takes.
  // lib/motion's scanlineLoop already no-ops under reduced motion (see
  // its own doc comment) — statusText below remains the sole "still
  // working" signal there, unchanged.
  useEffect(() => {
    if (!busy || !bayRef.current) return;
    const tween = scanlineLoop(bayRef.current);
    return () => {
      tween?.kill();
      const line = bayRef.current?.querySelector<HTMLElement>("[data-scanline]");
      if (line) line.style.opacity = "";
    };
  }, [busy]);

  // File-accepted feedback: the row docking INTO the bay. Reuses
  // igniteSequence verbatim (a custom `data-docked` attribute rather than
  // its default `data-lit`, so this doesn't collide with SegmentDisplay/
  // LedBar's own segment-truth semantics) — the dot, filename, and
  // remove button light up one at a time, MOTION.step apart, via instant
  // .set() calls, never a tween ("every change is an instant segment
  // swap"). Keyed on the file's own identity (see the row's `key` prop
  // below) so selecting a DIFFERENT file re-plays the dock, not just the
  // first file→no-file transition. useLayoutEffect, not useEffect —
  // igniteSequence's own doc comment: its reset-to-off-then-cascade must
  // land before the browser's first paint, or the row (rendered
  // data-docked="true" by default, the SSR/no-JS baseline) flashes fully
  // lit for a frame before this ever runs.
  useLayoutEffect(() => {
    const el = fileRowRef.current;
    if (!el) return;
    const tl = igniteSequence(el, "[data-dock-segment]", { attribute: "data-docked" });
    return () => {
      tl?.kill();
    };
  }, [file?.name, file?.size, file?.lastModified]);

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

      {displayError && <ErrorBanner error={displayError} hintT={hintT} ocrEnabled={ocrEnabled} />}

      {/* The docking bay: an empty bezel awaiting media. Idle = a plain
       * instrument slot (solid 1px border, ghost-cell perforation texture
       * inside — "unlit segments are designed too" extended to an empty
       * bay). Drag = teal edge lighting, real Brand Teal rather than the
       * pale accent wash (The Accent-Surface Trap). Busy (upload+extract
       * in flight) = a dimmer, steady teal edge plus a looping scanline
       * (lib/motion's scanlineLoop) sweeping the bay — the pending state
       * for an operation with no single value to blink, distinct from
       * both idle and the full-intensity drag glow so the three read as
       * three different instrument states, not one. */}
      <div
        ref={bayRef}
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={(event) => {
          // dragleave fires on this element even when the pointer only
          // crossed onto a CHILD inside the same bay (the label text, the
          // browse button) — relatedTarget is where the pointer landed;
          // only treat this as a real exit once that's OUTSIDE the bay
          // entirely, or the edge lighting flickers on every child
          // boundary crossing while genuinely still hovering the drop
          // target (relatedTarget is null for a drag from outside the
          // browser window — Node-checked below, and null safely reaches
          // the real setDragging(false) either way).
          if (
            event.relatedTarget instanceof Node &&
            event.currentTarget.contains(event.relatedTarget)
          ) {
            return;
          }
          setDragging(false);
        }}
        onDrop={handleDrop}
        className={cn(
          "relative ghost-cell-texture border bg-panel p-10 text-center transition-colors duration-150",
          dragging
            ? "border-brand shadow-[0_0_0_1px_var(--accent),0_0_24px_2px_color-mix(in_oklch,var(--accent)_35%,transparent)]"
            : busy
              ? "border-brand/50"
              : "border-line",
        )}
      >
        {busy && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
            <span
              data-scanline
              className="absolute inset-y-0 left-0 w-full opacity-0 bg-[linear-gradient(90deg,transparent,var(--accent)_45%,var(--accent)_55%,transparent)]"
            />
          </div>
        )}
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
        // The file docking INTO the bay: a boot-grammar settle, not a
        // fade-in — the dot/filename/button light up one at a time via
        // igniteSequence's instant .set() cascade (the effect above,
        // scoped to this ref). Keyed on the file's own identity so
        // swapping in a DIFFERENT file (remove, pick another) re-plays
        // the dock rather than silently updating an already-lit row.
        <div
          key={`${file.name}-${file.size}-${file.lastModified}`}
          ref={fileRowRef}
          className="flex items-center justify-between border border-line bg-panel px-3 py-2 font-mono text-sm text-ink"
        >
          <span className="flex items-center gap-2">
            <span
              data-dock-segment
              data-docked="true"
              aria-hidden="true"
              className="inline-block size-1.5 shrink-0 rounded-full bg-brand shadow-[0_0_4px_1px_var(--accent)]"
            />
            <span data-dock-segment data-docked="true">
              {t("selectedFile", { name: file.name })}
            </span>
          </span>
          <button
            type="button"
            data-dock-segment
            data-docked="true"
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
                {localizedIndustryName(ind.name, ind.name_en, locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-ink-muted">{t("industryHint")}</p>
      </div>

      {/* Opt-in document retention (P5.T7) — visible ONLY when signed in
       * AND the server actually offers retention (P5.T8's vaultEnabled
       * capability signal: without this second condition, a signed-in
       * user in the default vault-disabled configuration could tick the
       * box and 503 the whole upload — see analyze-flow.tsx for where
       * vaultEnabled is fetched). Default off either way, matching the
       * product's privacy default — see PRODUCT.md. Same instrument switch
       * grammar as DocumentControls' `audited` toggle: a visually-hidden
       * native checkbox driving a bezelled track + LED thumb via the peer
       * pattern, so behavior and screen-reader semantics stay on the real
       * control while the visible focus ring lands on its decorative
       * sibling. */}
      {retainOffered && (
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
