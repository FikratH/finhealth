// Server-only counterpart to lib/api.ts's getAnalysis(). That file's client
// deliberately never reads `process.env` and only ever fetches relative
// "/api/..." paths, which next.config.ts rewrites to API_URL — but that
// rewrite is a browser-facing route table. A Server Component's fetch()
// runs in Node with no implicit origin to resolve a relative URL against,
// so it can't ride the same rewrite. This is the one place server-side
// code reads API_URL directly to reach the API by its real address.
//
// Import this only from Server Components — never from a "use client" file.
import { cache } from "react";
import { ApiError, fallbackKey, readDetail } from "./api";
import type { AnalysisResult } from "./api-types";

const DEFAULT_TIMEOUT_MS = 15_000;

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/** GET /api/analysis/{id} — the stored AnalysisResult payload, fetched
 * directly from API_URL. 404 unknown id (the results page turns this into
 * notFound()).
 *
 * Wrapped in React's `cache()` rather than relying on Next's automatic
 * fetch memoization: this function passes its own per-call `AbortController`
 * signal to `fetch`, which Next's docs name as the explicit opt-out from
 * that memoization ("To opt out, pass an AbortController signal to fetch" —
 * node_modules/next/dist/docs/01-app/03-api-reference/04-functions/fetch.md).
 * Without `cache()` here, the results route's `generateMetadata` and its
 * page body each independently re-fetch the same analysis. `cache()`
 * memoizes by argument (`id`) for the lifetime of one server render pass,
 * so both call sites share a single request; the timeout/abort behavior
 * stays inside the cached function so every caller still gets it. */
export const getAnalysisServer = cache(async (id: string): Promise<AnalysisResult> => {
  const apiUrl = process.env.API_URL ?? "http://localhost:8000";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${apiUrl}/api/analysis/${encodeURIComponent(id)}`, {
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    if (isAbortError(err)) {
      throw new ApiError(0, "timeout");
    }
    throw new ApiError(0, "errors.network");
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = await readDetail(response);
    throw new ApiError(response.status, detail ?? fallbackKey(response.status));
  }

  try {
    return (await response.json()) as AnalysisResult;
  } catch {
    throw new ApiError(response.status, "errors.parseFailure");
  }
});
