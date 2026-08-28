import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAnalysisServer } from "@/lib/api-server";
import { ApiError } from "@/lib/api";
import type { AnalysisResult } from "@/lib/api-types";

// getAnalysisServer is wrapped in React's cache() so a results-route render
// pass (generateMetadata + the page body, both calling it with the same id)
// shares one underlying fetch instead of firing it twice — see that
// function's own doc comment in lib/api-server.ts for why Next's automatic
// fetch memoization doesn't already cover this (a per-call AbortController
// signal is the documented opt-out).
//
// That dedup is NOT exercised here. React's cache() only memoizes inside an
// active React "owner" — the AsyncLocalStorage-scoped dispatcher Next.js's
// server runtime installs for the duration of one real request/render pass.
// Verified directly: calling a cache()-wrapped function twice from plain
// Node/Vitest (jsdom, no react-server condition, no request-scoped
// dispatcher — see vitest.config.mts) executes the wrapped function twice,
// with two distinct return values — cache() is an inert pass-through
// outside that context. A unit test asserting "one fetch call" here would
// therefore either be vacuously true for the wrong reason (fetch itself
// happens to be called once for unrelated reasons) or fail in a way that
// says nothing about the real dedup path. The dedup is exercised for real
// by every request Playwright's e2e suite makes against a production
// `next build`; correctness of the cache() wiring itself is otherwise a
// code-review concern (import { cache } from "react"; export const
// getAnalysisServer = cache(async (id) => {...})).
//
// What IS covered below: the wrapped function's own request/error-mapping
// behavior is unchanged — same success path, same ApiError normalization —
// now that it's a cache()-wrapped arrow function instead of a plain
// `async function` declaration.

function analysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    analysis_id: "abc123",
    created_at: "2026-08-27T00:00:00Z",
    industry: "manufacturing",
    industry_name: "Производство",
    scale: "thousands",
    overall_score: 85.1,
    health_label: "Сильное состояние",
    category_scores: [],
    ratios: [],
    strengths: [],
    risks: [],
    recommendations: [],
    warnings: [],
    confidence: {
      total: 90,
      data_completeness: 90,
      extraction_confidence: 90,
      manual_corrections: 0,
      has_previous_period: true,
      has_industry_benchmarks: true,
      audited: false,
      notes: [],
    },
    missing_metrics: [],
    disclaimer: "",
    ...overrides,
  };
}

describe("getAnalysisServer", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("API_URL", "http://api.test");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns the parsed AnalysisResult on a 200 response", async () => {
    const payload = analysis({ analysis_id: "abc123" });
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 }),
    );

    const result = await getAnalysisServer("abc123");
    expect(result).toEqual(payload);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://api.test/api/analysis/abc123",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("normalizes a 404 into an ApiError carrying the backend's detail message", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Запрошенные данные не найдены." }), {
        status: 404,
      }),
    );

    await expect(getAnalysisServer("missing")).rejects.toMatchObject({
      status: 404,
      message: "Запрошенные данные не найдены.",
    });
  });

  it("maps a network failure to ApiError(0, 'errors.network')", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));

    const err = await getAnalysisServer("x").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 0, message: "errors.network" });
  });

  // P7.T2: an incoming X-Request-ID, when the caller has one, rides along
  // on this fetch so both legs of one page load trace under the same id
  // (see this function's own doc comment for why it's never GENERATED
  // here — only forwarded when already present).
  it("forwards a caller-supplied requestId as the X-Request-ID header", async () => {
    const payload = analysis({ analysis_id: "abc123" });
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 }),
    );

    await getAnalysisServer("abc123", "trace-me-123");
    expect(global.fetch).toHaveBeenCalledWith(
      "http://api.test/api/analysis/abc123",
      expect.objectContaining({ headers: { "X-Request-ID": "trace-me-123" } }),
    );
  });

  it("sends no X-Request-ID header when no requestId is given", async () => {
    const payload = analysis({ analysis_id: "abc123" });
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 }),
    );

    await getAnalysisServer("abc123");
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers).toBeUndefined();
  });
});
