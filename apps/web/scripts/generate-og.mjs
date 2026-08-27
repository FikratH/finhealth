// scripts/generate-og.mjs — captures the static branded OG card.
//
// Playwright screenshots the dedicated /dev/og route (logo + the landing
// h1 tagline, composed on the Monitor world's own ground and grid
// texture) at an exact 1200×630 viewport and writes the result to
// public/og/og-default.png — the one OG/Twitter card image every
// launch-surface route points at (see lib/seo.ts).
//
// /dev/og is a dev-family route (404s once NODE_ENV==="production", same
// discipline as /dev/tokens and /dev/motion), so this captures against
// `npm run dev`, not a production build — start that first, in another
// terminal:
//
//   npm run dev
//   node scripts/generate-og.mjs
//
// Re-run this any time the OG composition changes (logo asset, tagline
// copy, world tokens) — the PNG is committed, not generated at build
// time.
import { chromium } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_URL = process.env.CAP_WEB_URL ?? "http://127.0.0.1:3000";
const OUT_DIR = path.resolve(__dirname, "../public/og");
const OUT_FILE = path.join(OUT_DIR, "og-default.png");
fs.mkdirSync(OUT_DIR, { recursive: true });

const SIZE = { width: 1200, height: 630 };

const browser = await chromium.launch();
// ru is the default, prefix-free locale (i18n/routing.ts), so "/dev/og"
// resolves without a locale prefix — the one canonical OG image is RU,
// matching the source-of-truth language. reducedMotion follows the same
// gated-capture discipline every other capture script in this repo uses
// (.superpowers/sdd/2026-08-27-plan-redesign-monitor/r6-captures.mjs),
// even though this composition has no animation of its own to begin with.
const context = await browser.newContext({
  viewport: SIZE,
  reducedMotion: "reduce",
  locale: "ru-RU",
  baseURL: WEB_URL,
});
const page = await context.newPage();

await page.goto("/dev/og");
await page.waitForFunction(() => document.fonts.status === "loaded");
// The composition is the one thing on screen (a fixed full-viewport
// overlay — see app/[locale]/dev/og/page.tsx) — wait for its logo <img>
// to actually finish decoding rather than trusting goto()'s load event,
// so a slow first paint never gets captured mid-decode.
await page.waitForFunction(() => {
  const img = document.querySelector("[data-og-capture] img");
  return Boolean(img && img.complete && img.naturalWidth > 0);
});

await page.screenshot({ path: OUT_FILE, fullPage: false });
await browser.close();
console.log("OG image written →", OUT_FILE);
