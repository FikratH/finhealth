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

// Set by the main flow test below, reused by the reduced-motion test that
// follows it in the same file — this suite runs single-worker,
// non-parallel (playwright.config.ts), so sequential tests can rely on
// module state the same way the main test already reuses `resultsUrl` for
// its own share-context check. Re-running the whole upload→verify→analyze
// flow a second time just to load a results page under a different
// emulated media feature would be pure waste.
let resultsUrl = "";

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

  // Scoped to the заключение's own dial — the what-if simulator further
  // down the page (Plan 4 Task 4) renders a second ScoreDial (actual score
  // + a simulated ghost arc), so an unscoped `svg text` locator would now
  // match both.
  await expect(page.locator("#score svg text")).toHaveText("85,1");
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

  // --- print safety: an unscrolled section must not print/screenshare
  // blank. This is a real browser evaluating the actual @media print rule
  // (jsdom can't — it doesn't apply CSS at all), against a section
  // (categories) that's below the score header and hasn't been scrolled
  // into view yet, so its data-reveal-content is still GSAP's opacity: 0
  // pending-reveal state for on-screen purposes. --------------------------
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#categories [data-reveal-content]")).toHaveCSS("opacity", "1");
  await page.emulateMedia({ media: "screen" });

  // --- the scroll cinema: scroll to the bottom, the last mini-nav section
  // (Рекомендации) reveals, and the desktop rail highlights it ----------
  await page.setViewportSize({ width: 1440, height: 900 }); // clears the xl: breakpoint the desktop rail needs
  const nav = page.getByRole("navigation", { name: "Навигация по разделам отчёта" });
  // exact: true — Plan 4 Task 5 added a second nav link, "Заключение
  // аналитика" (the LLM narrative section), whose name otherwise substring-
  // matches this same query.
  await expect(nav.getByRole("link", { name: "Заключение", exact: true })).toHaveAttribute(
    "aria-current",
    "true",
  ); // always-lit: something is current before any scroll happens

  const recommendationsHeading = page.getByRole("heading", { name: "Рекомендации" });
  const recommendationsLink = nav.getByRole("link", { name: "Рекомендации" });
  // Real wheel input, not a scripted scrollIntoView — Lenis intercepts
  // wheel/touch to drive its own smooth scroll, so this is what actually
  // exercises the ScrollTrigger callbacks the mini-nav's highlight depends
  // on (a script-driven jump could bypass Lenis's own scroll pipeline).
  // Polls aria-current itself, not Playwright's isVisible() — that check
  // only cares about display/visibility, not computed opacity, so it
  // would report "visible" even at this section's pre-reveal opacity: 0.
  await page.mouse.move(720, 450);
  for (let i = 0; i < 40; i++) {
    if ((await recommendationsLink.getAttribute("aria-current")) === "true") break;
    await page.mouse.wheel(0, 800);
  }
  await expect(recommendationsLink).toHaveAttribute("aria-current", "true");
  await expect(recommendationsHeading).toBeVisible();
  // opacity is a compositing effect, not an inherited computed style, so
  // this checks the actual element GSAP sets it on (data-reveal-content)
  // rather than the heading inside it, which would always read back "1".
  await expect(page.locator("#recommendations [data-reveal-content]")).toHaveCSS(
    "opacity",
    "1",
  );

  // --- share URL: same score renders in a brand-new browser context ----
  resultsUrl = page.url(); // module-level — reused by the reduced-motion test below
  const shareContext = await browser.newContext();
  const sharePage = await shareContext.newPage();
  await sharePage.goto(resultsUrl);
  await expect(sharePage.locator("#score svg text")).toHaveText("85,1");
  await expect(sharePage.getByRole("heading", { level: 1 })).toHaveText("Сильное состояние");
  await shareContext.close();

  // --- /methodology: the trust wedge's public face, generated from engine
  // truth (apps/api/scripts/export_methodology.py) — a known ratio formula
  // and the Damodaran benchmark citation must both actually render.
  await page.goto("/methodology");
  await expect(
    page.getByText("current_assets / current_liabilities", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Damodaran (NYU Stern), Jan 2026", { exact: false }).first(),
  ).toBeVisible();

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

test("landing under prefers-reduced-motion: the wordmark boots instantly (no animation to wait out), and the offer/demo/CTA are all immediately visible", async ({
  browser,
}) => {
  // Playwright's reducedMotion context option emulates prefers-reduced-motion:
  // reduce end-to-end — the same media feature igniteSequence's own
  // getPrefersReducedMotion() reads before ever building a gsap.timeline.
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Финансовая диагностика вашей компании",
  );

  // Reduced motion: igniteSequence sets every one of the wordmark's "on"
  // segments to data-lit="true" synchronously at effect time — asserted
  // immediately, not polled, since there's no animation step to wait out.
  // A segment outside the letter's own shape (e.g. "a" for lowercase "n")
  // has no data-segment-on attribute at all and stays permanently ghost —
  // "designed absence," not a bug — so this only checks the segments that
  // ARE meant to light.
  const wordmark = page.getByTestId("hero-wordmark");
  await expect(wordmark).toBeVisible();
  await expect(wordmark.locator('[data-segment-on][data-lit="false"]')).toHaveCount(0);
  await expect(wordmark.locator('[data-segment-on][data-lit="true"]').first()).toBeAttached();

  await expect(page.getByRole("link", { name: "Проверить компанию" })).toBeVisible();
  await expect(page.getByText("ДЕМО-ДАННЫЕ")).toBeVisible();

  await context.close();
});

test("results page under prefers-reduced-motion: every section is already visible, no scroll required, and the mini-nav still works via native anchors", async ({
  browser,
}) => {
  test.skip(!resultsUrl, "requires resultsUrl from the preceding flow test");

  // Playwright's reducedMotion context option emulates
  // prefers-reduced-motion: reduce end-to-end — the same media feature
  // getPrefersReducedMotion()/usePrefersReducedMotion() read, and the same
  // one this app's useGSAP guards on before any gsap.set ever runs.
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(resultsUrl);

  // No scroll happens below this line — every section must already be
  // visible from the unscrolled load.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Сильное состояние");
  await expect(page.getByRole("heading", { name: "Категории" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Коэффициенты" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Риск-радар" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Что если?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Рекомендации" })).toBeVisible();

  // The what-if simulator itself, real-browser end to end: a real keyboard
  // interaction (Home jumps a native range input to its `min`, -0.5 for
  // this lever) recomputes the changed-ratios list without any network
  // call (offline-safe by construction — lib/simulator never fetches).
  // getByRole (not getByLabel) — the ratio detail disclosures further down
  // the page also have a ConfidenceMeter labeled "Уверенность извлечения:
  // Процентный долг", which getByLabel's substring matching would also hit.
  const whatIfSection = page.locator("#what-if");
  const debtSlider = page.getByRole("slider", { name: "Процентный долг" });
  await debtSlider.focus();
  await debtSlider.press("Home");
  // Scoped to #what-if — "Interest Coverage" also appears in the ratio
  // list and the risks summary elsewhere on the page.
  await expect(whatIfSection.getByText("Interest Coverage")).toBeVisible();
  await whatIfSection.getByRole("button", { name: "Сбросить" }).click();
  await expect(whatIfSection.getByText("Пока нет изменений")).toBeVisible();

  // The mini-nav is still functional: with no Lenis instance (reduced
  // motion never constructs one), clicking falls through to the native
  // #id anchor jump.
  await page
    .getByRole("navigation", { name: "Навигация по разделам отчёта" })
    .getByRole("link", { name: "Рекомендации" })
    .click();
  await expect(page).toHaveURL(/#recommendations$/);

  await context.close();
});

test("narrative 503 (no LLM key configured): the section collapses entirely, and the document's downstream sections — including the disclaimer — still reveal on scroll (fix-wave F1)", async ({
  browser,
}) => {
  test.skip(!resultsUrl, "requires resultsUrl from the preceding flow test");

  // Real motion (no reducedMotion override) — this is exactly the
  // regression F1 fixes: results-document.tsx's useGSAP effect used to
  // build every section's ScrollTrigger once and never re-run, so the
  // narrative section collapsing out of the document (this 503) left
  // every ScrollTrigger below it computed against the old, taller layout.
  // Reduced motion never builds a ScrollTrigger at all, so it can't
  // exercise this bug.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Intercepted at the browser network layer — never reaches the real API
  // — the same {code, message} 503 shape apps/api/app/main.py raises when
  // no LLM key is configured server-side (lib/api.ts's readDetail unwraps
  // `detail.message`).
  await page.route("**/api/analysis/*/narrative*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        detail: {
          code: "narrative_unavailable",
          message: "Пояснение аналитика недоступно: ключ OPENAI_API_KEY не настроен.",
        },
      }),
    }),
  );

  await page.goto(resultsUrl);

  // Scroll just enough to reveal "Категории" — the first section below
  // the score header — and wait for its tween to fully settle. This is
  // the "already-visible section" the round-3 no-flicker check below
  // needs as its precondition: a section revealed before the narrative
  // collapse happens, not one still waiting on its own first scroll.
  const categoriesContent = page.locator("#categories [data-reveal-content]");
  await page.mouse.move(720, 450);
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, 400);
  }
  await expect(categoriesContent).toHaveCSS("opacity", "1");

  // fix-wave round 3 (F1 completion): with the narrative section about
  // to collapse, results-document.tsx's useGSAP re-syncs (revert +
  // rebuild) every section's ScrollTrigger, including this
  // already-revealed categories section. Pre-fix, that re-sync
  // unconditionally re-hid every section (gsap.set opacity: 0) before
  // recreating its trigger, which then fired immediately (already past
  // its "top 75%" activation point) and re-animated back up — a visible
  // hide-then-refade flicker with no user-facing cause. Samples computed
  // opacity every animation frame for ~600ms (matching MOTION.reveal's
  // own tween duration), started concurrently with the click — a
  // post-hoc single check couldn't catch a dip that resolves within one
  // tween's length.
  const opacitySamplingPromise = page.evaluate(() => {
    const el = document.querySelector("#categories [data-reveal-content]");
    let min = 1;
    const start = performance.now();
    return new Promise<number>((resolve) => {
      function sample() {
        if (el) {
          const opacity = parseFloat(getComputedStyle(el).opacity);
          if (opacity < min) min = opacity;
        }
        if (performance.now() - start < 600) {
          requestAnimationFrame(sample);
        } else {
          resolve(min);
        }
      }
      requestAnimationFrame(sample);
    });
  });

  await page.getByRole("button", { name: "Сформировать пояснение" }).click();

  const minOpacityDuringCollapse = await opacitySamplingPromise;
  expect(minOpacityDuringCollapse).toBeGreaterThanOrEqual(0.99);

  // Designed-absence collapse: the whole section — heading and mini-nav
  // anchor alike — disappears, not just the button. Full label, not
  // exact:true "Заключение": the score section's own nav link is also
  // labeled "Заключение" (the same word for "verdict"/"conclusion") and
  // would otherwise match too — see the main flow test's identical note.
  await expect(page.getByRole("heading", { name: "Заключение аналитика" })).not.toBeVisible();
  const nav = page.getByRole("navigation", { name: "Навигация по разделам отчёта" });
  await expect(nav.getByRole("link", { name: "Заключение аналитика" })).not.toBeVisible();

  // Scroll to the very bottom — the disclaimer is the document's last
  // section. Same real-wheel-input pattern as the main flow test's own
  // cinema check (Lenis intercepts wheel/touch, so a scripted jump
  // wouldn't exercise the same ScrollTrigger callbacks). Unlike that
  // test's mid-document target, this doesn't poll-and-break early: Lenis
  // clamps at the max scroll distance, so firing every wheel event
  // unconditionally overshoots harmlessly and reliably lands at the
  // bottom — breaking early on isVisible() (bounding-box only, not
  // opacity) risked stopping the moment the section's top edge merely
  // entered the viewport, before its ScrollTrigger's "top 75%" threshold
  // was actually crossed.
  await page.mouse.move(720, 450);
  const disclaimerHeading = page.getByRole("heading", { name: "Дисклеймер" });
  for (let i = 0; i < 60; i++) {
    await page.mouse.wheel(0, 800);
  }
  await expect(disclaimerHeading).toBeVisible();
  // isVisible() only checks display/visibility, not computed opacity — the
  // actual regression (F1) was a section stuck at GSAP's pending-reveal
  // opacity: 0 because its ScrollTrigger's onEnter never fired. Check the
  // element GSAP actually animates, not the heading inside it (which would
  // always read back "1" regardless).
  const disclaimerContent = page.locator("[data-reveal-content]").filter({ has: disclaimerHeading });
  await expect(disclaimerContent).toHaveCSS("opacity", "1");

  await context.close();
});
