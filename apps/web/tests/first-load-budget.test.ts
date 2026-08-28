// @vitest-environment node
//
// Pure Node/fs test against .next's own build output — no React/DOM
// involved, same reasoning as tests/auth-token-route.test.ts's own
// @vitest-environment override.
//
// The regression guard P6 T4's final review flagged as missing: that task
// split MotionProvider (the gsap/@gsap/react/lenis-importing client
// component) into its own on-demand chunk specifically so signin, /my, and
// methodology — none of which render any motion of their own — would drop
// gsap/lenis entirely from their first-load JS (report:
// .superpowers/sdd/2026-08-27-plan-6-launch-surface/task-4-report.md,
// "signin/my/methodology now genuinely lose gsap/lenis"). Nothing enforced
// that claim afterward; a future change could reintroduce a static
// gsap/lenis import reachable from one of these routes and nothing would
// fail. This test does.
//
// Method (same one T4-P6's own report used, "Re-measured against the
// emitted HTML, not the manifest" section): for each target route, compute
// its first-load JS chunk set from .next's own build output — the shared
// root/polyfill chunks every route pays for (.next/build-manifest.json's
// rootMainFiles/polyfillFiles) plus that route's own synchronously-reached
// chunks (.next/server/app/[locale]/<route>/page_client-reference-
// manifest.js's clientModules, filtered to `async: false` — Next/Turbopack's
// own record of which chunks a route's script tags actually load, not a
// dynamic()-deferred one) — then read each chunk FILE'S CONTENT (not its
// hashed, opaque filename) and grep for a gsap/Lenis sentinel string. File
// content, not filenames, because Turbopack's chunk filenames are content
// hashes with no stable identity to assert against; a real source-code
// sentinel ("gsap.registerPlugin", "window.lenis" — both confirmed present
// verbatim in the real built output, `git grep`-style, before this test was
// written) is the robust form.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const NEXT_DIR = path.resolve(import.meta.dirname, "..", ".next");
const BUILD_MANIFEST_PATH = path.join(NEXT_DIR, "build-manifest.json");

// Confirmed absent from the shipped first-load JS by task-4-report.md;
// re-asserted here so a future regression fails loudly instead of silently
// re-bloating these three specifically-motion-free routes.
const MOTION_FREE_ROUTES = ["signin", "my", "methodology"];

// Real strings pulled from this project's own built output, not guessed:
// gsap's own runtime warning ("Missing plugin? gsap.registerPlugin()") and
// Lenis's own global version marker (`window.lenis = {}`) both survive
// Turbopack's minification verbatim. Matching "gsap" case-sensitively and
// "Lenis"/"lenis" case-insensitively keeps this from also matching an
// unrelated identifier that merely contains "lenis" as a substring while
// still catching both the library's own casings.
const MOTION_SENTINEL = /gsap|[Ll]enis/;

// `.next` only exists after `npm run build` — CI's web job always runs
// build before test (apps/web's ci.yml), so this never skips there; a local
// `npm test` without a prior `npm run build` skips instead of failing, with
// the reason in the test name itself (Vitest has no separate skip-reason
// parameter the way Playwright's test.skip(condition, reason) does).
const nextBuildExists = fs.existsSync(BUILD_MANIFEST_PATH);
const SKIP_REASON = "skips without a .next build present — run `npm run build` first";

function readClientReferenceManifest(routeDir: string) {
  const manifestPath = path.join(
    NEXT_DIR,
    "server",
    "app",
    "[locale]",
    routeDir,
    "page_client-reference-manifest.js",
  );
  const text = fs.readFileSync(manifestPath, "utf8");
  // Not JSON on disk — a JS file that assigns the manifest object onto a
  // global (`globalThis.__RSC_MANIFEST["/[locale]/<route>/page"] = {...}`)
  // for Next's own server runtime to read. Extracting the object literal
  // via regex and JSON.parse-ing it (rather than executing the file) keeps
  // this test from needing a real module/global environment — safe here
  // specifically because this is trusted build output this same repo just
  // produced, not third-party or user-supplied content.
  const match = text.match(/globalThis\.__RSC_MANIFEST\["[^"]+"\]\s*=\s*(\{[\s\S]*\});?\s*$/);
  if (!match) {
    throw new Error(`Could not parse client-reference-manifest for route "${routeDir}" at ${manifestPath}`);
  }
  return JSON.parse(match[1]) as {
    clientModules: Record<string, { chunks: string[]; async: boolean }>;
  };
}

function sharedFirstLoadChunks(): Set<string> {
  const buildManifest = JSON.parse(fs.readFileSync(BUILD_MANIFEST_PATH, "utf8")) as {
    rootMainFiles: string[];
    polyfillFiles: string[];
  };
  const chunks = new Set<string>();
  for (const file of [...buildManifest.rootMainFiles, ...buildManifest.polyfillFiles]) {
    chunks.add(`/_next/${file}`);
  }
  return chunks;
}

// The route directory as it appears under .next/server/app/[locale]/ — for
// /results/[id] that's the literal "results/[id]" path segment.
function firstLoadChunksForRoute(routeDir: string): Set<string> {
  const manifest = readClientReferenceManifest(routeDir);
  const chunks = sharedFirstLoadChunks();
  for (const mod of Object.values(manifest.clientModules)) {
    // Only chunks the route loads synchronously on first paint count toward
    // its first-load JS — an `async: true` entry is a next/dynamic()-
    // deferred chunk (e.g. results/[id]'s own MotionProvider chunk), which
    // is precisely the bundling shape P6 T4 built and this test must not
    // penalize.
    if (mod.async === false) {
      for (const chunk of mod.chunks) chunks.add(chunk);
    }
  }
  return chunks;
}

function chunkFilePath(chunkUrl: string): string {
  return path.join(NEXT_DIR, chunkUrl.replace(/^\/_next\//, ""));
}

function findMotionSentinel(chunks: Set<string>): { chunk: string; snippet: string }[] {
  const offenders: { chunk: string; snippet: string }[] = [];
  for (const chunk of chunks) {
    const filePath = chunkFilePath(chunk);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf8");
    const match = MOTION_SENTINEL.exec(content);
    if (match) {
      const start = Math.max(0, match.index - 30);
      offenders.push({ chunk, snippet: content.slice(start, start + 80) });
    }
  }
  return offenders;
}

describe("first-load JS budget guard (P7 T1c)", () => {
  it.skipIf(!nextBuildExists).each(MOTION_FREE_ROUTES)(
    `%s's first-load JS must not reference gsap/lenis (${SKIP_REASON})`,
    (routeDir) => {
      const offenders = findMotionSentinel(firstLoadChunksForRoute(routeDir));
      expect(
        offenders,
        `gsap/lenis found in "${routeDir}"'s first-load JS — P6 T4's motion-runtime split must keep this route motion-free:\n${offenders
          .map((o) => `  ${o.chunk}: …${o.snippet}…`)
          .join("\n")}`,
      ).toEqual([]);
    },
  );

  // Proves the method (and sentinel regex) actually detects motion when
  // it's genuinely there, rather than passing on the three routes above
  // merely because the manifest-parsing logic is broken or the regex never
  // matches anything. /results/[id] legitimately ships the full motion
  // runtime (mini-nav's Lenis engagement, the boot-grammar cinema) — it
  // must fail this same check.
  it.skipIf(!nextBuildExists)(`/results/[id] DOES reference gsap/lenis, proving the check is live (${SKIP_REASON})`, () => {
    const offenders = findMotionSentinel(firstLoadChunksForRoute("results/[id]"));
    expect(offenders.length).toBeGreaterThan(0);
  });
});
