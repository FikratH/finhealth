import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ResultsDocument, revealAlreadyInView } from "@/components/results/results-document";
import ruMessages from "@/messages/ru.json";
import enMessages from "@/messages/en.json";
import type { AnalysisResult, ExtractedValue } from "@/lib/api-types";

// Only the "narrative-driven scroll-cinema re-sync" describe block below
// clicks the generate button — every other test in this file never touches
// @/lib/api at all, so mocking it here is harmless to the rest of the
// suite. ApiError is used for its own `instanceof` branch inside
// AnalystNarrative, so importOriginal keeps the real class.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, generateNarrative: vi.fn() };
});

import { ApiError, generateNarrative } from "@/lib/api";

// The scroll cinema (Task 2) runs real GSAP/ScrollTrigger against whatever
// window.matchMedia reports. This file's existing tests are about
// *content* (data correctness, RU formatting, conditional sections) —
// none of them care about motion — so the suite defaults to reduced
// motion (matches: true) for every test: useGSAP's guard then returns
// before any gsap.set ever runs, so nothing is hidden and every assertion
// below can query rendered content directly, exactly as it did before
// Task 2. Tests that specifically exercise the motion-enabled path
// override this locally (see "the scroll cinema" describe block).
function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  mockMatchMedia(true);
});

// Trimmed inline fixture — cut down from
// apps/api/demo/expected_analysis_example.json to a subset that still
// touches every branch this test cares about (a money-unit ratio, a
// Damodaran-sourced benchmark shared by two ratios, a null-benchmark
// ratio, the full risk_radar). All numbers/strings below are copied
// verbatim from that file — none are invented.
const analysisFixture: AnalysisResult = {
  analysis_id: "cedf225ea5764a50bec0d697b87c35d5",
  created_at: "2026-08-26T23:47:30.914082+00:00",
  industry: "manufacturing",
  industry_name: "Производство",
  industry_name_en: "Manufacturing",
  currency: "KZT",
  scale: "thousands",
  latest_period: "2024",
  previous_period: "2023",
  overall_score: 85.1,
  health_label: "Сильное состояние",
  category_scores: [
    { category: "liquidity", label: "Ликвидность", score: 88.8, weight: 0.2, ratios_used: 4 },
    { category: "leverage", label: "Долговая нагрузка", score: 73.1, weight: 0.25, ratios_used: 4 },
    { category: "profitability", label: "Рентабельность", score: 89.8, weight: 0.2, ratios_used: 5 },
    { category: "efficiency", label: "Операционная эффективность", score: 86.7, weight: 0.2, ratios_used: 4 },
    { category: "cashflow", label: "Денежные потоки", score: 91.6, weight: 0.15, ratios_used: 2 },
    { category: "market", label: "Рыночная оценка", score: null, weight: 0.0, ratios_used: 0 },
  ],
  ratios: [
    {
      key: "current_ratio",
      name: "Current Ratio",
      category: "liquidity",
      formula: "current_assets / current_liabilities",
      inputs: { current_assets: 808750000.0, current_liabilities: 486200000.0 },
      substitution:
        "current_assets / current_liabilities  →  current_assets = 808 750 000 ; current_liabilities = 486 200 000",
      value: 1.6634101192924722,
      unit: "x",
      status: "good",
      score: 92.0,
      benchmark: {
        ratio: "current_ratio",
        weight: 1.0,
        direction: "range",
        good: [1.5, 3.0],
        acceptable: [1.1, 4.0],
        note: "",
        source: "",
      },
      explanation:
        "Значение 1.66. Демонстрационный отраслевой диапазон: 1.5–3. Вывод: в пределах отраслевого ориентира.",
      applicable: true,
      warnings: [],
    },
    {
      key: "debt_to_equity",
      name: "Debt-to-Equity",
      category: "leverage",
      formula: "total_debt / shareholders_equity",
      inputs: { total_debt: 540000000.0, shareholders_equity: 1430600000.0 },
      substitution:
        "total_debt / shareholders_equity  →  total_debt = 540 000 000 ; shareholders_equity = 1 430 600 000",
      value: 0.37746400111841183,
      unit: "x",
      status: "attention",
      score: 73.7,
      benchmark: {
        ratio: "debt_to_equity",
        weight: 1.2,
        direction: "lower",
        good: [0.0, 0.303],
        acceptable: [0.0, 0.5006],
        note: "Ориентир основан на рыночном D/E отрасли (Damodaran), а не балансовом.",
        source: "Damodaran (NYU Stern), Jan 2026",
      },
      explanation:
        "Значение 0.38. Отраслевой ориентир (источник: Damodaran (NYU Stern), Jan 2026, данные 2026-01): ≤ 0.303. Вывод: вне желательного диапазона — требует внимания. Ориентир основан на рыночном D/E отрасли (Damodaran), а не балансовом.",
      applicable: true,
      warnings: [],
    },
    {
      key: "net_margin",
      name: "Net Profit Margin",
      category: "profitability",
      formula: "net_income / revenue",
      inputs: { net_income: 148500000.0, revenue: 3245900000.0 },
      substitution: "net_income / revenue  →  net_income = 148 500 000 ; revenue = 3 245 900 000",
      value: 4.5750023106072275,
      unit: "%",
      status: "good",
      score: 88.1,
      benchmark: {
        ratio: "net_margin",
        weight: 1.0,
        direction: "higher",
        good: [3.7267, 7.8918],
        acceptable: [1.973, 10.5225],
        note: "",
        source: "Damodaran (NYU Stern), Jan 2026",
      },
      explanation:
        "Значение 4.58%. Отраслевой ориентир (источник: Damodaran (NYU Stern), Jan 2026, данные 2026-01): 3.7267–7.8918%. Вывод: в пределах отраслевого ориентира.",
      applicable: true,
      warnings: [],
    },
    {
      key: "net_debt",
      name: "Net Debt",
      category: "leverage",
      formula: "total_debt - cash",
      inputs: { total_debt: 540000000.0, cash: 185400000.0 },
      substitution: "total_debt - cash  →  total_debt = 540 000 000 ; cash = 185 400 000",
      value: 354600000.0,
      unit: "money",
      status: "na",
      score: null,
      benchmark: null,
      explanation: "Справочная величина, не участвует в балльной оценке.",
      applicable: true,
      warnings: [],
    },
    {
      key: "altman_z",
      name: "Altman Z′ (частная компания, без X2)",
      category: "leverage",
      formula: "0.717·(WC/TA) + 3.107·(EBIT/TA) + 0.420·(BVE/TL) + 0.998·(Rev/TA)",
      inputs: {
        working_capital: 322550000.0,
        total_assets: 2456800000.0,
        ebit: 356400000.0,
        equity_or_market_cap: 1430600000.0,
        total_liabilities: 1026200000.0,
        revenue: 3245900000.0,
      },
      substitution: "",
      value: 2.4489157601331915,
      unit: "x",
      status: "attention",
      score: null,
      benchmark: null,
      explanation:
        "Ориентиры модели: > 2.9 — безопасная зона, 1.23–2.9 — серая зона, < 1.23 — зона риска. Компонент X2 исключён (нераспределённая прибыль не извлекается); значение занижено.",
      applicable: true,
      warnings: ["Упрощённый расчёт: без компонента X2."],
    },
  ],
  strengths: [
    "Current Ratio: 1.66 — Значение 1.66. Демонстрационный отраслевой диапазон: 1.5–3.",
    "Liabilities-to-Equity: 0.72 — Значение 0.72. Демонстрационный отраслевой диапазон: ≤ 1.8.",
  ],
  risks: ["Interest Coverage: 2.40 — вне отраслевого ориентира."],
  recommendations: [
    {
      problem: "Долговая нагрузка относительно собственного капитала выше отраслевого ориентира.",
      ratio: "Debt-to-Equity",
      current_value: 0.38,
      benchmark_hint: "желательно ≤ 0.303 (демо-диапазон)",
      action:
        "Рассмотреть постепенное снижение долга за счёт свободного денежного потока, рефинансирование дорогого долга, продажу непрофильных активов; как вариант — привлечение нового акционерного капитала.",
      expected_effect: "Снижение процентных расходов и финансового риска.",
      tradeoffs:
        "Выпуск новых акций может снизить долговую нагрузку, но приводит к размыванию долей действующих акционеров; продажа активов может сократить будущие доходы.",
      priority: "high",
      difficulty: "high",
    },
    {
      problem: "Операционная прибыль слабо покрывает процентные расходы.",
      ratio: "Interest Coverage",
      current_value: 2.4,
      benchmark_hint: "желательно 4.9068–10.3909 (демо-диапазон)",
      action:
        "Рефинансировать дорогой долг по более низкой ставке и/или работать над операционной маржинальностью (пересмотр расходов, цен, ассортимента).",
      expected_effect: "Рост запаса прочности по обслуживанию долга.",
      tradeoffs:
        "Рефинансирование может потребовать залогов и ковенант; сокращение расходов способно затронуть развитие.",
      priority: "high",
      difficulty: "high",
    },
  ],
  warnings: [
    { code: "altman_z", message: "Упрощённый расчёт: без компонента X2." },
    {
      code: "market",
      message:
        "Рыночные данные отсутствуют — рыночные мультипликаторы (P/E, P/B, EV/EBITDA) не рассчитывались.",
    },
  ],
  confidence: {
    total: 95.3,
    data_completeness: 95.0,
    extraction_confidence: 95.0,
    manual_corrections: 0,
    has_previous_period: true,
    has_industry_benchmarks: true,
    audited: true,
    notes: ["В документе обнаружено упоминание аудита отчётности."],
  },
  missing_metrics: ["EBITDA", "Количество акций", "Прибыль на акцию (EPS)"],
  risk_radar: {
    altman: {
      key: "altman_z",
      name: "Altman Z′ (частная компания, без X2)",
      category: "leverage",
      formula: "0.717·(WC/TA) + 3.107·(EBIT/TA) + 0.420·(BVE/TL) + 0.998·(Rev/TA)",
      inputs: {
        working_capital: 322550000.0,
        total_assets: 2456800000.0,
        ebit: 356400000.0,
        equity_or_market_cap: 1430600000.0,
        total_liabilities: 1026200000.0,
        revenue: 3245900000.0,
      },
      substitution: "",
      value: 2.4489157601331915,
      unit: "x",
      status: "attention",
      score: null,
      benchmark: null,
      explanation:
        "Ориентиры модели: > 2.9 — безопасная зона, 1.23–2.9 — серая зона, < 1.23 — зона риска. Компонент X2 исключён (нераспределённая прибыль не извлекается); значение занижено.",
      applicable: true,
      warnings: ["Упрощённый расчёт: без компонента X2."],
    },
    piotroski: {
      score: 6,
      max: 7,
      signals: [
        {
          key: "roa_positive",
          name: "Положительная рентабельность активов",
          value: true,
          detail: "ROA = 148 500 000 / 2 377 650 000 = 0.0625 (> 0).",
        },
        {
          key: "cfo_positive",
          name: "Положительный операционный денежный поток",
          value: true,
          detail: "OCF = 287 300 000 (> 0).",
        },
        {
          key: "roa_improved",
          name: "Рост рентабельности активов",
          value: true,
          detail:
            "ROA(тек.) = 148 500 000/2 456 800 000 = 0.0604; ROA(пред.) = 118 300 000/2 298 500 000 = 0.0515. Использованы активы на конец периода (не средние).",
        },
        {
          key: "accruals",
          name: "Операционный денежный поток превышает чистую прибыль",
          value: true,
          detail: "OCF (287 300 000) > NI (148 500 000).",
        },
        {
          key: "leverage_down",
          name: "Снижение долговой нагрузки",
          value: null,
          detail:
            "Долгосрочный долг не указан ни за один период — сигнал не рассчитывается (значение не приравнивается к нулю).",
        },
        {
          key: "liquidity_up",
          name: "Рост текущей ликвидности",
          value: false,
          detail: "Текущая ликвидность: 1.6634 (тек. период) vs 1.7385 (пред. период).",
        },
        {
          key: "no_dilution",
          name: "Отсутствие размытия акций",
          value: null,
          detail: "Не рассчитано: отсутствуют данные — количество акций в обращении. (текущий и/или предыдущий период)",
        },
        {
          key: "gross_margin_up",
          name: "Рост валовой рентабельности",
          value: true,
          detail: "Валовая маржа: 0.3003 (тек.) vs 0.2896 (пред.).",
        },
        {
          key: "turnover_up",
          name: "Рост оборачиваемости активов",
          value: true,
          detail: "Оборачиваемость активов: 1.3212 (тек.) vs 1.2997 (пред.).",
        },
      ],
      interpretation: "F-Score 6/7 — высокая фундаментальная устойчивость (по 7 из 9 доступных сигналов).",
    },
    beneish: {
      m_score: null,
      indices: {
        DSRI: 0.8212053047859702,
        GMI: 0.9642564459417832,
        AQI: null,
        SGI: 1.0865300930575081,
        DEPI: null,
        SGAI: null,
        LVGI: null,
        TATA: -0.056496255291436016,
      },
      flag: null,
      substituted: [],
      interpretation:
        "M-Score Бениша не рассчитан: доступно 4 из 8 индексов (требуется минимум 6). Не удалось вычислить: AQI (индекс качества активов), DEPI (индекс нормы амортизации), SGAI (индекс коммерческих и управленческих расходов), LVGI (индекс долговой нагрузки).",
    },
    dupont: {
      net_margin: 4.5750023106072275,
      asset_turnover: 1.3651714928605976,
      equity_multiplier: 1.776088742810189,
      roe: 11.092851273623666,
    },
  },
  // Provenance (Plan 4 / Task 3): three source_values, copied verbatim in
  // shape from apps/api/demo/expected_analysis_example.json's entries for
  // these metrics (figures adjusted to match this trimmed fixture's own
  // ratio.inputs numbers above). current_assets matches current_ratio;
  // total_debt matches both debt_to_equity and net_debt (shared-source
  // case) and is manually_edited; revenue matches both net_margin and
  // altman_z.
  source_values: [
    {
      metric: "current_assets",
      original_label: "Оборотные активы",
      value: 808750000.0,
      currency: "KZT",
      scale: "units",
      period: "2024",
      source: "CSV, строка 4",
      confidence: 96,
      snippet: "Оборотные активы | 808 750 | 767 900",
      manually_edited: false,
    },
    {
      metric: "total_debt",
      original_label: "Процентный долг",
      value: 540000000.0,
      currency: "KZT",
      scale: "units",
      period: "2024",
      source: "CSV, строка 14",
      confidence: 80,
      snippet: "Процентный долг | 540 000 | 610 000",
      manually_edited: true,
    },
    {
      metric: "revenue",
      original_label: "Выручка от реализации",
      value: 3245900000.0,
      currency: "KZT",
      scale: "units",
      period: "2024",
      source: "CSV, строка 2",
      confidence: 98,
      snippet: "Выручка от реализации | 3 245 900 | 2 987 400",
      manually_edited: false,
    },
  ] as ExtractedValue[],
  disclaimer:
    "Сервис не заменяет профессиональную финансовую консультацию. Часть отраслевых ориентиров основана на данных Damodaran (NYU Stern, янв. 2026); для Казахстана дополнительно показан ориентир по данным Нацбанка РК / МВФ (Индикаторы финансовой устойчивости), где для этого нашёлся официальный публичный источник; остальные ориентиры являются демонстрационными и помечены соответствующим образом.",
};

function renderDocument(analysis: AnalysisResult) {
  return render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <ResultsDocument analysis={analysis} locale="ru" />
    </NextIntlClientProvider>,
  );
}

describe("ResultsDocument", () => {
  it("renders the overall score and verdict, RU-formatted", () => {
    renderDocument(analysisFixture);
    // The score renders as a SegmentDisplay (a CSS clip-path mask, not a
    // text node) — its accessible name combines the RU-formatted value with
    // a metric-naming caption ("Общий балл"/"Overall score"), never the
    // verdict itself: the verdict is already announced by the sr-only <h1>
    // below, so the score's own name doesn't repeat it a third time
    // (review finding 9), while still reading as more than a bare number
    // (review finding N2).
    expect(screen.getByRole("img", { name: "85,1 — Общий балл" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Сильное состояние" }),
    ).toBeInTheDocument();
    // Named once (finish review, material_fixes 5): AnnunciatorCell sits
    // beside the h1 rendering the same verdict text, but score-header.tsx
    // wraps it aria-hidden — the h1 is the only element that exposes
    // "Сильное состояние" as an accessible name.
    expect(screen.queryByRole("img", { name: "Сильное состояние" })).not.toBeInTheDocument();
  });

  it("renders a known ratio row (net_margin) with its RU-formatted value and a Damodaran footnote", () => {
    renderDocument(analysisFixture);
    // Scoped to the ratio row itself: the same 4.5750023106072275 value
    // also drives the DuPont decomposition's net-margin factor further
    // down the page, so an unscoped query would be ambiguous.
    const row = screen.getByText("Net Profit Margin").closest("div") as HTMLElement;
    expect(within(row).getByText("4,58%")).toBeInTheDocument();

    // debt_to_equity and net_margin share the same benchmark.source, so it
    // appears once in the footnotes list, numbered by first appearance —
    // scoped there since the same source string is also embedded in each
    // ratio's own explanation prose.
    const footnotesSection = screen.getByText("Источники ориентиров").closest("section") as HTMLElement;
    const footnote = within(footnotesSection).getByText(/Damodaran \(NYU Stern\), Jan 2026/);
    expect(footnote.closest("li")).toHaveAttribute("id");
  });

  it("shows a money-unit ratio (net_debt) as «Справочно» rather than a status pill", () => {
    renderDocument(analysisFixture);
    expect(screen.getByText("Справочно")).toBeInTheDocument();
  });

  it("renders the Altman model's full API name and its zone explanation, not a generic label", () => {
    // Regression: the risk-radar card used to show the static, generic
    // "Альтман Z" heading and dropped the API's own name/explanation
    // entirely — which is where the private-company caveat (no X2
    // component) lives. Scoped to the risk-radar section: the same
    // altman_z ratio also renders in the main ratios list via RatioRow,
    // which shows ratio.name too — an unscoped query would be ambiguous.
    renderDocument(analysisFixture);
    // Query by heading role, not text: the mini-nav's own anchor repeats
    // this same label ("Риск-радар"), so an unscoped getByText would match
    // both it and the section's actual <h2>.
    const radarSection = screen
      .getByRole("heading", { name: ruMessages.Results.riskRadar.heading })
      .closest("section") as HTMLElement;
    expect(
      within(radarSection).getByText("Altman Z′ (частная компания, без X2)"),
    ).toBeInTheDocument();
    expect(
      within(radarSection).getByText(analysisFixture.risk_radar!.altman!.explanation),
    ).toBeInTheDocument();
  });

  it("renders the Piotroski score as score/max", () => {
    renderDocument(analysisFixture);
    expect(screen.getByText("6/7")).toBeInTheDocument();
  });

  it("renders a priority-sorted recommendation card with its tradeoffs visible (not behind a toggle)", () => {
    renderDocument(analysisFixture);
    expect(
      screen.getByText(analysisFixture.recommendations[0].tradeoffs),
    ).toBeVisible();
    expect(
      screen.getByText(analysisFixture.recommendations[1].tradeoffs),
    ).toBeVisible();
  });

  it("renders the API disclaimer verbatim — beneath the verdict, and again as the closing disclaimer section", () => {
    renderDocument(analysisFixture);
    expect(screen.getAllByText(analysisFixture.disclaimer)).toHaveLength(2);
  });

  it("labels each DuPont factor (net margin / asset turnover / equity multiplier / ROE), not four bare numbers", () => {
    renderDocument(analysisFixture);
    expect(screen.getByText(ruMessages.Results.riskRadar.dupont.netMargin)).toBeInTheDocument();
    expect(screen.getByText(ruMessages.Results.riskRadar.dupont.assetTurnover)).toBeInTheDocument();
    expect(
      screen.getByText(ruMessages.Results.riskRadar.dupont.equityMultiplier),
    ).toBeInTheDocument();
    expect(screen.getByText(ruMessages.Results.riskRadar.dupont.roe)).toBeInTheDocument();
  });

  it("renders the confidence breakdown, including the engine's own audit note", () => {
    renderDocument(analysisFixture);
    // The disclosure is a <details>; its content is present in the DOM
    // (queryable) regardless of the native open/closed collapse state.
    expect(
      screen.getByText(analysisFixture.confidence.notes[0]),
    ).toBeInTheDocument();
    // ConfidenceMeter exposes its label via aria-label on role="meter",
    // not as visible text — query accordingly.
    expect(
      screen.getByRole("meter", {
        name: ruMessages.Results.header.confidence.dataCompletenessLabel,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(ruMessages.Results.header.confidence.auditedYes),
    ).toBeInTheDocument();
  });

  it("renders the insufficient-data state when overall_score is null: dash dial, health_label, composed missing-metrics guidance, and no duplicate missing-metrics section", () => {
    const nullScoreFixture: AnalysisResult = {
      ...analysisFixture,
      overall_score: null,
      health_label: "Недостаточно данных для оценки",
    };
    renderDocument(nullScoreFixture);

    const heading = screen.getByRole("heading", {
      level: 1,
      name: "Недостаточно данных для оценки",
    });
    expect(heading).toBeInTheDocument();

    const header = heading.closest("section") as HTMLElement;
    // No fabricated number: the score renders as ghost segment cells (never
    // hidden, never faked as 0), and its accessible name composes the
    // shared «Н/Д» absence token with the metric-naming caption ("Н/Д —
    // Общий балл") — the absence itself is announced, not silently
    // collapsed into the bare metric name (review finding N4) — while the
    // verdict stays announced solely by the sr-only <h1> above, never
    // repeated through the score's own name (review findings 9 and N2).
    expect(
      within(header).getByRole("img", { name: "Н/Д — Общий балл" }),
    ).toBeInTheDocument();
    for (const metric of nullScoreFixture.missing_metrics) {
      expect(within(header).getByText(metric)).toBeInTheDocument();
    }
    // Named once here too — AnnunciatorCell's own accessible name stays
    // hidden even in the insufficient-data state.
    expect(
      within(header).queryByRole("img", { name: nullScoreFixture.health_label }),
    ).not.toBeInTheDocument();

    // The standalone MissingMetricsHint section is skipped when the
    // header's own insufficient-data panel already lists the same metrics.
    expect(
      screen.queryByText(ruMessages.Results.missingMetrics.heading),
    ).not.toBeInTheDocument();
  });
});

describe("ResultsDocument — provenance trace (Plan 4 / Task 3)", () => {
  it("renders a matched input's document wording, source line, and snippet inside its ratio's detail disclosure", () => {
    renderDocument(analysisFixture);
    // Every ratio with a sourced input gets its own "Происхождение" block,
    // so scope to current_ratio's own row (its only sourced input is
    // current_assets) rather than asserting on the heading text globally.
    const row = screen.getByText("Current Ratio").closest("div")!.parentElement as HTMLElement;
    expect(within(row).getByText(ruMessages.Results.ratios.provenanceHeading)).toBeInTheDocument();
    expect(within(row).getByText("«Оборотные активы»")).toBeInTheDocument();
    expect(within(row).getByText("CSV, строка 4")).toBeInTheDocument();
    expect(within(row).getByText("«Оборотные активы | 808 750 | 767 900»")).toBeInTheDocument();
    expect(
      within(row).getByRole("meter", {
        name: ruMessages.Results.ratios.provenanceConfidenceLabel.replace(
          "{metric}",
          "Оборотные активы",
        ),
      }),
    ).toBeInTheDocument();
  });

  it("shows the manually-edited badge — never a confidence meter — for a manually_edited source value, once per ratio that cites it", () => {
    renderDocument(analysisFixture);
    // total_debt is manually_edited and feeds two ratios' inputs
    // (debt_to_equity and net_debt) — the same source_values entry powers
    // both rows' traces independently.
    expect(
      screen.getAllByText(ruMessages.Results.ratios.provenanceManuallyEdited),
    ).toHaveLength(2);
  });

  it("labels an input with no matching source_values entry as a computed value, not a document citation", () => {
    renderDocument(analysisFixture);
    // altman_z's working_capital/ebit/equity_or_market_cap/total_liabilities
    // inputs have no source_values counterpart (only its `revenue` input
    // does) — each renders the derived label instead of a trace.
    expect(
      screen.getAllByText(ruMessages.Results.ratios.provenanceDerived).length,
    ).toBeGreaterThanOrEqual(4);
  });

  it("renders no provenance section anywhere, and does not crash, for an analysis stored before source_values existed", () => {
    const oldFixture: AnalysisResult = { ...analysisFixture, source_values: undefined };
    expect(() => renderDocument(oldFixture)).not.toThrow();
    expect(
      screen.queryByText(ruMessages.Results.ratios.provenanceHeading),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("«Оборотные активы»")).not.toBeInTheDocument();
  });
});

describe("ResultsDocument — the scroll cinema", () => {
  function getNav() {
    return screen.getByRole("navigation", { name: ruMessages.Results.nav.railLabel });
  }

  it("renders one mini-nav anchor per present section, each pointing at that section's id", () => {
    renderDocument(analysisFixture);

    const links = within(getNav()).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "#score",
      "#categories",
      "#ratios",
      "#risk-radar",
      "#strengths-risks",
      "#recommendations",
      "#narrative",
    ]);
    expect(
      within(getNav()).getByRole("link", { name: ruMessages.Results.nav.score }),
    ).toBeInTheDocument();
    expect(
      within(getNav()).getByRole("link", { name: ruMessages.Results.riskRadar.heading }),
    ).toBeInTheDocument();
  });

  it("omits mini-nav anchors for sections the analysis doesn't have", () => {
    const noExtrasFixture: AnalysisResult = {
      ...analysisFixture,
      risk_radar: undefined,
      strengths: [],
      risks: [],
      recommendations: [],
    };
    renderDocument(noExtrasFixture);

    const links = within(getNav()).getAllByRole("link");
    // "#narrative" still appears here even though this fixture has no
    // extras: unlike the other conditional sections, AnalystNarrative's
    // visibility is a client-side interaction state (idle → generate →
    // prose, or 503 → hidden), not something derived from the analysis
    // payload's own fields — see analyst-narrative.test.tsx for its own
    // show/hide behavior.
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "#score",
      "#categories",
      "#ratios",
      "#narrative",
    ]);
  });

  it("marks the заключение as aria-current on initial render, before any scroll has happened", () => {
    renderDocument(analysisFixture);

    const links = within(getNav()).getAllByRole("link");
    const current = links.filter((link) => link.getAttribute("aria-current") === "true");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute("href", "#score");
  });

  it("under prefers-reduced-motion, never calls gsap.set — every reveal-wrapped section stays at its rendered, fully visible state", () => {
    // beforeEach already mocks matches: true (reduced motion) for this
    // whole file; re-assert it explicitly here since this test's whole
    // point is the reduced-motion contract.
    mockMatchMedia(true);
    const setSpy = vi.spyOn(gsap, "set");

    renderDocument(analysisFixture);

    expect(setSpy).not.toHaveBeenCalled();
    // A representative sample from a RevealSection-wrapped block: still
    // visible, not held at opacity: 0 waiting for a scroll trigger that
    // reduced motion guarantees will never fire.
    expect(screen.getByText(analysisFixture.recommendations[0].tradeoffs)).toBeVisible();

    setSpy.mockRestore();
  });

  it("SSR/SEO guard — with motion enabled, every section's text is still present in the DOM while the reveal-hidden state is active (reveals are style-only, never content-hiding)", () => {
    mockMatchMedia(false); // motion enabled: useGSAP's gsap.set(opacity: 0) runs for every section below the заключение
    renderDocument(analysisFixture);

    // Sampled once per document block, in document order — none of these
    // depend on toBeVisible(); a crawler or no-JS visitor reads exactly
    // this same markup, opacity and all. Headings are queried by role
    // (not text) where the mini-nav repeats the same label as an <a>.
    expect(
      screen.getByRole("heading", { name: ruMessages.Results.categories.heading }),
    ).toBeInTheDocument();
    expect(screen.getByText("Net Profit Margin")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: ruMessages.Results.riskRadar.heading }),
    ).toBeInTheDocument();
    expect(screen.getByText(analysisFixture.strengths[0])).toBeInTheDocument();
    expect(screen.getByText(analysisFixture.risks[0])).toBeInTheDocument();
    expect(screen.getByText(analysisFixture.recommendations[0].action)).toBeInTheDocument();
    // The disclaimer body renders twice (beneath the verdict, and again as
    // the closing section) — assert the closing section's own heading
    // instead of the (duplicated) body text.
    expect(
      screen.getByRole("heading", { name: ruMessages.Results.disclaimer.heading }),
    ).toBeInTheDocument();
  });
});

describe("ResultsDocument — mount scroll reset (review round 2, finding N1)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // Object.defineProperty isn't a vi mock — restoreAllMocks doesn't
    // touch it, so window.scrollY would otherwise stay pinned at 500 for
    // every later test in this file (jsdom's window is shared process-
    // wide, not reset between tests) and quietly change other tests'
    // "already at the top" assumptions.
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });

  // PerformanceNavigationTiming describes how the *document* was loaded,
  // not how this route was reached — a client-side transition never
  // creates a new navigation entry, so after a reload of an *earlier*
  // page in the same SPA session, the entry's own `type` would still read
  // "reload" here even though this results page itself was never
  // reloaded. The fix compares the entry's own `name` (the URL its load
  // resolved to) against the current location — only a match means *this*
  // page was the one actually reloaded/restored.
  it("still resets scroll when performance reports type \"reload\" but that reload's own URL doesn't match this page (a soft nav from a reloaded earlier page)", () => {
    mockMatchMedia(false); // motion enabled — the reset only runs then
    Object.defineProperty(window, "scrollY", { value: 500, configurable: true });
    const scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([
      { type: "reload", name: "http://localhost:3000/analyze" } as unknown as PerformanceEntry,
    ]);

    renderDocument(analysisFixture);

    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
  });

  it("does not reset scroll when the reload/back_forward entry's own URL matches the current page (a genuine restored scroll)", () => {
    mockMatchMedia(false);
    Object.defineProperty(window, "scrollY", { value: 500, configurable: true });
    const scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([
      { type: "reload", name: window.location.href } as unknown as PerformanceEntry,
    ]);

    renderDocument(analysisFixture);

    expect(scrollToSpy).not.toHaveBeenCalled();
  });
});

describe("ResultsDocument — narrative-driven scroll-cinema re-sync (fix-wave F1)", () => {
  afterEach(() => {
    vi.mocked(generateNarrative).mockReset();
  });

  // jsdom has no layout engine, so this can't assert *where* a
  // ScrollTrigger fires (that's the e2e test's job — smoke.spec.ts).
  // What's feasible and load-bearing here: before the fix, the useGSAP
  // effect that builds one ScrollTrigger per [data-reveal-section] never
  // re-ran when the narrative section's own presence changed (no
  // `dependencies`/`revertOnUpdate`), so ScrollTrigger.getAll() kept
  // reporting triggers bound to stale/removed DOM nodes instead of the
  // live section list. Asserting the trigger count always matches the
  // live DOM count is a direct check on that mechanism.
  it("reverts and rebuilds ScrollTriggers to match the live DOM when the narrative section collapses on a 503 — never left stale from the pre-collapse layout", async () => {
    mockMatchMedia(false); // motion enabled — reduced motion never builds a ScrollTrigger at all
    vi.mocked(generateNarrative).mockRejectedValueOnce(
      new ApiError(503, "Пояснение аналитика недоступно: ключ OPENAI_API_KEY не настроен."),
    );
    renderDocument(analysisFixture);

    const beforeCount = document.querySelectorAll("[data-reveal-section]").length;
    expect(ScrollTrigger.getAll().length).toBe(beforeCount);

    fireEvent.click(
      screen.getByRole("button", { name: ruMessages.Results.narrative.generateButton }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: ruMessages.Results.narrative.heading }),
      ).not.toBeInTheDocument();
    });

    const afterCount = document.querySelectorAll("[data-reveal-section]").length;
    expect(afterCount).toBe(beforeCount - 1);
    // The regression this guards: without the re-sync, this would still
    // read `beforeCount` (a leftover trigger for the now-removed
    // narrative section) instead of matching the new, smaller DOM.
    expect(ScrollTrigger.getAll().length).toBe(afterCount);

    // The doc-end section the finding calls out by name — still present,
    // still reveal-wrapped, not stranded behind the stale trigger set.
    expect(
      screen.getByRole("heading", { name: ruMessages.Results.disclaimer.heading }),
    ).toBeInTheDocument();
  });

  it("re-syncs again (without leaking triggers) when a successful generate grows the narrative section", async () => {
    mockMatchMedia(false);
    vi.mocked(generateNarrative).mockResolvedValueOnce({
      text_ru: "Компания в устойчивом состоянии.",
      text_en: "The company is in a stable state.",
      model: "gpt-5-mini",
      generated_at: "2026-08-27T12:00:00+00:00",
    });
    renderDocument(analysisFixture);

    fireEvent.click(
      screen.getByRole("button", { name: ruMessages.Results.narrative.generateButton }),
    );

    await waitFor(() => {
      expect(screen.getByText("Компания в устойчивом состоянии.")).toBeInTheDocument();
    });

    // The narrative section is still present (grown, not removed) — the
    // trigger count must still match the live DOM, not double-count a
    // leftover trigger from the pre-generate render.
    expect(ScrollTrigger.getAll().length).toBe(
      document.querySelectorAll("[data-reveal-section]").length,
    );
  });
});

describe("revealAlreadyInView (fix-wave round 3, F1 completion)", () => {
  function mockSection(top: number): HTMLElement {
    const el = document.createElement("div");
    el.getBoundingClientRect = () =>
      ({ top, bottom: top, left: 0, right: 0, width: 0, height: 0 }) as DOMRect;
    return el;
  }

  it("returns true when the section's key is already in the revealed set, regardless of its current position", () => {
    const el = mockSection(9999); // far below the fold
    el.dataset.sectionKey = "recommendations";
    expect(revealAlreadyInView(el, new Set(["recommendations"]), 900)).toBe(true);
  });

  it("returns false for an unrevealed section still below its activation point (top 75% of viewport)", () => {
    const el = mockSection(900); // viewportHeight 900 * 0.75 = 675 — below it
    el.dataset.sectionKey = "recommendations";
    expect(revealAlreadyInView(el, new Set(), 900)).toBe(false);
  });

  it("returns true for an unrevealed section already at or above its activation point", () => {
    const el = mockSection(400); // 400 <= 900 * 0.75 (675)
    el.dataset.sectionKey = "recommendations";
    expect(revealAlreadyInView(el, new Set(), 900)).toBe(true);
  });

  it("falls back to the geometry check alone when the element carries no section key", () => {
    const el = mockSection(400);
    expect(revealAlreadyInView(el, new Set(), 900)).toBe(true);
    const elBelow = mockSection(900);
    expect(revealAlreadyInView(elBelow, new Set(), 900)).toBe(false);
  });
});

describe("ResultsDocument — reveal sweep doesn't flicker already-revealed sections on a re-sync (fix-wave round 3, F1 completion)", () => {
  afterEach(() => {
    vi.mocked(generateNarrative).mockReset();
    // Restores the Element.prototype.setAttribute/removeAttribute spies
    // the test below installs — in afterEach rather than at the end of
    // the test body, so a failed assertion partway through still tears
    // them down instead of leaking a patched Element.prototype into every
    // later test in the file.
    vi.restoreAllMocks();
  });

  it("instant-settles sections instead of hiding-then-re-animating them when the narrative section collapses on a 503", async () => {
    // Motion enabled — the sweep this test targets only runs then.
    mockMatchMedia(false);
    vi.mocked(generateNarrative).mockRejectedValueOnce(
      new ApiError(503, "Пояснение аналитика недоступно: ключ OPENAI_API_KEY не настроен."),
    );
    renderDocument(analysisFixture);

    // Sanity: the mount run really did hide every section pending its
    // reveal — `data-scanline-hidden` is the boot grammar's own hidden
    // marker (scanlineSweep's contract, lib/motion.ts), set directly via
    // setAttribute rather than a gsap.set() tween. jsdom's zero-rect
    // getBoundingClientRect means every section's geometry trivially
    // satisfies "already in view", but `isResync` is false on mount, so
    // the flicker-avoiding shortcut must not apply here — this is the
    // pre-existing, unchanged mount behavior the round-3 fix must not
    // touch.
    const mountHidden = document.querySelectorAll(
      '[data-scanline-content][data-scanline-hidden="true"]',
    );
    expect(mountHidden.length).toBeGreaterThan(0);

    // Spied across the resync itself (not just checked at the end) — the
    // regression this guards is transient: pre-round-3, every section's
    // re-created reveal state on a re-sync reverted to the hidden
    // "pending reveal" value and was then immediately re-animated back up
    // by ScrollTrigger's own "fire immediately if already past start"
    // behavior. That sequence still ends with nothing hidden (the same
    // end-state an end-state-only assertion would accept), so only a
    // transient check across the resync — never a single
    // data-scanline-hidden="true" setAttribute call — actually catches a
    // regression back to that behavior.
    const setAttributeSpy = vi.spyOn(Element.prototype, "setAttribute");
    const removeAttributeSpy = vi.spyOn(Element.prototype, "removeAttribute");

    fireEvent.click(
      screen.getByRole("button", { name: ruMessages.Results.narrative.generateButton }),
    );
    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: ruMessages.Results.narrative.heading }),
      ).not.toBeInTheDocument();
    });

    const hideCallsDuringResync = setAttributeSpy.mock.calls.filter(
      ([attr, value]) => attr === "data-scanline-hidden" && value === "true",
    );
    expect(hideCallsDuringResync).toHaveLength(0);

    // Positive proof the instant-settle branch actually ran (not just
    // "nothing bad happened") — it explicitly clears data-scanline-hidden
    // on every already-revealed section during the resync.
    const settleCallsDuringResync = removeAttributeSpy.mock.calls.filter(
      ([attr]) => attr === "data-scanline-hidden",
    );
    expect(settleCallsDuringResync.length).toBeGreaterThan(0);

    // End-state sanity, kept alongside the transient checks above: every
    // scanline-content element ends the resync already visible.
    const stillHidden = document.querySelectorAll(
      '[data-scanline-content][data-scanline-hidden="true"]',
    );
    expect(stillHidden).toHaveLength(0);

    // Verdict remainder (W1): this same resync used to revert the
    // headline score's ignition — useGSAP's revertOnUpdate rolls back
    // every gsap-*tracked* tl.set() from the mount-time igniteSequence
    // calls (the score's own [data-segment-on] cascade, and #score's
    // ConfidenceMeter [data-cell-on] cascade) before this re-run, and
    // nothing repaired it: the resync branch only ever restored the
    // verdict stamp. Every one of #score's ignition targets must still
    // read data-lit="true" after the resync settles — this scenario
    // (a narrative 503 collapse) is exactly the one that used to ghost
    // them.
    const scoreSegments = document.querySelectorAll("#score [data-segment-on]");
    const scoreCells = document.querySelectorAll("#score [data-cell-on]");
    expect(scoreSegments.length).toBeGreaterThan(0);
    expect(scoreCells.length).toBeGreaterThan(0);
    for (const el of [...scoreSegments, ...scoreCells]) {
      expect(el).toHaveAttribute("data-lit", "true");
    }
  });
});

// Founder feedback R1: "Although I was in English, the industry is still
// in Russian" — the score header's own «ОТРАСЛЬ» chip (score-header.tsx)
// used to render analysis.industry_name unconditionally (RU, baked in at
// analysis time), regardless of the visitor's chosen locale.
describe("ResultsDocument — industry chip locale (score-header.tsx)", () => {
  it("en locale: renders the EN industry name, not the RU one", () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <ResultsDocument analysis={analysisFixture} locale="en" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Manufacturing")).toBeInTheDocument();
    expect(screen.queryByText("Производство")).not.toBeInTheDocument();
  });

  it("ru locale (default, unchanged): still renders the RU industry name", () => {
    renderDocument(analysisFixture);

    expect(screen.getByText("Производство")).toBeInTheDocument();
  });
});
