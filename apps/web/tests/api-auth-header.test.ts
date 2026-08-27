import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAnalysis, setTokenProvider, uploadFile } from "@/lib/api";

// lib/api.ts's tokenProvider registration — the seam components/
// auth-bootstrap.tsx uses to attach a Better Auth-backed API token, kept
// deliberately framework-agnostic here (a plain function, no React/Better
// Auth imports) so this suite mocks nothing but the provider itself.
function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

describe("lib/api.ts — token provider bridge", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, {})));
  });

  afterEach(() => {
    setTokenProvider(null);
    vi.unstubAllGlobals();
  });

  it("attaches Authorization: Bearer <token> when a provider is registered and returns a token", async () => {
    setTokenProvider(async () => "signed.jwt.token");

    await getAnalysis("an_1");

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer signed.jwt.token");
  });

  it("sends no Authorization header at all when no provider is registered (the pre-existing anonymous path, untouched)", async () => {
    await getAnalysis("an_1");

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.has("Authorization")).toBe(false);
  });

  it("sends no Authorization header when the provider resolves to null (anonymous session, e.g. signed out)", async () => {
    setTokenProvider(async () => null);

    await getAnalysis("an_1");

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.has("Authorization")).toBe(false);
  });

  it("a provider that throws degrades to anonymous rather than failing the request", async () => {
    setTokenProvider(async () => {
      throw new Error("network hiccup fetching the token");
    });

    await expect(getAnalysis("an_1")).resolves.toEqual({});
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.has("Authorization")).toBe(false);
  });

  it("attaches the header on a multipart upload without disturbing the browser's own multipart Content-Type", async () => {
    setTokenProvider(async () => "signed.jwt.token");

    await uploadFile(new File(["data"], "report.csv"));

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer signed.jwt.token");
    // jsdom's fetch/Headers/FormData don't auto-derive a multipart boundary
    // the way a real browser does, so this only asserts what this module
    // controls: it must not have set an explicit Content-Type of its own
    // that would fight the runtime's own multipart header.
    expect(headers.has("Content-Type")).toBe(false);
  });
});
