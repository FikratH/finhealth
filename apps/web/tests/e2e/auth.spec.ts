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
//     correctly, Google is correctly absent when unconfigured, and
//     submitting a real email reaches the composed sent-state — everything
//     an e2e can prove about the browser-facing half of the flow without
//     reading the link back out of a log.
//   - tests/auth-token-route.test.ts (vitest, no browser): drives the
//     magic-link handshake through Better Auth's own server API directly
//     (the same functions this route ultimately calls), then calls the
//     real /auth/token route handler and cryptographically verifies the
//     token it mints — the half a browser can't easily inspect anyway
//     (the signed JWT never appears in the DOM).
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

test("submitting a real email reaches the composed sent-state confirmation, against the real Better Auth route", async ({
  page,
}) => {
  const email = `e2e-signin-${Date.now()}@example.com`;

  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Отправить ссылку" }).click();

  // Composed sent-state confirmation, not a toast — the form itself is
  // gone. This exercises the real POST /auth/sign-in/magic-link round trip
  // (no mocked fetch) — a wiring mistake (wrong basePath, the rewrite
  // swallowing the request, a missing BETTER_AUTH_SECRET, ...) would show
  // up here as the "genericError" state instead.
  await expect(page.getByText("Проверьте почту")).toBeVisible();
  await expect(page.getByText(email, { exact: false })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveCount(0);
});
