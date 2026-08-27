import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ResultsDocument } from "@/components/results/results-document";
import ruMessages from "@/messages/ru.json";
import type { AnalysisResult } from "@/lib/api-types";

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
  disclaimer:
    "Сервис не заменяет профессиональную финансовую консультацию. Часть отраслевых ориентиров основана на данных Damodaran (NYU Stern, янв. 2026); остальные являются демонстрационными и помечены соответствующим образом.",
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
    expect(screen.getByText("85,1")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Сильное состояние" }),
    ).toBeInTheDocument();
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
    expect(within(header).getByText("—")).toBeInTheDocument();
    for (const metric of nullScoreFixture.missing_metrics) {
      expect(within(header).getByText(metric)).toBeInTheDocument();
    }

    // The standalone MissingMetricsHint section is skipped when the
    // header's own insufficient-data panel already lists the same metrics.
    expect(
      screen.queryByText(ruMessages.Results.missingMetrics.heading),
    ).not.toBeInTheDocument();
  });
});
