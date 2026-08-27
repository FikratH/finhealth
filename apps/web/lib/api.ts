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
  ExtractionResult,
  IndustriesResponse,
  UploadedDocument,
} from "./api-types";

const UPLOAD_EXTRACT_TIMEOUT_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
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

function fallbackKey(status: number): string {
  return STATUS_FALLBACK_KEYS[status] ?? "errors.unknown";
}

/** Reads `{detail: string}` off an error response body, if present. */
async function readDetail(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "detail" in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === "string" && detail.length > 0) {
        return detail;
      }
    }
  } catch {
    // Non-JSON or empty body — fall through to the status-keyed fallback.
  }
  return undefined;
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
    response = await fetch(path, { ...init, signal: controller.signal });
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
    throw new ApiError(response.status, detail ?? fallbackKey(response.status));
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

/** POST /api/upload — multipart file upload. 400 empty file, 413 too large
 * (>15MB, or an Excel archive whose decompressed size exceeds 200MB), 415
 * unrecognized format. */
export function uploadFile(file: File): Promise<UploadedDocument> {
  const formData = new FormData();
  formData.append("file", file);
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

/** POST /api/analyze — 400 unknown industry id. */
export function analyze(req: AnalysisRequest): Promise<AnalysisResult> {
  return requestJson<AnalysisResult>("/api/analyze", "POST", req, DEFAULT_TIMEOUT_MS);
}

/** GET /api/analysis/{id} — the stored AnalysisResult payload. 404 unknown id. */
export function getAnalysis(id: string): Promise<AnalysisResult> {
  return request<AnalysisResult>(
    `/api/analysis/${encodeURIComponent(id)}`,
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

/** DELETE /api/analysis/{id} — 404 unknown id. */
export function deleteAnalysis(id: string): Promise<DeleteAnalysisResponse> {
  return request<DeleteAnalysisResponse>(
    `/api/analysis/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    DEFAULT_TIMEOUT_MS,
  );
}
