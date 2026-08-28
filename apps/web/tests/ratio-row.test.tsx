import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { RatioRow } from "@/components/results/ratio-row";
import ruMessages from "@/messages/ru.json";
import type { ExtractedValue, RatioResult } from "@/lib/api-types";

// Real demo figures: a higher-is-better ratio whose value sits ABOVE the
// "good" band on the "higher" side — the API still scores this "good"
// (more turnover is better, without an upper bound), but NormBand only
// knows low/high, so an unguarded position check reads it as out-of-range.
const receivablesTurnover: RatioResult = {
  key: "receivables_turnover",
  name: "Receivables Turnover",
  category: "efficiency",
  formula: "revenue / accounts_receivable",
  inputs: { revenue: 3245900000, accounts_receivable: 285000000 },
  substitution: "revenue / accounts_receivable  →  revenue = 3 245 900 000 ; accounts_receivable = 285 000 000",
  value: 11.39,
  unit: "x",
  status: "good",
  score: 91.2,
  benchmark: {
    ratio: "receivables_turnover",
    weight: 1.0,
    direction: "higher",
    good: [4.81, 10.19],
    acceptable: [3.0, 14.0],
    note: "",
    source: "",
  },
  explanation: "Значение 11.39. Отраслевой ориентир: 4.81–10.19. Вывод: выше отраслевого ориентира.",
  applicable: true,
  warnings: [],
};

function renderRatioRow(ratio: RatioResult) {
  return render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <RatioRow ratio={ratio} locale="ru" />
    </NextIntlClientProvider>,
  );
}

describe("RatioRow", () => {
  it("suppresses the ▲ flag when the API status is good, even though the value sits above the norm band", () => {
    // Regression: the StatusPill and NormBand used to disagree — a green
    // "Хорошо" pill next to a red ▲ "выше нормы" flag on the same row.
    // Flags must follow the API's status, not raw band position.
    renderRatioRow(receivablesTurnover);
    expect(screen.getByText(ruMessages.Status.good)).toBeInTheDocument();
    expect(screen.queryByText("▲")).not.toBeInTheDocument();
    expect(screen.queryByText(ruMessages.Results.ratios.aboveLabel)).not.toBeInTheDocument();
  });

  it("still shows the ▲ flag for the same above-band position when status is attention", () => {
    // Confirms the suppression is status-gated, not a blanket change to
    // NormBand's default out-of-range behavior. Queried by the flag's
    // sr-only pairing text, not the "▲" glyph itself — StatusPill's own
    // "attention" symbol is also "▲", so the glyph alone is ambiguous here.
    renderRatioRow({ ...receivablesTurnover, status: "attention" });
    expect(screen.getByText(ruMessages.Results.ratios.aboveLabel)).toBeInTheDocument();
  });
});

describe("RatioRow — provenance trace fixes (review fix round 1)", () => {
  it("resolves the 'ebit' input to its real operating_income citation, not a fabricated computed-value label", () => {
    // Real demo figures (apps/api/demo/expected_analysis_example.json).
    // ratios.py's _interest_coverage keys operating_income's own value as
    // "ebit" (matching the formula's own notation) — a pure passthrough,
    // not a computed figure, so it must trace back to the real citation
    // rather than reading as "Расчётное значение".
    const interestCoverage: RatioResult = {
      key: "interest_coverage",
      name: "Interest Coverage",
      category: "leverage",
      formula: "EBIT / interest_expense",
      inputs: { ebit: 356400000, interest_expense: 148200000 },
      substitution:
        "EBIT / interest_expense  →  ebit = 356 400 000 ; interest_expense = 148 200 000",
      value: 2.4048582995951415,
      unit: "x",
      status: "critical",
      score: 46.3,
      benchmark: {
        ratio: "interest_coverage",
        weight: 1.5,
        direction: "higher",
        good: [4.9068, 10.3909],
        acceptable: [2.5977, 13.8546],
        note: "Покрытие процентов критично для капиталоёмкого бизнеса.",
        source: "Damodaran (NYU Stern), Jan 2026",
      },
      explanation:
        "Значение 2.40. Отраслевой ориентир (источник: Damodaran (NYU Stern), Jan 2026, данные 2026-01): 4.9068–10.3909. Вывод: существенно вне отраслевого ориентира. Покрытие процентов критично для капиталоёмкого бизнеса.",
      applicable: true,
      warnings: [],
    };
    const operatingIncome: ExtractedValue = {
      metric: "operating_income",
      original_label: "Прибыль от операционной деятельности",
      value: 356400000,
      currency: "KZT",
      scale: "units",
      period: "2024",
      source: "CSV, строка 20",
      confidence: 95,
      snippet: "Прибыль от операционной деятельности | 356 400 | 298 700",
      manually_edited: false,
    };
    const interestExpense: ExtractedValue = {
      metric: "interest_expense",
      original_label: "Проценты к уплате",
      value: 148200000,
      currency: "KZT",
      scale: "units",
      period: "2024",
      source: "CSV, строка 21",
      confidence: 95,
      snippet: "Проценты к уплате | (148 200) | (139 700)",
      manually_edited: false,
    };
    render(
      <NextIntlClientProvider locale="ru" messages={ruMessages}>
        <RatioRow
          ratio={interestCoverage}
          locale="ru"
          sourceValues={[operatingIncome, interestExpense]}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(ruMessages.Results.ratios.provenanceHeading)).toBeInTheDocument();
    // metricDisplayName("ebit", "ru") has no METRIC_NAMES entry — this
    // proves the row displays under operating_income's real identity, not
    // the raw "ebit" alias key.
    expect(screen.getByText("Операционная прибыль (EBIT)")).toBeInTheDocument();
    expect(screen.getByText("«Прибыль от операционной деятельности»")).toBeInTheDocument();
    expect(screen.getByText("CSV, строка 20")).toBeInTheDocument();
    // Both inputs are real, sourced citations — neither reads as a
    // fabricated "computed value".
    expect(
      screen.queryByText(ruMessages.Results.ratios.provenanceDerived),
    ).not.toBeInTheDocument();
  });

  it("renders 'not found in document' — never a fabricated 0% confidence meter — for a null-value source_values stub", () => {
    // Minimal synthetic ratio (only `inputs` matters for this test); the
    // source_values entry is verbatim the real stub shape
    // extraction.py produces for a dictionary metric it never located in
    // the document (apps/api/demo/expected_analysis_example.json's own
    // "retained_earnings" entry: value null, source "", confidence 0).
    // api-types' own contract: null means N/A, never 0 — this must not
    // render as a live (if low-confidence) reading.
    const ratioWithUnfoundInput: RatioResult = {
      key: "altman_z_x2",
      name: "Test fixture ratio",
      category: "leverage",
      formula: "",
      inputs: { retained_earnings: null },
      substitution: "",
      value: null,
      unit: "x",
      status: "na",
      score: null,
      benchmark: null,
      explanation: "",
      applicable: true,
      warnings: [],
    };
    const retainedEarningsStub: ExtractedValue = {
      metric: "retained_earnings",
      original_label: "",
      value: null,
      currency: "KZT",
      scale: "thousands",
      period: "2024",
      source: "",
      confidence: 0,
      snippet: "",
      manually_edited: false,
    };
    render(
      <NextIntlClientProvider locale="ru" messages={ruMessages}>
        <RatioRow
          ratio={ratioWithUnfoundInput}
          locale="ru"
          sourceValues={[retainedEarningsStub]}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(ruMessages.Results.ratios.provenanceNotFound)).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    expect(
      screen.queryByText(ruMessages.Results.ratios.provenanceDerived),
    ).not.toBeInTheDocument();
  });

  it("labels a derived input (working_capital) under its real RU name, not the raw snake_case key (fix-wave F2)", () => {
    // altman_z's working_capital input has no source_values counterpart —
    // classifyProvenance reads it as "derived". Before DERIVED_NAMES,
    // metricDisplayName("working_capital", "ru") had no METRIC_NAMES entry
    // and fell back to the raw key itself, leaking engine internals onto
    // the flagship trust surface.
    const altmanZ: RatioResult = {
      key: "altman_z",
      name: "Altman Z′ (частная компания, без X2)",
      category: "leverage",
      formula: "0.717·(WC/TA) + 3.107·(EBIT/TA) + 0.420·(BVE/TL) + 0.998·(Rev/TA)",
      inputs: {
        working_capital: 322550000.0,
        total_assets: 2456800000.0,
      },
      substitution: "",
      value: 2.45,
      unit: "x",
      status: "attention",
      score: null,
      benchmark: null,
      explanation: "",
      applicable: true,
      warnings: [],
    };
    const totalAssets: ExtractedValue = {
      metric: "total_assets",
      original_label: "Итого активы",
      value: 2456800000.0,
      currency: "KZT",
      scale: "units",
      period: "2024",
      source: "CSV, строка 6",
      confidence: 96,
      snippet: "Итого активы | 2 456 800 | 2 298 500",
      manually_edited: false,
    };
    render(
      <NextIntlClientProvider locale="ru" messages={ruMessages}>
        <RatioRow ratio={altmanZ} locale="ru" sourceValues={[totalAssets]} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Оборотный капитал")).toBeInTheDocument();
    expect(screen.queryByText("working_capital")).not.toBeInTheDocument();
  });
});

describe("RatioRow — KZ benchmark overlay (Phase 7 Task 5)", () => {
  const roeWithKz: RatioResult = {
    key: "roe",
    name: "Return on Equity",
    category: "profitability",
    formula: "net_income / average_shareholders_equity",
    inputs: { net_income: 356400000, average_shareholders_equity: 1150000000 },
    substitution: "",
    value: 31.0,
    unit: "%",
    status: "good",
    score: 88.0,
    benchmark: {
      ratio: "roe", weight: 1.0, direction: "higher", good: [10, 25], acceptable: [5, 35],
      note: "", source: "Damodaran (NYU Stern), Jan 2026",
    },
    benchmark_kz: {
      ratio: "roe", value: 15.32,
      note: "ROE (аннуализировано источником), нефинансовые организации РК, 2024 Q1.",
      source: "Нацбанк РК / МВФ, Индикаторы фин. устойчивости, Табл. 5.5 (нефин. организации)",
      source_url: "https://nationalbank.kz/ru/page/indikatory-finansovoy-ustoychivosti",
      as_of: "2024Q1", method: "kz-official-point-v1", scope: "economy_wide",
    },
    explanation: "",
    applicable: true,
    warnings: [],
  };

  it("renders the kz diamond mark on the calibration scale when benchmark_kz is present", () => {
    const { container } = renderRatioRow(roeWithKz);
    expect(container.querySelector("[data-calibration-kz-mark]")).not.toBeNull();
  });

  it("renders no kz mark when benchmark_kz is absent", () => {
    const { container } = renderRatioRow({ ...roeWithKz, benchmark_kz: null });
    expect(container.querySelector("[data-calibration-kz-mark]")).toBeNull();
  });

  it("shows a screen-visible KZ provenance line with the economy-wide label and as_of quarter", () => {
    // scope: "economy_wide" on this fixture — must render the
    // economy-wide-specific label, not the bare industry one (round-1
    // fix, Finding 1).
    const { container } = renderRatioRow(roeWithKz);
    const text = container.textContent ?? "";
    expect(text).toContain(ruMessages.Results.ratios.benchmarkKzEconomyWideLabel);
    expect(text).toContain("2024Q1");
  });

  it("shows the plain (non-economy-wide) label for an industry-scoped KZ mark", () => {
    const bankingRoe: RatioResult = {
      ...roeWithKz,
      benchmark_kz: { ...roeWithKz.benchmark_kz!, scope: "industry" },
    };
    const { container } = renderRatioRow(bankingRoe);
    const text = container.textContent ?? "";
    expect(text).toContain(ruMessages.Results.ratios.benchmarkKzLabel);
    expect(text).not.toContain(ruMessages.Results.ratios.benchmarkKzEconomyWideLabel);
  });

  it("passes the scope-aware label through to the calibration scale's kz mark too", () => {
    render(
      <NextIntlClientProvider locale="ru" messages={ruMessages}>
        <RatioRow ratio={roeWithKz} locale="ru" />
      </NextIntlClientProvider>,
    );
    const gauge = screen.getByRole("img");
    expect(gauge.getAttribute("aria-label")).toContain(
      ruMessages.Results.ratios.benchmarkKzEconomyWideLabel,
    );
  });

  // Round-1 fix, Findings 4/5/6: this line is now the SOLE print register
  // for the KZ fact (CalibrationScale no longer ships its own twin) — it
  // must render unconditionally, with no print:hidden/hidden class, so it
  // appears on paper exactly once, carrying as_of (which the removed
  // CalibrationScale twin never did).
  it("renders the KZ provenance line with no print-hiding class (it is the paper register)", () => {
    const { container } = renderRatioRow(roeWithKz);
    const text = container.textContent ?? "";
    const provenanceP = Array.from(container.querySelectorAll("p")).find((p) =>
      p.textContent?.includes("2024Q1"),
    );
    expect(provenanceP).toBeDefined();
    expect(provenanceP!.className).not.toMatch(/print:hidden/);
    expect(provenanceP!.className).not.toMatch(/\bhidden\b/);
    expect(text).toContain("15,32");
  });

  it("renders a second footnote marker for the kz source when kzFootnoteNumber is given", () => {
    render(
      <NextIntlClientProvider locale="ru" messages={ruMessages}>
        <RatioRow ratio={roeWithKz} locale="ru" footnoteNumber={1} kzFootnoteNumber={2} />
      </NextIntlClientProvider>,
    );
    const link = screen.getByRole("link", {
      name: ruMessages.Results.ratios.sourceFootnoteAriaKz.replace("{n}", "2"),
    });
    expect(link).toHaveAttribute("href", "#fn-2");
  });

  it("omits the kz footnote marker when kzFootnoteNumber is undefined", () => {
    render(
      <NextIntlClientProvider locale="ru" messages={ruMessages}>
        <RatioRow ratio={roeWithKz} locale="ru" footnoteNumber={1} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByText("[2]")).not.toBeInTheDocument();
  });
});
