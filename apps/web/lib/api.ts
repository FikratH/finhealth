// Thin fetch client for the FinHealth API. Every method hits a relative
// "/api/..." path — `next.config.ts` rewrites those to `API_URL` server-side,
// so this file never reads `process.env` itself and works unmodified in any
// deployment.
//
// Every non-2xx response is normalized into an `ApiError`. The backend
// (apps/api/app/main.py) raises `HTTPException(detail=<RU string>)` for
// every error case it produces, so `ApiError.message` is that RU string
// whenever the response body carries one. When it doesn't (a malformed
// response, or an error path the backend didn't intend to be user-facing),
// `message` falls back to a stable translation key — not English prose —
// so the caller can look it up in messages/{ru,en}.json rather than leak
// an untranslated string into the UI.
import type {
  AnalysisRequest,
  AnalysisResult,
  DeleteAnalysisResponse,
  DeleteDocumentResponse,
  ExtractionResult,
  HealthResponse,
  IndustriesResponse,
  IndustryBenchmarksResponse,
  MyAnalysesResponse,
  MyDocumentsResponse,
  NarrativeResult,
  UploadedDocument,
  WaitlistResponse,
} from "./api-types";

const UPLOAD_EXTRACT_TIMEOUT_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 15_000;
// The narrative endpoint's OWN generation call (not the cached-retry path,
// which returns instantly — see main.py's `if cached and not refresh:
// return cached`) can run close to the API's EXTRACT_TIMEOUT_SECONDS-style
// budget for a slow LLM response; 15s was tight enough that a founder's
// real click timed out client-side while the server call was still
// completing normally. 90s matches the upload/extract tier's own budget
// for "an operation that can genuinely take a while," not the 15s default
// every small JSON call gets.
const NARRATIVE_TIMEOUT_MS = 90_000;

/** Registered by a small client bootstrap (components/auth-bootstrap.tsx)
 * once a Better Auth session exists — this module otherwise knows nothing
 * about Better Auth, sessions, or React, keeping it usable from any caller
 * (including lib/api-server.ts's sibling, and tests with no provider set
 * at all). `null`/a rejected promise/a resolved `null` all mean the same
 * thing: send this request anonymously, exactly as before this feature. */
type TokenProvider = () => Promise<string | null>;
let tokenProvider: TokenProvider | null = null;

export function setTokenProvider(provider: TokenProvider | null): void {
  tokenProvider = provider;
}

async function withAuthHeader(headers: HeadersInit | undefined): Promise<HeadersInit | undefined> {
  if (!tokenProvider) {
    return headers;
  }
  let token: string | null;
  try {
    token = await tokenProvider();
  } catch {
    return headers;
  }
  if (!token) {
    return headers;
  }
  const merged = new Headers(headers);
  merged.set("Authorization", `Bearer ${token}`);
  return merged;
}

export class ApiError extends Error {
  readonly status: number;
  /** The backend's stable machine-readable error code (e.g.
   * "vault_unavailable", "auth_required"), present only when the response
   * carried the `{detail: {code, message}}` shape — undefined for the
   * plain-string `{detail: "<RU string>"}` shape (400/404/413/415/422's
   * bare RU strings) and for client-only errors (timeout/network/parse
   * failure). Lets a caller distinguish *which* error produced a given
   * status rather than assuming every occurrence of that status means the
   * same thing — see lib/analyze-errors.ts's errorHintKey, the one
   * consumer that needs this (P5 close wave F3): a bare 503 could be the
   * vault being unavailable OR an unrelated infra/proxy 503, and only the
   * code tells them apart. */
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** Fallback translation keys, used only when a non-2xx response has no
 * usable `detail` string. Every status the API contract documents
 * (400/404/413/415/422) normally does carry one — see main.py — so these
 * are a defensive backstop, not the common path. */
const STATUS_FALLBACK_KEYS: Partial<Record<number, string>> = {
  400: "errors.badRequest",
  404: "errors.notFound",
  413: "errors.payloadTooLarge",
  415: "errors.unsupportedType",
  422: "errors.unprocessable",
};

/** Exported so lib/api-server.ts's server-only fetch (which can't route
 * through this file's relative "/api/..." paths — see that file's header
 * comment) can normalize errors identically instead of duplicating this
 * logic. */
export function fallbackKey(status: number): string {
  return STATUS_FALLBACK_KEYS[status] ?? "errors.unknown";
}

/** One error response body's parsed shape: `message` is what
 * ApiError.message ultimately carries; `code` (only present for the
 * `{detail: {code, message}}` shape) is what ApiError.code carries. */
export interface ParsedErrorDetail {
  message?: string;
  code?: string;
}

/** Reads a usable message (and code, when present) off an error response
 * body. Most endpoints send `{detail: "<RU string>"}` (message only, no
 * code); several — narrative, auth, the vault paths — send
 * `{detail: {code, message}}` instead so callers can branch on `code`,
 * not just parse RU prose. `response.json()` can only be consumed once,
 * so this is the single parse both `message` and `code` come from —
 * callers must not call this twice on the same Response. */
export async function readDetail(response: Response): Promise<ParsedErrorDetail> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "detail" in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === "string" && detail.length > 0) {
        return { message: detail };
      }
      if (detail && typeof detail === "object") {
        const d = detail as { message?: unknown; code?: unknown };
        const message = typeof d.message === "string" && d.message.length > 0 ? d.message : undefined;
        const code = typeof d.code === "string" && d.code.length > 0 ? d.code : undefined;
        return { message, code };
      }
    }
  } catch {
    // Non-JSON or empty body — fall through to the status-keyed fallback.
  }
  return {};
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

async function request<T>(
  path: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    const headers = await withAuthHeader(init.headers);
    response = await fetch(path, { ...init, headers, signal: controller.signal });
  } catch (err) {
    if (isAbortError(err)) {
      throw new ApiError(0, "timeout");
    }
    // Network failure (offline, DNS, connection reset, ...) rather than a
    // response the server sent — no status code to report.
    throw new ApiError(0, "errors.network");
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = await readDetail(response);
    throw new ApiError(response.status, detail.message ?? fallbackKey(response.status), detail.code);
  }

  try {
    return (await response.json()) as T;
  } catch {
    // A 2xx response with a malformed/truncated body — still the server's
    // fault, but there's no `detail` to read (readDetail() only ever runs
    // on the error branch above). Same ApiError contract either way, so
    // callers never have to catch a bare SyntaxError alongside ApiError.
    throw new ApiError(response.status, "errors.parseFailure");
  }
}

function requestJson<T>(
  path: string,
  method: string,
  body: unknown,
  timeoutMs: number,
): Promise<T> {
  return request<T>(
    path,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    timeoutMs,
  );
}

/** GET /api/health — `vault_enabled` (P5.T8, additive) tells the caller
 * whether the server currently accepts `retain=1` on POST /api/upload,
 * before ever offering the checkbox for it. Cheap, unauthenticated, safe
 * to fetch alongside getIndustries() on the analyze flow's mount. */
export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>(
    "/api/health",
    { method: "GET" },
    DEFAULT_TIMEOUT_MS,
  );
}

/** POST /api/upload — multipart file upload. 400 empty file, 413 too large
 * (>15MB, or an Excel archive whose decompressed size exceeds 200MB), 415
 * unrecognized format. `retain` (P5.T7's opt-in document vault, default
 * false) requires a signed-in user — 401 otherwise — and the server-side
 * vault feature to be turned on — 503 ({code:"vault_unavailable"})
 * otherwise; when accepted, POST /api/extract moves the document into the
 * vault on success instead of deleting it. */
export function uploadFile(file: File, retain = false): Promise<UploadedDocument> {
  const formData = new FormData();
  formData.append("file", file);
  if (retain) {
    formData.append("retain", "1");
  }
  return request<UploadedDocument>(
    "/api/upload",
    { method: "POST", body: formData },
    UPLOAD_EXTRACT_TIMEOUT_MS,
  );
}

/** POST /api/extract — 404 the upload id is gone or unknown, 422 the file
 * couldn't be parsed (scanned PDF, corrupt file, or extraction timeout). */
export function extract(uploadId: string): Promise<ExtractionResult> {
  return requestJson<ExtractionResult>(
    "/api/extract",
    "POST",
    { upload_id: uploadId },
    UPLOAD_EXTRACT_TIMEOUT_MS,
  );
}

/** POST /api/analyze — 400 unknown industry id. `locale` (additive,
 * founder feedback R1, optional): forwarded as `?locale=` on the request
 * URL (not the JSON body) — affects only the shape of THIS response, not
 * what gets stored; see apps/api/app/services/i18n.py's module docstring.
 * Omitted, the API's own `ru` default applies, matching every pre-existing
 * caller unmodified. */
export function analyze(req: AnalysisRequest, locale?: string): Promise<AnalysisResult> {
  const query = locale ? `?locale=${encodeURIComponent(locale)}` : "";
  return requestJson<AnalysisResult>(`/api/analyze${query}`, "POST", req, DEFAULT_TIMEOUT_MS);
}

/** GET /api/analysis/{id} — the stored AnalysisResult payload. 404 unknown id.
 * `locale` (additive, founder feedback R1, optional): forwarded as
 * `?locale=` — omitted, the API's own `ru` default applies, so every
 * existing caller keeps working unmodified. The results route itself
 * fetches server-side (lib/api-server.ts's getAnalysisServer) rather than
 * through this client function; this parameter exists for any future
 * client-side caller (e.g. a locale-switch re-fetch without a full page
 * navigation) to stay consistent with the server path. */
export function getAnalysis(id: string, locale?: string): Promise<AnalysisResult> {
  const query = locale ? `?locale=${encodeURIComponent(locale)}` : "";
  return request<AnalysisResult>(
    `/api/analysis/${encodeURIComponent(id)}${query}`,
    { method: "GET" },
    DEFAULT_TIMEOUT_MS,
  );
}

/** GET /api/industries. */
export function getIndustries(): Promise<IndustriesResponse> {
  return request<IndustriesResponse>(
    "/api/industries",
    { method: "GET" },
    DEFAULT_TIMEOUT_MS,
  );
}

/** GET /api/industries/{id}/benchmarks — 404 unknown industry id. Not
 * called by lib/simulator (see that module's header comment): a persisted
 * AnalysisResult already carries every ratio's own benchmark plus each
 * category's weight, so the what-if simulator never needs this round-trip.
 * Kept as a general-purpose client addition for future use. */
export function getIndustryBenchmarks(industryId: string): Promise<IndustryBenchmarksResponse> {
  return request<IndustryBenchmarksResponse>(
    `/api/industries/${encodeURIComponent(industryId)}/benchmarks`,
    { method: "GET" },
    DEFAULT_TIMEOUT_MS,
  );
}

/** DELETE /api/analysis/{id} — 404 unknown id. */
export function deleteAnalysis(id: string): Promise<DeleteAnalysisResponse> {
  return request<DeleteAnalysisResponse>(
    `/api/analysis/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    DEFAULT_TIMEOUT_MS,
  );
}

/** GET /api/my/analyses — the signed-in user's own analyses, newest
 * first, capped at 50. A summary projection (id, created_at,
 * industry_name, overall_score, health_label) — never the full
 * `AnalysisResult` payload. 401 (`auth_required`) when signed out.
 * `locale` (additive, founder feedback R1 fix-round F2, optional):
 * forwarded as `?locale=` — each row's `health_label` (free-text RU
 * prose, unlike `industry_name`/`industry_name_en`'s already-dual-field
 * shape) is rendered server-side in the requested locale. Omitted, the
 * API's own `ru` default applies. */
export function getMyAnalyses(locale?: string): Promise<MyAnalysesResponse> {
  const query = locale ? `?locale=${encodeURIComponent(locale)}` : "";
  return request<MyAnalysesResponse>(
    `/api/my/analyses${query}`,
    { method: "GET" },
    DEFAULT_TIMEOUT_MS,
  );
}

/** DELETE /api/my/analyses/{id} — 401 signed out. 404 for BOTH an unknown
 * id and an id owned by a different user: the response never
 * distinguishes the two, so a caller can't probe for other users'
 * analysis ids. */
export function deleteMyAnalysis(id: string): Promise<DeleteAnalysisResponse> {
  return request<DeleteAnalysisResponse>(
    `/api/my/analyses/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    DEFAULT_TIMEOUT_MS,
  );
}

/** GET /api/my/documents — the signed-in user's own retained documents
 * (P5.T7 opt-in vault), newest first. Metadata only (doc_id, filename,
 * kind, size_bytes, created_at) — never the raw bytes. 401 (`auth_required`)
 * when signed out. */
export function getMyDocuments(): Promise<MyDocumentsResponse> {
  return request<MyDocumentsResponse>(
    "/api/my/documents",
    { method: "GET" },
    DEFAULT_TIMEOUT_MS,
  );
}

/** DELETE /api/my/documents/{id} — 401 signed out. 404 for BOTH an unknown
 * id and an id owned by a different user, same never-distinguish idiom as
 * deleteMyAnalysis. */
export function deleteMyDocument(id: string): Promise<DeleteDocumentResponse> {
  return request<DeleteDocumentResponse>(
    `/api/my/documents/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    DEFAULT_TIMEOUT_MS,
  );
}

/** Parses a `Content-Disposition` header's filename, preferring the RFC
 * 5987 `filename*=UTF-8''<percent-encoded>` parameter over the plain
 * ASCII-only `filename=` fallback when both are present — the backend's
 * download endpoint (app/routers/my.py) always sends both together, so a
 * name with non-ASCII characters (Cyrillic RSBU statements routinely have
 * one) round-trips exactly rather than through the ASCII-lossy fallback.
 * Returns `undefined` when the header is absent or neither parameter
 * parses cleanly, so the caller can fall back to a name of its own
 * (downloadMyDocument's `fallbackFilename`) rather than crash. Exported
 * standalone (not inlined into downloadMyDocument) so it can be unit-tested
 * directly against header strings, without mocking fetch/Blob/URL. */
export function parseContentDispositionFilename(header: string | null): string | undefined {
  if (!header) {
    return undefined;
  }
  const starMatch = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (starMatch) {
    try {
      const decoded = decodeURIComponent(starMatch[1].trim());
      if (decoded) {
        return decoded;
      }
    } catch {
      // Malformed percent-encoding — fall through to the plain filename=
      // parameter below rather than propagate a URIError.
    }
  }
  const plainMatch = /filename="?([^";]+)"?/i.exec(header);
  if (plainMatch) {
    const name = plainMatch[1].trim();
    if (name) {
      return name;
    }
  }
  return undefined;
}

/** GET /api/my/documents/{id}/download — returns the caller's own retained
 * document. Unlike every other function in this file, this bypasses
 * request<T>(): the response body is the raw file, not JSON, so it's
 * fetched directly (reusing withAuthHeader(), the same auth-header
 * attachment every other call gets) and handed to the browser as a
 * download via a transient object URL + a programmatic anchor click — the
 * standard "save a fetched blob" idiom, since a plain `<a href>` can't
 * carry an Authorization header. 401/404/503/429 all come back as the
 * usual `{detail}` JSON error body and are normalized into ApiError via
 * readDetail(), exactly like every other client here, so a caller only
 * ever catches one error type. `fallbackFilename` (typically the
 * MyDocumentSummary row's own `filename`) is used only if the response
 * somehow lacks a parseable Content-Disposition — the server always sends
 * one, so this is a defensive backstop, not the common path.
 *
 * The `request<T>()` bypass is only for the JSON-vs-file body shape — the
 * timeout convention is deliberately KEPT, not dropped along with it: this
 * uses the same `UPLOAD_EXTRACT_TIMEOUT_MS` (30s) budget as upload/extract,
 * the other two calls that move a whole document's worth of bytes, rather
 * than the 15s default every small JSON call gets. A caller (the download
 * button's own in-flight state — see my-documents-table.tsx) still needs a
 * bound on how long "downloading…" can last; without one, a hung fetch
 * would be invisible AND unrecoverable short of a page reload.
 *
 * Unlike `request<T>()`, the timer isn't cleared the moment headers arrive
 * — it stays armed through `response.blob()` too, so the 30s budget bounds
 * the whole transfer, not just the round-trip to the first byte. That's a
 * deliberate divergence from `request()`'s shape, not an oversight: a
 * multi-megabyte file (up to the 15MB upload cap) spends most of its time
 * in the body read, and the same `AbortSignal` that can cancel `fetch()`
 * itself also cancels an in-flight `response.blob()` call, throwing the
 * same `AbortError` — so one `catch` below handles both a stalled request
 * and a stalled transfer identically. */
export async function downloadMyDocument(id: string, fallbackFilename: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_EXTRACT_TIMEOUT_MS);

  try {
    const headers = await withAuthHeader(undefined);
    const response = await fetch(`/api/my/documents/${encodeURIComponent(id)}/download`, {
      headers,
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await readDetail(response);
      throw new ApiError(response.status, detail.message ?? fallbackKey(response.status), detail.code);
    }
    const blob = await response.blob();
    const filename = parseContentDispositionFilename(response.headers.get("Content-Disposition"))
      ?? fallbackFilename;
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Deferred, not immediate: revoking the object URL synchronously after
    // click() has been observed to cancel the download in some browsers
    // (Safari in particular) before they've finished reading the blob —
    // a macrotask delay lets the download actually start first.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  } catch (err) {
    // Already normalized by the !response.ok branch above — pass it
    // through as-is rather than let it fall into the network/timeout
    // catch-all below.
    if (err instanceof ApiError) {
      throw err;
    }
    if (isAbortError(err)) {
      throw new ApiError(0, "timeout");
    }
    // Network failure (offline, DNS, connection reset, a transfer that
    // dies mid-stream) — no status code to report, same convention
    // request()'s catch branch uses.
    throw new ApiError(0, "errors.network");
  } finally {
    clearTimeout(timer);
  }
}

/** POST /api/waitlist — Pro waitlist signup (P6.T6). Anonymous allowed;
 * 422 on a malformed email (surfaced as an ApiError the caller maps to a
 * validation message, same as any other endpoint). Always 200 otherwise —
 * `status: "already_joined"` on a duplicate email is a normal result, not
 * an ApiError, so the caller renders the same honest confirmation either
 * way rather than catching a "conflict" error that was never thrown. */
export function joinWaitlist(email: string, source?: string): Promise<WaitlistResponse> {
  return requestJson<WaitlistResponse>(
    "/api/waitlist",
    "POST",
    source ? { email, source } : { email },
    DEFAULT_TIMEOUT_MS,
  );
}

/** POST /api/analysis/{id}/narrative — 404 unknown id, 503
 * ({code:"narrative_unavailable"}) when no LLM key is configured
 * server-side, 502 ({code:"narrative_failed"}) on any provider/parse
 * failure. Idempotent: a second call without `refresh` returns the cached
 * narrative rather than calling the LLM again. */
export function generateNarrative(
  id: string,
  options: { refresh?: boolean } = {},
): Promise<NarrativeResult> {
  const query = options.refresh ? "?refresh=1" : "";
  return request<NarrativeResult>(
    `/api/analysis/${encodeURIComponent(id)}/narrative${query}`,
    { method: "POST" },
    NARRATIVE_TIMEOUT_MS,
  );
}
