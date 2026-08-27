// Better Auth server instance (P5.T3). Session storage lives in its own
// SQLite file at .data/auth.db (gitignored) — deliberately separate from
// apps/api's analyses/uploads store; this file only ever answers "who is
// signed in," never product data.
//
// Two providers, both additive to the anonymous flow, which this file never
// touches:
//   - magicLink: the only provider always available. `sendMagicLink` is a
//     dev transport — it logs the URL to the server console instead of
//     emailing it, because SMTP isn't wired up yet (docs/founder-todo.md
//     tracks EMAIL_* as a launch blocker). If EMAIL_HOST is ever set before
//     a real transport is implemented here, sending fails loudly rather
//     than silently pretending an email went out.
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
import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { getMigrations } from "better-auth/db/migration";

// Overridable so tests can point at an isolated ":memory:" database instead
// of the real dev file — see tests/auth-token-route.test.ts.
const DB_PATH = process.env.BETTER_AUTH_DB_PATH ?? path.join(process.cwd(), ".data", "auth.db");

if (DB_PATH !== ":memory:") {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

// EMAIL_HOST is the one env var founder-todo.md names for the future SMTP
// transport; its mere presence is the gate, independent of whether that
// transport is actually implemented below yet (it isn't).
const emailTransportConfigured = Boolean(process.env.EMAIL_HOST);

export const googleAuthEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);

export const auth = betterAuth({
  database: new Database(DB_PATH),
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
        if (emailTransportConfigured) {
          // Honest-failure, not a fabricated "email sent" claim: no SMTP
          // client is wired up in this codebase yet.
          throw new Error(
            "EMAIL_HOST is set, but no SMTP transport is implemented yet " +
              "(docs/founder-todo.md tracks it) — unset EMAIL_HOST to use " +
              "the dev console transport instead.",
          );
        }
        // Dev transport: this line IS the "email" until SMTP lands. Prefix
        // is grepped by nothing in this codebase (deliberately not turned
        // into an e2e dependency — see tests/e2e/auth.spec.ts's header
        // comment) but kept stable for a developer/operator reading logs.
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

// Better Auth never auto-migrates its own schema — the CLI's `migrate`
// command normally does this once before deploy. There's no such deploy
// step in this repo yet, so this runs the equivalent migration
// programmatically, once per process, the first time anything needs the
// database (every entry point below awaits it before touching `auth`).
let migrationsPromise: Promise<void> | null = null;

export function authReady(): Promise<void> {
  if (!migrationsPromise) {
    migrationsPromise = getMigrations(auth.options).then(({ runMigrations }) => runMigrations());
  }
  return migrationsPromise;
}
