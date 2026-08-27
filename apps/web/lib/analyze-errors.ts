// Turns an `ApiError` (see lib/api.ts) into an `AnalyzeError` for the
// reducer, and tells apart the two shapes `ApiError.message` can take: a RU
// detail string straight from the backend (already user-grade — render
// verbatim), or a translation key to look up in messages/{ru,en}.json.
import { ApiError } from "./api";
import type { AnalyzeError } from "./analyze-reducer";

export function toAnalyzeError(err: unknown, networkFallbackKey: string): AnalyzeError {
  if (err instanceof ApiError) {
    return { message: normalizeErrorKey(err.message), status: err.status, code: err.code };
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
 * `Analyze.upload.hints` message namespace). Keyed by status alone: none
 * of these three codes is shared with any other error path today, so
 * status is unambiguous for them. */
const HINT_KEY_BY_STATUS: Partial<Record<number, string>> = {
  413: "payloadTooLarge",
  415: "unsupportedType",
  422: "unprocessable",
};

/** The vault-unavailable hint (P5.T8 defense-in-depth: UploadStep already
 * hides the retain checkbox unless the server's `vault_enabled` signal
 * says yes — see analyze-flow.tsx — but a race, the flag flipping
 * server-side between that check and this submit, can still land here) is
 * kept OUT of HINT_KEY_BY_STATUS deliberately (P5 close wave F3): 503 is
 * not a code the vault path owns exclusively — an infra/proxy 503 while
 * the API itself is down, or a future endpoint's unrelated 503, would
 * otherwise get the same "uncheck the retention box" advice, which is
 * simply wrong when no checkbox was ever shown. Gated on the backend's
 * own `code:"vault_unavailable"` instead (carried on `ApiError`/
 * `AnalyzeError` since the P5 close wave — see their own comments),
 * which only this exact failure ever sets. */
export function errorHintKey(error: Pick<AnalyzeError, "status" | "code">): string | null {
  if (error.status === 503) {
    return error.code === "vault_unavailable" ? "vaultUnavailable" : null;
  }
  return HINT_KEY_BY_STATUS[error.status] ?? null;
}
