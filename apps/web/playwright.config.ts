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
      },
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
