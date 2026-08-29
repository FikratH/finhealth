import { expect, test } from "@playwright/test";

// P5.T3's documented e2e substitute for a full browser-driven magic-link
// flow. A real attempt was made first (tee the "web" webServer's stdout to
// a file, poll it for the "MAGIC_LINK: <url>" line lib/auth.ts's dev
// transport logs, navigate the browser to it) — it's gone from
// playwright.config.ts now because it was genuinely brittle, not merely
// theoretically so: `tee`'s destination-file writes are fully buffered
// when the destination isn't a TTY, so the line routinely didn't land on
// disk until the whole webServer process was torn down at the end of the
// run, well past any single test's polling window. See
// playwright.config.ts's own header comment for the full account.
//
// The split this file settles into instead:
//   - HERE (real browser, real server, no mocks): the signin page renders
//     correctly, Google is correctly absent when unconfigured, and — since
//     fix round 1 — submitting a real email against this webServer (which
//     always runs `npm run build && npm run start`, i.e. production mode,
//     with no RESEND_API_KEY configured) correctly fails closed instead of
//     reaching the sent-state. That's the same security-critical path a
//     real unconfigured production deploy hits, exercised end to end
//     through an actual browser and an actual Better Auth instance.
//   - tests/signin-form.test.tsx (vitest, mocked authClient): the
//     composed sent-state UI itself, unreachable here now that this
//     webServer's own environment always fails the send closed.
//   - tests/auth-token-route.test.ts (vitest, no browser): drives the
//     magic-link handshake through Better Auth's own server API directly
//     (the same functions this route ultimately calls — that test's own
//     env sets NODE_ENV differently, so the send itself succeeds there),
//     then calls the real /auth/token route handler and cryptographically
//     verifies the token it mints — the half a browser can't easily
//     inspect anyway (the signed JWT never appears in the DOM).
//
// The anonymous smoke suite (tests/e2e/smoke.spec.ts) is untouched and
// still runs in the same suite, proving this feature is additive.
test("signin page renders the form, and Google is absent when unconfigured (anonymous flow untouched)", async ({
  page,
}) => {
  await page.goto("/signin");
  await expect(page.getByRole("heading", { name: "Вход" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Отправить ссылку" })).toBeVisible();
  // No GOOGLE_CLIENT_ID/SECRET set for this e2e run — the button must be
  // absent, not present-and-disabled.
  await expect(page.getByRole("button", { name: "Войти через Google" })).toHaveCount(0);

  // Header, signed out: a quiet "Войти" link, not an account menu. "/signin"
  // itself is a non-"/" route so SiteHeader renders (see its own header
  // comment on why "/" is the one exception).
  await expect(page.getByRole("link", { name: "Войти" })).toBeVisible();
});

test("submitting a real email against an unconfigured production deploy fails closed — no sent-state, no magic link logged", async ({
  page,
}) => {
  const email = `e2e-signin-${Date.now()}@example.com`;

  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Отправить ссылку" }).click();

  // Fix round 1's security ruling, exercised through a real browser
  // against the real route: this webServer runs `npm run build && npm run
  // start` (production mode) with no RESEND_API_KEY, so lib/auth.ts's
  // sendMagicLink rejects the send rather than logging a live sign-in URL.
  // The form's own visible-error path is what a real user sees — no
  // half-signed-in state, and specifically NOT the composed sent-state
  // (that would be the exact false confirmation the security ruling
  // exists to prevent: a user believing a link went out when nothing did).
  await expect(page.getByText("Не удалось отправить ссылку", { exact: false })).toBeVisible();
  await expect(page.getByText("Проверьте почту")).toHaveCount(0);
  // The form stays — the user can retry once real SMTP is configured,
  // rather than being stuck on a dead-end confirmation screen.
  await expect(page.getByLabel("Email")).toBeVisible();
});

// /my (P5.T4, «Мои анализы») is the product's one auth-gated page. This
// webServer has no scriptable way to actually sign in (see this file's own
// header comment on why a real magic-link flow was dropped from e2e), so
// the signed-in table is covered by vitest instead
// (tests/my-analyses-view.test.tsx) — this is the one real-browser
// assertion the gate itself gets: an anonymous visit renders the composed
// sign-in prompt, not a blank page or a client error.
test("/my (signed out): renders the composed sign-in prompt, not the history table", async ({
  page,
}) => {
  await page.goto("/my");
  await expect(page.getByRole("heading", { name: "Требуется вход" })).toBeVisible();
  // Scoped to <main> — the header's own AccountMenu also renders a
  // "Войти" link on this (non-"/") route, so an unscoped query would be
  // ambiguous between the two.
  await expect(page.getByRole("main").getByRole("link", { name: "Войти" })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
});
