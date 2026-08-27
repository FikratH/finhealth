// Turns an `ApiError` (see lib/api.ts) into an `AnalyzeError` for the
// reducer, and tells apart the two shapes `ApiError.message` can take: a RU
// detail string straight from the backend (already user-grade — render
// verbatim), or a translation key to look up in messages/{ru,en}.json.
import { ApiError } from "./api";
import type { AnalyzeError } from "./analyze-reducer";

export function toAnalyzeError(err: unknown, networkFallbackKey: string): AnalyzeError {
  if (err instanceof ApiError) {
    return { message: normalizeErrorKey(err.message), status: err.status };
  }
  return { message: networkFallbackKey, status: 0 };
}

/** api.ts throws the bare literal `"timeout"` on an aborted request (not
 * `"errors.timeout"`) — normalize it here so every translation-key lookup
 * downstream can assume the `"errors."` prefix. */
export function normalizeErrorKey(message: string): string {
  return message === "timeout" ? "errors.timeout" : message;
}

export function isTranslationKey(message: string): boolean {
  return message.startsWith("errors.");
}

/** 413/415/422/503 carry an already-human backend detail; these keys point
 * at an additional next-step hint shown alongside it (relative to the
 * `Analyze.upload.hints` message namespace). 503 is P5.T8 defense-in-depth:
 * UploadStep already hides the retain checkbox unless the server's
 * `vault_enabled` capability signal says yes (see analyze-flow.tsx), but a
 * race — the flag flips server-side between that check and this submit —
 * can still land here, so the dead end gets a next-step hint instead of a
 * bare "unavailable" message. */
const HINT_KEY_BY_STATUS: Partial<Record<number, string>> = {
  413: "payloadTooLarge",
  415: "unsupportedType",
  422: "unprocessable",
  503: "vaultUnavailable",
};

export function errorHintKey(status: number): string | null {
  return HINT_KEY_BY_STATUS[status] ?? null;
}
