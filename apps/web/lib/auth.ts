// Better Auth server instance (P5.T3). Session storage lives in its own
// SQLite file at .data/auth.db (gitignored) — deliberately separate from
// apps/api's analyses/uploads store; this file only ever answers "who is
// signed in," never product data. In production (Vercel serverless), that
// SQLite file cannot exist — see the DATABASE_URL branch below.
//
// Two providers, both additive to the anonymous flow, which this file never
// touches:
//   - magicLink: the only provider always available. `sendMagicLink`
//     branches on NODE_ENV, read lazily inside the callback (not at
//     module-eval time) so a build's env is always what's checked:
//       - dev (`next dev`): logs the URL to the server console instead of
//         emailing it. This IS the "email" for local testing, unconditionally
//         — tests/e2e/auth.spec.ts and tests/auth-token-route.test.ts both
//         depend on this exact log line, so it stays even if RESEND_API_KEY
//         happens to be set in a dev shell.
//       - production, RESEND_API_KEY set: sends via Resend (lib/resend.ts;
//         fix round 2, founder key). A Resend failure (network or non-2xx)
//         fails closed there too — generic Error, nothing link-bearing
//         logged — so it reaches the signin form's same generic-error path.
//       - production, RESEND_API_KEY unset: **fails closed** (fix round 1,
//         security ruling) — rejects the send instead of logging the URL,
//         because printing a live single-use credential into production
//         server logs/aggregators is a real exposure, not a convenience.
//         The signin form's existing generic-error path is what a user
//         sees — no half-signed-in state, no link anyone can act on.
//         Configuring RESEND_API_KEY is what turns production sign-in back
//         on, by design.
//   - google: registered only when GOOGLE_CLIENT_ID/SECRET are both present
//     (also a founder-todo item) — its absence from `socialProviders`
//     entirely, not a disabled button, is what "not configured" means to
//     Better Auth.
//
// Uses `better-sqlite3` (Better Auth's own primary-recommended SQLite
// driver), not the newer built-in `node:sqlite` — this repo's CI
// (.github/workflows/ci.yml) pins Node 20, which predates `node:sqlite`
// (stable only from Node 22.5+). better-sqlite3 ships prebuilt binaries for
// every platform this project runs on (dev machines and CI), so it never
// needs a native compile step here.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { Pool } from "pg";
import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { getMigrations } from "better-auth/db/migration";
import { sendMagicLinkEmail } from "./resend";

// Overridable so tests can point at an isolated ":memory:" database instead
// of the real dev file — see tests/auth-token-route.test.ts.
const DB_PATH = process.env.BETTER_AUTH_DB_PATH ?? path.join(process.cwd(), ".data", "auth.db");

// Vercel's serverless functions have a read-only filesystem (only /tmp is
// writable, and it's wiped between invocations) — better-sqlite3 opening
// (or creating) a file under the repo's working directory throws there,
// which is what took every /auth/* route down in production. DATABASE_URL
// being set is what switches storage to Postgres (the same Neon database
// apps/api uses; see apps/api/app/storage.py) instead: dev (`next dev`) and e2e
// (playwright.config.ts) never set it, so both keep using the sqlite file
// below completely unchanged. IMPORTANT: this must be the PLAIN
// `postgresql://` scheme the `pg` driver expects — never apps/api's
// `postgresql+psycopg://` scheme, which is SQLAlchemy-specific and `pg`
// cannot parse. See .env.example for the two-scheme note.
const usePostgres = Boolean(process.env.DATABASE_URL);

if (!usePostgres && DB_PATH !== ":memory:") {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

export const googleAuthEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);

export const auth = betterAuth({
  database: usePostgres
    ? new Pool({ connectionString: process.env.DATABASE_URL })
    : new Database(DB_PATH),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  // Deliberately NOT under /api/* (Better Auth's own default): next.config.ts
  // proxies every /api/:path* request to apps/api, and that rewrite is an
  // "afterFiles" rewrite — checked BEFORE Next.js's own dynamic routes, which
  // is required so it wins over a same-named page route (e.g. /api/analyze
  // would otherwise collide with the dynamic page app/[locale]/analyze,
  // matched as {locale:"api"}/analyze and 404ing via that layout's own
  // notFound() — a real bug hit and reverted while building this). Mounting
  // Better Auth at /auth/* instead sidesteps the whole rewrite entirely
  // rather than trying to carve out an exception in it. proxy.ts's
  // middleware matcher excludes "auth" alongside "api" for the same reason
  // (it must not try to inject a locale prefix onto these routes).
  basePath: "/auth",
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        if (process.env.NODE_ENV === "production") {
          if (!process.env.RESEND_API_KEY) {
            // Fail closed (fix round 1, security ruling): logging a live,
            // single-use sign-in credential to production server
            // logs/aggregators is a real exposure, not a convenience. The
            // signin form's existing generic-error path is what a user
            // sees — no half-signed-in state, no link anyone can act on.
            // Configuring RESEND_API_KEY is what turns production sign-in
            // back on, by design (fix round 2: lib/resend.ts is the real
            // transport now).
            throw new Error("magic_link_transport_unconfigured");
          }
          // sendMagicLinkEmail itself fails closed on any Resend error
          // (network or non-2xx) — a generic, link-free throw that reaches
          // the same signin-form error path as the branch above.
          await sendMagicLinkEmail({ email, url });
          return;
        }
        // Dev transport (`next dev`): this line IS the "email" for local
        // testing, unconditionally — even if RESEND_API_KEY happens to be
        // set in a dev shell, deterministic local testing wins (both
        // tests/e2e/auth.spec.ts and tests/auth-token-route.test.ts read
        // this exact log line). Prefix is grepped by nothing in this
        // codebase but kept stable for a developer/operator reading logs.
        console.log(`MAGIC_LINK: ${url} (to: ${email})`);
      },
    }),
    // Recommended by Better Auth's own Next.js App Router guide, must be
    // last: lets auth.api.* calls from Server Actions/Components set
    // cookies via next/headers when they're not already inside a Route
    // Handler Response. The route handler at app/auth/[...all] doesn't
    // need it (it returns the Response Better Auth builds directly), but
    // future server-side call sites (e.g. Task 4's /my page) will.
    nextCookies(),
  ],
  ...(googleAuthEnabled
    ? {
        socialProviders: {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          },
        },
      }
    : {}),
});

// Better Auth never auto-migrates its own schema. In production the
// Postgres schema is applied once, out of band, via
// `npx @better-auth/cli@latest migrate` against Neon (see
// docs/founder-todo.md) — this call is then a no-op diff check on every
// cold start. For the sqlite path (dev, e2e) there's no such deploy step,
// so this is what actually creates/updates the schema, once per process,
// the first time anything needs the database (every entry point below
// awaits it before touching `auth`). Either way it's idempotent, so
// leaving it in place for both backends is strictly a safety net.
let migrationsPromise: Promise<void> | null = null;

export function authReady(): Promise<void> {
  if (!migrationsPromise) {
    migrationsPromise = getMigrations(auth.options).then(({ runMigrations }) => runMigrations());
  }
  return migrationsPromise;
}
