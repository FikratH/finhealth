"use client";

import { useId, useRef, useState } from "react";
import type { DragEvent } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
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
  onFileSelected: (file: File) => void;
  onFileCleared: () => void;
  onIndustryChange: (industry: string) => void;
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
  onFileSelected,
  onFileCleared,
  onIndustryChange,
  onSubmit,
}: UploadStepProps) {
  const t = useTranslations("Analyze.upload");
  const hintT = useTranslations("Analyze.upload.hints");
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

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

      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "border border-dashed p-10 text-center transition-colors duration-150",
          dragging ? "border-accent bg-accent-surface" : "border-line",
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
        <p className="mt-1 text-sm text-ink-muted">{t("dropzoneHint")}</p>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {t("browseButton")}
        </Button>
      </div>

      {file && (
        <div className="flex items-center justify-between border border-line px-3 py-2 font-mono text-sm text-ink">
          <span>{t("selectedFile", { name: file.name })}</span>
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

      <div className="space-y-1.5">
        <label htmlFor={`${inputId}-industry`} className="block text-sm text-ink">
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

      <div>
        <Button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          aria-describedby={missingReason && !busy ? `${inputId}-submit-hint` : undefined}
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
