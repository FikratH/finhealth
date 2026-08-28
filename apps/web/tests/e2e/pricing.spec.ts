import { expect, test } from "@playwright/test";

// P6.T6: the pricing page + Pro waitlist, exercised against the REAL API
// (playwright.config.ts's "api" webServer) — no mocks. The composed
// success/duplicate confirmations (AnnunciatorCell) and the vitest-level
// validation/error-path coverage live in tests/waitlist-form.test.tsx; this
// is the one real-browser, real-network proof that a signup actually
// reaches POST /api/waitlist and round-trips correctly end to end.

test("pricing page renders both tiers, and the header/footer both link to it", async ({ page }) => {
  await page.goto("/pricing");

  await expect(page.getByRole("heading", { level: 1, name: "Тарифы" })).toBeVisible();
  await expect(page.getByText("Free", { exact: true })).toBeVisible();
  await expect(page.getByText("Pro", { exact: true })).toBeVisible();
  await expect(page.getByText("Цены запуска, могут уточниться")).toBeVisible();

  // Header nav link, current-location marked (AccountMenu's own
  // aria-current + brand-glow grammar, reused verbatim per DESIGN.md).
  const headerLink = page.locator("header").getByRole("link", { name: "Тарифы" });
  await expect(headerLink).toBeVisible();
  await expect(headerLink).toHaveAttribute("aria-current", "page");

  // Footer's own copy of the link.
  await expect(page.locator("footer").getByRole("link", { name: "Тарифы" })).toBeVisible();
});

test("round-2 regression guard (N1): the footer's Pricing link actually carries its idle styling, not just its href", async ({
  page,
}) => {
  // IDLE_LINK_CLASS used to come from account-menu.tsx, a "use client"
  // module — SiteFooter (a Server Component) importing a named export
  // across that boundary got a client REFERENCE, not the string, and
  // cn() silently dropped it: the link still worked (href, text, click)
  // but rendered with none of text-ink-muted/hover:text-ink on every
  // prerendered page. jsdom-based component tests can't see this at all
  // (jsdom doesn't enforce the RSC server/client boundary) — this is the
  // one check in the whole suite that renders the real built HTML and can
  // actually catch a regression here, so it gets its own test rather than
  // riding inside a broader render-check.
  await page.goto("/pricing");

  const footerLink = page.locator("footer").getByRole("link", { name: "Тарифы" });
  await expect(footerLink).toBeVisible();
  await expect(footerLink).toHaveClass(/text-ink-muted/);
});

test("finish-wave fixes 1+3: both tier prices render in the segment voice and actually ignite in a real browser", async ({
  page,
}) => {
  await page.goto("/pricing");

  // Fix 1: the price is a SegmentDisplay (role="img"), not plain Inter
  // text — $ and /мес stay outside the mask as plain PT Mono adjuncts.
  const freePrice = page.getByRole("img", { name: "0 — Цена" });
  const proPrice = page.getByRole("img", { name: "19 — Цена" });
  await expect(freePrice).toBeVisible();
  await expect(proPrice).toBeVisible();
  await expect(page.getByText("$", { exact: true })).toBeVisible();
  await expect(page.getByText("/мес", { exact: true })).toBeVisible();

  // Fix 3: each figure ignites on mount via the real gsap timeline (not
  // jsdom's polyfilled ticker). Checked two ways, deliberately not just
  // "no segment reports data-lit='false'" — SegmentDisplay's own SSR/
  // no-JS baseline renders active segments as data-lit="true" BEFORE
  // ignite() ever runs (see segment-display.tsx: "[data-lit]=true by
  // default"), so a bare "zero unlit" poll can pass trivially on the very
  // first check without ever proving the cascade actually ran. Instead:
  // (a) explicit toHaveAttribute("data-lit", "true") on every active
  // segment once settled, and (b) the CSS the app ships actually applies
  // — [data-lit="true"] resolves to the real accent teal (rgb(25, 194,
  // 176), full opacity), not the 10%-opacity ghost tone — verified
  // against getComputedStyle, not just the attribute, since a CSS
  // specificity/load-order bug could leave the right attribute with the
  // wrong paint.
  const freeSegments = freePrice.locator("[data-segment-on]");
  const proSegments = proPrice.locator("[data-segment-on]");
  await expect(freeSegments.first()).toHaveAttribute("data-lit", "true", { timeout: 3000 });

  const freeCount = await freeSegments.count();
  const proCount = await proSegments.count();
  expect(freeCount).toBeGreaterThan(0);
  expect(proCount).toBeGreaterThan(0);
  for (let i = 0; i < freeCount; i++) {
    await expect(freeSegments.nth(i)).toHaveAttribute("data-lit", "true");
  }
  for (let i = 0; i < proCount; i++) {
    await expect(proSegments.nth(i)).toHaveAttribute("data-lit", "true");
  }

  const litColor = await freeSegments.first().evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(litColor).toBe("rgb(25, 194, 176)");
});

test("Free tier's CTA links to /analyze", async ({ page }) => {
  await page.goto("/pricing");

  await page.getByRole("link", { name: "Начать бесплатно" }).click();
  await expect(page).toHaveURL(/\/analyze$/);
});

test("Pro waitlist happy path: fill email, submit, see the annunciator confirmation; a second submission of the same email shows the honest 'already on the list' state", async ({
  page,
}) => {
  const email = `e2e-waitlist-${Date.now()}@example.com`;

  await page.goto("/pricing");

  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Записаться в лист ожидания" }).click();

  // round-1 fix (F2): the confirmation is a role=status live region —
  // headline + AnnunciatorCell's label ("Вы в списке") plus its
  // description carrying the submitted email back, replacing the form
  // outright, same discipline as SigninForm's own sent-state.
  const successRegion = page.getByRole("status");
  await expect(successRegion).toBeVisible();
  await expect(successRegion).toContainText("Готово — вы в списке ожидания");
  await expect(successRegion).toContainText("Вы в списке");
  await expect(successRegion).toContainText(email);
  // Round-2 residual: the submit button unmounted along with the form —
  // focus must land on the confirmation panel itself, not fall back to
  // <body> and strand a keyboard user with no indication where they are.
  await expect(successRegion).toBeFocused();
  // The form itself is replaced, not left behind alongside the confirmation.
  await expect(page.getByLabel("Email")).toHaveCount(0);

  // Resubmitting the exact same email (a fresh page load — the form only
  // exists pre-submission) must be idempotent and honest, never claim a
  // second fresh signup.
  await page.goto("/pricing");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Записаться в лист ожидания" }).click();

  const duplicateRegion = page.getByRole("status");
  await expect(duplicateRegion).toContainText("Вы уже в списке ожидания");
  await expect(duplicateRegion).toContainText("Уже в списке");
  await expect(duplicateRegion).toContainText("Этот email уже добавлен в список");
});
