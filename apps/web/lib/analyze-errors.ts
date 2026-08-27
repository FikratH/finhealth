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

/** 413/415/422 carry an already-human backend detail; these keys point at
 * an additional next-step hint shown alongside it (relative to the
 * `Analyze.upload.hints` message namespace). */
const HINT_KEY_BY_STATUS: Partial<Record<number, string>> = {
  413: "payloadTooLarge",
  415: "unsupportedType",
  422: "unprocessable",
};

export function errorHintKey(status: number): string | null {
  return HINT_KEY_BY_STATUS[status] ?? null;
}
