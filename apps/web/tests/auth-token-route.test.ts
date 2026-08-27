// @vitest-environment node
//
// Pure Node-side integration test — no React/DOM involved — and it must
// stay that way: under the suite's default jsdom environment, jose's own
// `instanceof Uint8Array` key check (node_modules/jose/dist/webapi/lib/key.js)
// fails against a Uint8Array minted via jsdom's VM-realm TextEncoder/Buffer,
// even though it's a real Uint8Array — a cross-realm artifact of the test
// environment, not a real bug in app/auth/token/route.ts (which runs in
// one realm in every real environment: dev, build, and production).
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { jwtVerify, decodeProtectedHeader } from "jose";

// Integration test for the web<->API bridge token — the "claims proof"
// half of P5.T3's report. Runs a real Better Auth instance (in-memory
// SQLite, set below via BETTER_AUTH_DB_PATH before the dynamic import —
// lib/auth.ts reads process.env at module-eval time, so these must land
// before that module is ever imported, same pattern as
// tests/site-header.test.tsx's own pre-import mocking) through the full
// magic-link handshake, then calls the actual route handler
// (app/auth/token/route.ts) and cryptographically verifies the token it
// mints — not a hand-rolled fixture standing in for the real thing.
process.env.BETTER_AUTH_DB_PATH = ":memory:";
process.env.BETTER_AUTH_SECRET = "test-only-better-auth-secret-32-characters-minimum";
process.env.AUTH_JWT_SECRET = "test-only-jwt-bridge-secret-shared-with-the-api";
// A direct auth.api.* call (no real incoming HTTP request) has no Host
// header to infer an origin from — magic-link URL generation needs a real
// baseURL. The real app leaves this unset and relies on request inference.
process.env.BETTER_AUTH_URL = "http://localhost:3100";

const TEST_EMAIL = "diagnostician@example.com";

const { auth, authReady } = await import("@/lib/auth");
const { GET: tokenRouteGET } = await import("@/app/auth/token/route");

/** Drives the real magic-link handshake end to end: triggers
 * `signInMagicLink` (which logs "MAGIC_LINK: <url>" via lib/auth.ts's own
 * dev-transport `sendMagicLink` — the exact code path production runs),
 * recovers the token from that console line, then verifies it — returning
 * the `Set-Cookie` session cookie a real browser would have received. */
async function signInAndGetSessionCookie(email: string): Promise<string> {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  let magicLinkLog: string | undefined;
  try {
    await auth.api.signInMagicLink({
      body: { email },
      headers: new Headers(),
    });
    // Read the recorded calls before restoring — mockRestore() clears
    // mock.calls along with un-patching the spy.
    magicLinkLog = logSpy.mock.calls
      .map((args) => String(args[0]))
      .find((line) => line.startsWith("MAGIC_LINK: "));
  } finally {
    logSpy.mockRestore();
  }
  expect(magicLinkLog, "sendMagicLink must have logged a MAGIC_LINK line").toBeDefined();

  const url = new URL(magicLinkLog!.slice("MAGIC_LINK: ".length).split(" (to: ")[0]);
  const token = url.searchParams.get("token");
  expect(token).toBeTruthy();

  const verifyResult = await auth.api.magicLinkVerify({
    // No callbackURL — per the plugin's own branch, that's what makes it
    // return session JSON instead of throwing a redirect.
    query: { token: token! },
    headers: new Headers(),
    returnHeaders: true,
  });

  const setCookie = verifyResult.headers.get("set-cookie");
  expect(setCookie, "magic-link verify must set a session cookie").toBeTruthy();
  // Strip cookie attributes (Path=, HttpOnly, ...) — a Cookie request header
  // carries only name=value pairs.
  return setCookie!.split(";")[0];
}

describe("apps/web auth token bridge (P5.T3)", () => {
  beforeAll(async () => {
    await authReady();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mints a real HS256 token whose claims match the API contract exactly (apps/api/app/auth.py)", async () => {
    const sessionCookie = await signInAndGetSessionCookie(TEST_EMAIL);

    const request = new Request("http://localhost/auth/token", {
      headers: { cookie: sessionCookie },
    });
    const response = await tokenRouteGET(request);
    expect(response.status).toBe(200);

    const body = (await response.json()) as { token: string };
    expect(body.token).toBeTruthy();

    // decodeProtectedHeader doesn't verify — confirms the algorithm the
    // token was actually signed with before jwtVerify enforces it below.
    expect(decodeProtectedHeader(body.token).alg).toBe("HS256");

    const { payload } = await jwtVerify(
      body.token,
      new TextEncoder().encode(process.env.AUTH_JWT_SECRET),
      { algorithms: ["HS256"], issuer: "tonus-web", audience: "tonus-api" },
    );

    expect(typeof payload.sub).toBe("string");
    expect(payload.sub).not.toHaveLength(0);
    // The API contract explicitly forbids email-as-sub (PII in API logs,
    // per the T2 review note this task brief carries forward) — Better
    // Auth's own generated user id is opaque and never equals the email.
    expect(payload.sub).not.toBe(TEST_EMAIL);
    expect(payload.iss).toBe("tonus-web");
    expect(payload.aud).toBe("tonus-api");
    expect(typeof payload.exp).toBe("number");
    expect(typeof payload.iat).toBe("number");
    // Short-lived: ~15 minutes, not e.g. a multi-day session-length token.
    expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(15 * 60 + 5);
  });

  it("returns 401 auth_required with no session cookie", async () => {
    const request = new Request("http://localhost/auth/token");
    const response = await tokenRouteGET(request);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.code).toBe("auth_required");
  });
});
