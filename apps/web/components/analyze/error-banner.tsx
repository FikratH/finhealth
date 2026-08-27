import { useTranslations } from "next-intl";
import { errorHintKey, isTranslationKey } from "@/lib/analyze-errors";
import type { AnalyzeError } from "@/lib/analyze-reducer";

export interface ErrorBannerProps {
  error: AnalyzeError;
  /** Translator scoped to the calling step's `hints` namespace
   * (`Analyze.upload.hints`) — 413/415/422 show an extra next-step hint
   * alongside the backend's already-human RU detail. */
  hintT?: (key: string) => string;
}

// Every ApiError renders as a human message: the backend's RU detail passes
// through verbatim (it's already user-grade — see lib/api.ts), and only the
// handful of client-only fallback cases (timeout, network, malformed body)
// go through a translation key.
//
// Re-skinned as a red annunciator line — never a toast: the same
// glyph-plus-glow discipline as AnnunciatorCell/the warnings block above
// the verify table, sitting inline in the document rather than floating
// over it. role="alert" and the message text are unchanged, so a
// screen-reader announcement is identical to before this re-skin.
export function ErrorBanner({ error, hintT }: ErrorBannerProps) {
  const t = useTranslations();
  const message = isTranslationKey(error.message) ? t(error.message) : error.message;
  const hintKey = errorHintKey(error.status);
  const hint = hintKey && hintT ? hintT(hintKey) : null;

  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 border border-critical bg-panel px-4 py-3 text-sm text-critical"
    >
      <span
        aria-hidden="true"
        className="font-mono text-base leading-none [text-shadow:0_0_0.3em_var(--critical)]"
      >
        ✕
      </span>
      <div>
        <p>{message}</p>
        {hint && <p className="mt-1 text-ink-muted">{hint}</p>}
      </div>
    </div>
  );
}
