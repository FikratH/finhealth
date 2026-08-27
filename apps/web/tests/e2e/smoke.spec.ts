import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

// Full-flow smoke test against the real engine (real API, real extraction,
// real scoring — no mocks): landing → analyze → upload → verify → results
// → public share. This is Plan 3's polish gate: anything it catches is a
// real integration bug, not a fixture mismatch.
//
// CONTROLLER CORRECTION (see task brief): the demo payload's true score is
// 85,1 / «Сильное состояние» — verified directly against
// apps/api/demo/expected_analysis_example.json. The plan text's "86,8"
// predates Phase 2's real benchmarks and is stale.

const NNBSP = " "; // narrow no-break space — lib/format.ts's RU group separator

const DEMO_CSV = path.resolve(__dirname, "../../../../apps/api/demo/demo_company.csv");
const SDD_SCREENS_DIR = path.resolve(
  __dirname,
  "../../../../.superpowers/sdd/2026-08-27-plan-3-frontend-foundation/e2e-screens",
);
const IMPECCABLE_DIR = path.resolve(__dirname, "../../../../.impeccable/review");

test.beforeAll(() => {
  fs.mkdirSync(SDD_SCREENS_DIR, { recursive: true });
  fs.mkdirSync(IMPECCABLE_DIR, { recursive: true });
});

test("landing → analyze → verify → results → public share", async ({ page, browser }) => {
  // --- Landing: h1 + CTA ---------------------------------------------
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Финансовая диагностика вашей компании",
  );
  const cta = page.getByRole("link", { name: "Проверить компанию" });
  await expect(cta).toBeVisible();
  await page.screenshot({ path: path.join(SDD_SCREENS_DIR, "landing.png") });
  await cta.click();

  // --- /analyze: upload step -------------------------------------------
  await expect(page).toHaveURL(/\/analyze$/);
  await page.locator('input[type="file"]').setInputFiles(DEMO_CSV);

  const industryCombobox = page.getByRole("combobox");
  await industryCombobox.click();
  await page.getByRole("option", { name: "Производство", exact: true }).click();

  await page.getByRole("button", { name: "Загрузить и проверить" }).click();

  // --- verify step: table shows revenue + the sign-normalization warning
  const revenueLatest = page.getByLabel("Выручка — Текущий период");
  await expect(revenueLatest).toBeVisible({ timeout: 30_000 });
  await expect(revenueLatest).toHaveValue(`3${NNBSP}245${NNBSP}900`);

  await expect(
    page.getByText("Знак «Себестоимость» нормализован", { exact: false }),
  ).toBeVisible();

  await page.screenshot({ path: path.join(SDD_SCREENS_DIR, "verify-table.png") });

  // --- run analysis → results page ------------------------------------
  await page.getByRole("button", { name: "Запустить анализ" }).click();
  await expect(page).toHaveURL(/\/results\/[0-9a-f]+$/, { timeout: 30_000 });

  await expect(page.locator("svg text")).toHaveText("85,1");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Сильное состояние");

  // net_margin row: name + Damodaran-sourced footnote marker
  const netMarginName = page.locator("span", { hasText: "Net Profit Margin" }).first();
  await expect(netMarginName).toBeVisible();
  const footnoteLink = netMarginName.locator("sup a");
  await expect(footnoteLink).toBeVisible();
  const footnoteHref = await footnoteLink.getAttribute("href");
  expect(footnoteHref).toBeTruthy();
  await expect(page.locator(footnoteHref!)).toContainText("Damodaran");

  await page.screenshot({ path: path.join(SDD_SCREENS_DIR, "results-top.png") });

  // --- share URL: same score renders in a brand-new browser context ----
  const resultsUrl = page.url();
  const shareContext = await browser.newContext();
  const sharePage = await shareContext.newPage();
  await sharePage.goto(resultsUrl);
  await expect(sharePage.locator("svg text")).toHaveText("85,1");
  await expect(sharePage.getByRole("heading", { level: 1 })).toHaveText("Сильное состояние");
  await shareContext.close();

  // --- impeccable finish-review screenshots: desktop + mobile, landing +
  // results, full-page -------------------------------------------------
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const desktopPage = await desktopContext.newPage();
  await desktopPage.goto("/");
  await desktopPage.screenshot({
    path: path.join(IMPECCABLE_DIR, "desktop.png"),
    fullPage: true,
  });
  await desktopPage.goto(resultsUrl);
  await desktopPage.screenshot({
    path: path.join(IMPECCABLE_DIR, "results-desktop.png"),
    fullPage: true,
  });
  await desktopContext.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto("/");
  await mobilePage.screenshot({
    path: path.join(IMPECCABLE_DIR, "mobile.png"),
    fullPage: true,
  });
  await mobilePage.goto(resultsUrl);
  await mobilePage.screenshot({
    path: path.join(IMPECCABLE_DIR, "results-mobile.png"),
    fullPage: true,
  });
  await mobileContext.close();
});
