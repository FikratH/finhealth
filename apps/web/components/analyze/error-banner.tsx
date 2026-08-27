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
export function ErrorBanner({ error, hintT }: ErrorBannerProps) {
  const t = useTranslations();
  const message = isTranslationKey(error.message) ? t(error.message) : error.message;
  const hintKey = errorHintKey(error.status);
  const hint = hintKey && hintT ? hintT(hintKey) : null;

  return (
    <div role="alert" className="border border-critical bg-paper px-4 py-3 text-sm text-critical">
      <p>{message}</p>
      {hint && <p className="mt-1 text-ink-muted">{hint}</p>}
    </div>
  );
}
