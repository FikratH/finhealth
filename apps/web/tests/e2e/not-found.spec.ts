import { expect, test } from "@playwright/test";

// Plan 6 Task 2's own gate: the branded, locale-aware 404 (app/[locale]/
// not-found.tsx + the app/[locale]/[...rest] catch-all that reaches it for
// a genuinely unmatched path) actually renders in place of Next's stock
// unstyled 404, and locale negotiation still lands a prefix-free deep link
// on the RU-default shell rather than the framework's own white page.
// Accept-Language negotiation on "/" landing ru-default is already covered
// by smoke.spec.ts's very first assertion (the RU h1 on a fresh "/" visit
// under this suite's ru-RU browser locale) — not duplicated here.

test("/ru/nonexistent renders the branded 404: world ground, RU strings, real 404 status", async ({
  page,
}) => {
  // routing.ts's localePrefix is "as-needed" — ru is the default locale, so
  // next-intl's middleware 307s a superfluous "/ru/..." prefix to the
  // unprefixed path (its own documented behavior for "as-needed"). Playwright's
  // goto() resolves with the *last* response in that redirect chain, so
  // `response.status()` below is the real 404 the catch-all page renders,
  // not the intermediate 307.
  const response = await page.goto("/ru/nonexistent");
  expect(response?.status()).toBe(404);

  await expect(page.getByRole("heading", { name: "Страница не найдена" })).toBeVisible();
  await expect(page.getByText("Такой страницы не существует", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "На главную" })).toBeVisible();

  // World ground: the instrument's near-black paper token
  // (DESIGN.md --paper: #0a0c0e), not the framework default 404's white
  // background — confirms this rendered inside the real app shell
  // (app/[locale]/layout.tsx's body), not Next's own unstyled fallback.
  const bodyBackground = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  expect(bodyBackground).toBe("rgb(10, 12, 14)");
});

test("an unknown bare (no-prefix) path negotiates into the localized shell instead of the stock white 404", async ({
  page,
}) => {
  const response = await page.goto("/this-route-does-not-exist");
  expect(response?.status()).toBe(404);

  // Still on the bare path — "as-needed" never adds a prefix for the
  // default locale, so a genuinely unmatched prefix-free path resolves
  // straight to the branded shell without any redirect round-trip.
  await expect(page).toHaveURL(/\/this-route-does-not-exist$/);
  await expect(page.getByRole("heading", { name: "Страница не найдена" })).toBeVisible();

  const bodyBackground = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  expect(bodyBackground).toBe("rgb(10, 12, 14)");
});
