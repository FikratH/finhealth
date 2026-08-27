// @vitest-environment node
//
// Fix round 1 (security ruling): without EMAIL_HOST configured, production
// mode must fail the magic-link send instead of logging a live, single-use
// sign-in URL to server logs/aggregators — see lib/auth.ts's own comment on
// `sendMagicLink`. Node environment for the same reason as
// tests/auth-token-route.test.ts (a real Better Auth instance, no DOM).
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.BETTER_AUTH_DB_PATH = ":memory:";
process.env.BETTER_AUTH_SECRET = "test-only-better-auth-secret-32-characters-minimum";
process.env.BETTER_AUTH_URL = "http://localhost:3100";
delete process.env.EMAIL_HOST;

const { auth, authReady } = await import("@/lib/auth");

describe("magic-link dev transport fails closed in production (fix round 1)", () => {
  beforeAll(async () => {
    await authReady();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // vi.stubEnv, not a direct `process.env.NODE_ENV =` assignment — the
    // installed @types/node marks NODE_ENV read-only, which `tsc`/`next
    // build`'s typecheck step enforces (a real build-breaking error hit
    // while writing this test). stubEnv sidesteps it and self-documents
    // the restore.
    vi.unstubAllEnvs();
  });

  it("rejects the send and logs nothing when EMAIL_HOST is unset in production", async () => {
    // lib/auth.ts's NODE_ENV check is inside the sendMagicLink callback,
    // read lazily at send time — not at module-eval time like
    // BETTER_AUTH_SECRET/EMAIL_HOST above — so stubbing it here, right
    // before the call that exercises it, is sufficient.
    vi.stubEnv("NODE_ENV", "production");
    expect(process.env.EMAIL_HOST).toBeUndefined();

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(
      auth.api.signInMagicLink({
        body: { email: "prod-user@example.com" },
        headers: new Headers(),
      }),
    ).rejects.toThrow();

    // The one thing this fix exists to prevent: a live sign-in URL landing
    // in production stdout/log aggregators.
    expect(logSpy).not.toHaveBeenCalled();
  });
});
