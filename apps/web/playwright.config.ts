import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Non-default ports so the e2e run never collides with a developer's `npm
// run dev` (3000) or a locally-running API (8000).
const API_PORT = 8134;
const WEB_PORT = 3100;
const API_URL = `http://127.0.0.1:${API_PORT}`;
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

// A fresh SQLite file per invocation (never the dev app.db) — storage.py
// reads FINHEALTH_DB, so pointing it at a tmp path keeps every e2e run
// isolated from real data and from each other.
const E2E_DB_PATH = path.join(os.tmpdir(), `finhealth-e2e-${crypto.randomUUID()}.db`);
// Same idea for Better Auth's own SQLite store (apps/web/lib/auth.ts) —
// never the dev .data/auth.db.
const E2E_AUTH_DB_PATH = path.join(os.tmpdir(), `finhealth-e2e-auth-${crypto.randomUUID()}.db`);

// Fixed (not random) test-only secrets, shared by both webServer entries
// below. Better Auth's own `betterAuth()` throws at startup in production
// mode (`npm run build && npm run start`, exactly what the "web" entry
// runs) if BETTER_AUTH_SECRET is unset — unlike AUTH_JWT_SECRET, which this
// codebase deliberately made optional (see apps/api/app/auth.py), Better
// Auth's own secret protects real session/magic-link integrity and has no
// safe "just run anonymous" fallback in production mode. AUTH_JWT_SECRET is
// set on both servers so a future task's e2e can mint a token here and have
// the API accept it without a config mismatch.
const E2E_BETTER_AUTH_SECRET = "e2e-test-only-better-auth-secret-32-chars-min";
const E2E_AUTH_JWT_SECRET = "e2e-test-only-auth-jwt-bridge-secret";

// A real, browser-driven magic-link e2e was attempted (tee the "web"
// webServer's stdout to a file, poll it from tests/e2e/auth.spec.ts for the
// "MAGIC_LINK: <url>" line lib/auth.ts's dev transport logs — Playwright's
// own `stdout: "pipe"` only forwards output to *this* process's stdout for
// a human to read, with no programmatic read-back API). It worked in the
// browser (the send → composed sent-state UI is covered below) but the
// log file itself was unreliable: `tee`'s destination-file writes are
// fully buffered when the destination isn't a TTY, so the MAGIC_LINK line
// routinely didn't land on disk until the webServer process was torn down
// at the end of the whole run — well past any test's own polling window,
// not a timing number worth chasing higher. tests/auth-token-route.test.ts
// (vitest) covers the full handshake and the token's real cryptographic
// claims instead — see auth.spec.ts's own header comment for the split.

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: "line",
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    // RU is the default, prefix-free locale (i18n/routing.ts) but
    // next-intl negotiates it from Accept-Language when there's no cookie
    // yet — Playwright's browser defaults to en-US, which would otherwise
    // serve the English strings at "/". This product is RU-first.
    locale: "ru-RU",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Two servers, started in order: the API first (isolated tmp DB), then
  // the web app built + started against it via API_URL. Playwright waits
  // for each `url` to respond before starting the next, and tears both
  // down when the run ends — no manual process management needed between
  // the 3 consecutive gate runs.
  webServer: [
    {
      name: "api",
      command: `.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port ${API_PORT}`,
      cwd: path.resolve(__dirname, "../api"),
      env: {
        ...process.env,
        FINHEALTH_DB: E2E_DB_PATH,
        ALLOWED_ORIGINS: WEB_URL,
        AUTH_JWT_SECRET: E2E_AUTH_JWT_SECRET,
      },
      url: `${API_URL}/api/industries`,
      reuseExistingServer: false,
      timeout: 30_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      name: "web",
      // build+start (not `next dev`) for a deterministic, production-shaped
      // gate run — the same artifact that would ship.
      command: `npm run build && npm run start -- -p ${WEB_PORT}`,
      cwd: __dirname,
      env: {
        ...process.env,
        API_URL,
        BETTER_AUTH_SECRET: E2E_BETTER_AUTH_SECRET,
        BETTER_AUTH_URL: WEB_URL,
        BETTER_AUTH_DB_PATH: E2E_AUTH_DB_PATH,
        AUTH_JWT_SECRET: E2E_AUTH_JWT_SECRET,
      },
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
