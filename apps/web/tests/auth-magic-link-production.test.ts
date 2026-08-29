// @vitest-environment node
//
// Fix round 1 (security ruling): without a real transport configured,
// production mode must fail the magic-link send instead of logging a live,
// single-use sign-in URL to server logs/aggregators — see lib/auth.ts's own
// comment on `sendMagicLink`. Fix round 2 adds the real transport
// (lib/resend.ts, unit-tested in isolation in tests/resend.test.ts) — this
// file covers the integration: which branch lib/auth.ts's `sendMagicLink`
// takes in production, and that every branch keeps the link out of logs.
// Node environment for the same reason as tests/auth-token-route.test.ts (a
// real Better Auth instance, no DOM).
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.BETTER_AUTH_DB_PATH = ":memory:";
process.env.BETTER_AUTH_SECRET = "test-only-better-auth-secret-32-characters-minimum";
process.env.BETTER_AUTH_URL = "http://localhost:3100";
delete process.env.RESEND_API_KEY;

const { auth, authReady } = await import("@/lib/auth");

// Same fetch-mock shape as tests/api-auth-header.test.ts.
function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => body,
  } as unknown as Response;
}

describe("magic-link transport selection in production (fix rounds 1 and 2)", () => {
  beforeAll(async () => {
    await authReady();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    // vi.stubEnv, not a direct `process.env.NODE_ENV =` assignment — the
    // installed @types/node marks NODE_ENV read-only, which `tsc`/`next
    // build`'s typecheck step enforces (a real build-breaking error hit
    // while writing this test). stubEnv sidesteps it and self-documents
    // the restore.
    vi.unstubAllEnvs();
  });

  it("rejects the send and logs nothing when RESEND_API_KEY is unset in production", async () => {
    // lib/auth.ts's NODE_ENV and RESEND_API_KEY checks are both inside the
    // sendMagicLink callback, read lazily at send time — not at
    // module-eval time — so stubbing/asserting them here, right before the
    // call that exercises it, is sufficient.
    vi.stubEnv("NODE_ENV", "production");
    expect(process.env.RESEND_API_KEY).toBeUndefined();

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      auth.api.signInMagicLink({
        body: { email: "prod-user-unconfigured@example.com" },
        headers: new Headers(),
      }),
    ).rejects.toThrow();

    // The one thing this fix exists to prevent: a live sign-in URL landing
    // in production stdout/log aggregators. Better Auth's own onError DOES
    // console.error the thrown Error — assert that whatever it prints never
    // carries a URL, at the same level the Resend-path tests check.
    expect(logSpy).not.toHaveBeenCalled();
    for (const call of errorSpy.mock.calls) {
      expect(call.map(String).join(" ")).not.toMatch(/https?:\/\//);
    }
  });

  it("sends via Resend and logs nothing when RESEND_API_KEY is set in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "test-resend-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { id: "email_123" })));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      auth.api.signInMagicLink({
        body: { email: "prod-user-resend@example.com" },
        headers: new Headers(),
      }),
    ).resolves.toEqual({ status: true });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const headers = new Headers(init?.headers as HeadersInit);
    expect(headers.get("Authorization")).toBe("Bearer test-resend-key");
    // Same invariant as the unconfigured branch above: nothing link-bearing
    // ever reaches the console, whichever transport handled the send.
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("fails closed with nothing link-bearing logged when Resend itself errors (non-2xx)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "test-resend-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(422, { message: "invalid request" })),
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      auth.api.signInMagicLink({
        body: { email: "prod-user-resend-fail@example.com" },
        headers: new Headers(),
      }),
    ).rejects.toThrow();

    expect(logSpy).not.toHaveBeenCalled();
    // The failure IS logged (status code, for debugging) but nothing in any
    // console.error call ever contains a URL — the request body Resend was
    // sent, which carries the magic link, must never round-trip into logs.
    expect(errorSpy).toHaveBeenCalled();
    for (const call of errorSpy.mock.calls) {
      expect(call.map(String).join(" ")).not.toMatch(/https?:\/\//);
    }
  });
});
