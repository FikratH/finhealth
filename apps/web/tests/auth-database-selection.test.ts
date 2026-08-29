// @vitest-environment node
//
// Production-down bug fix: Vercel's serverless functions have a read-only
// filesystem (only /tmp is writable, and it's wiped between invocations),
// so lib/auth.ts's default better-sqlite3 file storage crashed every
// /auth/* route in production (GET /auth/get-session, POST
// /auth/sign-in/magic-link — all 500). The fix is a DATABASE_URL branch in
// lib/auth.ts that swaps storage to a `pg` Pool (same Neon database
// apps/api uses, plain `postgresql://` scheme — never apps/api's
// SQLAlchemy-specific `postgresql+psycopg://`) when DATABASE_URL is set
// AND NODE_ENV === "production", and otherwise keeps the existing sqlite
// file exactly as before (dev, e2e — playwright.config.ts never sets
// DATABASE_URL for the web server). The NODE_ENV half of that gate matters
// on its own, not just as a belt-and-suspenders check: a `vercel env pull`
// run from inside apps/web (rather than the repo root, where it's run
// today) would drop the production Neon DATABASE_URL straight into
// apps/web/.env.local, which `next dev` auto-loads — without gating on
// NODE_ENV too, that would silently point local dev at production auth
// data.
//
// This test only exercises the *selection* logic — which constructor
// lib/auth.ts reaches for — by mocking both `pg` and `better-sqlite3` and
// asserting construction. It deliberately does not hit a real Postgres or
// touch a real sqlite file: Better Auth's own `betterAuth()` builds its
// adapter lazily (context/init.mjs's `init` awaits `getAdapter` as its
// first statement, so the promise it returns is never resolved by a bare
// module import), so importing lib/auth.ts is enough to observe which
// database client got constructed, without ever issuing a query.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { poolConstructor, databaseConstructor } = vi.hoisted(() => ({
  poolConstructor: vi.fn(),
  databaseConstructor: vi.fn(),
}));

vi.mock("pg", () => ({
  Pool: class {
    constructor(config: unknown) {
      poolConstructor(config);
    }
    connect = vi.fn();
    query = vi.fn();
    end = vi.fn();
    on = vi.fn();
  },
}));

vi.mock("better-sqlite3", () => ({
  default: class {
    constructor(path: unknown) {
      databaseConstructor(path);
    }
    // Better Auth's own dialect auto-detection (createKyselyAdapter,
    // "connect" in db for pg above) keys sqlite off `"aggregate" in db` —
    // a real better-sqlite3 Database instance has it; the mock needs it
    // too or detection silently fails ("Failed to initialize database
    // adapter", surfaced as an unhandled rejection from Better Auth's
    // lazy adapter init, not a synchronous throw here).
    aggregate = vi.fn();
    pragma = vi.fn();
    close = vi.fn();
  },
}));

describe("Better Auth storage selection (Postgres on Vercel serverless, sqlite elsewhere)", () => {
  beforeEach(() => {
    vi.resetModules();
    poolConstructor.mockClear();
    databaseConstructor.mockClear();
    // Every scenario below stays out of the real filesystem regardless of
    // which branch it's exercising — only the DATABASE_URL presence/
    // absence under test should vary.
    vi.stubEnv("BETTER_AUTH_DB_PATH", ":memory:");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("picks a pg Pool built from DATABASE_URL when it is set AND NODE_ENV is production, and never touches sqlite", async () => {
    const connectionString = "postgresql://mock-user:mock-pass@mock-host/mock-db";
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", connectionString);

    await import("@/lib/auth");

    expect(poolConstructor).toHaveBeenCalledTimes(1);
    expect(poolConstructor).toHaveBeenCalledWith({ connectionString });
    expect(databaseConstructor).not.toHaveBeenCalled();
  });

  it("falls back to the better-sqlite3 file when DATABASE_URL is unset", async () => {
    vi.stubEnv("NODE_ENV", "production");
    // Defensive, not merely redundant: guards against a DATABASE_URL that
    // leaked into this process's env (e.g. a developer's shell, or a CI
    // matrix that sets it for unrelated jobs) rather than assuming the
    // ambient environment is clean.
    delete process.env.DATABASE_URL;

    await import("@/lib/auth");

    expect(databaseConstructor).toHaveBeenCalledTimes(1);
    expect(databaseConstructor).toHaveBeenCalledWith(":memory:");
    expect(poolConstructor).not.toHaveBeenCalled();
  });

  it("falls back to the better-sqlite3 file when DATABASE_URL is set but NODE_ENV is not production (the vercel-env-pull-from-apps/web footgun)", async () => {
    // Regression case for the review finding: DATABASE_URL's mere presence
    // must never be enough on its own — a `next dev` run that happens to
    // have a production Neon DATABASE_URL in its env (e.g. from a
    // misplaced `vercel env pull`) must still use sqlite, not silently
    // read/write the production auth database.
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", "postgresql://mock-user:mock-pass@mock-host/mock-db");

    await import("@/lib/auth");

    expect(databaseConstructor).toHaveBeenCalledTimes(1);
    expect(databaseConstructor).toHaveBeenCalledWith(":memory:");
    expect(poolConstructor).not.toHaveBeenCalled();
  });
});
