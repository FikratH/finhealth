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
  await page.getByRole("button", { name: "Встать в список ожидания" }).click();

  // round-1 fix (F2): the confirmation is a role=status live region —
  // headline + AnnunciatorCell's label ("Вы в списке") plus its
  // description carrying the submitted email back, replacing the form
  // outright, same discipline as SigninForm's own sent-state.
  const successRegion = page.getByRole("status");
  await expect(successRegion).toBeVisible();
  await expect(successRegion).toContainText("Готово — вы в списке ожидания");
  await expect(successRegion).toContainText("Вы в списке");
  await expect(successRegion).toContainText(email);
  // The form itself is replaced, not left behind alongside the confirmation.
  await expect(page.getByLabel("Email")).toHaveCount(0);

  // Resubmitting the exact same email (a fresh page load — the form only
  // exists pre-submission) must be idempotent and honest, never claim a
  // second fresh signup.
  await page.goto("/pricing");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Встать в список ожидания" }).click();

  const duplicateRegion = page.getByRole("status");
  await expect(duplicateRegion).toContainText("Вы уже в списке ожидания");
  await expect(duplicateRegion).toContainText("Уже в списке");
  await expect(duplicateRegion).toContainText("Этот email уже добавлен в список");
});
