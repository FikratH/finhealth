import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  analyze,
  deleteAnalysis,
  extract,
  getAnalysis,
  getIndustries,
  uploadFile,
} from "@/lib/api";
import type { AnalysisRequest, AnalysisResult, ExtractionResult } from "@/lib/api-types";

// Trimmed inline fixtures — cut down from
// apps/api/demo/expected_analysis_example.json to the minimum that still
// exercises every branch of the contract this client cares about (a null
// ratio value/score, a null category score, a present risk_radar with a
// null altman/dupont and a null beneish.m_score/flag). Kept as literals
// (not an import of the full 1110-line fixture) so this file stays
// self-contained and its shape is visibly complete against api-types.ts.

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const analysisFixture: AnalysisResult = {
  analysis_id: "an_demo123",
  created_at: "2026-08-27T00:00:00Z",
  industry: "retail",
  industry_name: "Розничная торговля",
  currency: "RUB",
  scale: "units",
  latest_period: "2025 Q4",
  previous_period: "2024 Q4",
  overall_score: 78.4,
  health_label: "Хорошее состояние",
  category_scores: [
    { category: "liquidity", label: "Ликвидность", score: 88.8, weight: 0.2, ratios_used: 4 },
    { category: "leverage", label: "Долговая нагрузка", score: null, weight: 0.2, ratios_used: 0 },
  ],
  ratios: [
    {
      key: "current_ratio",
      name: "Current Ratio",
      category: "liquidity",
      formula: "current_assets / current_liabilities",
      inputs: { current_assets: 808750000, current_liabilities: 486200000 },
      substitution: "current_assets / current_liabilities → 808 750 000 / 486 200 000",
      value: 1.6634101192924722,
      unit: "x",
      status: "good",
      score: 92,
      benchmark: {
        ratio: "current_ratio",
        weight: 1,
        direction: "range",
        good: [1.5, 3.0],
        acceptable: [1.1, 4.0],
        note: "",
        source: "Damodaran (NYU Stern), Jan 2026",
      },
      explanation: "Значение 1.66. В пределах отраслевого ориентира.",
      applicable: true,
      warnings: [],
    },
    {
      key: "market_cap_ratio",
      name: "P/E",
      category: "market",
      formula: "price / eps",
      inputs: {},
      substitution: "",
      value: null,
      unit: "money",
      status: "na",
      score: null,
      benchmark: null,
      explanation: "Рыночные данные отсутствуют.",
      applicable: false,
      warnings: [],
    },
  ],
  strengths: ["Сильная ликвидность."],
  risks: ["Долговая нагрузка выше ориентира."],
  recommendations: [
    {
      problem: "Долговая нагрузка выше отраслевого ориентира.",
      ratio: "Debt-to-Equity",
      current_value: 0.38,
      benchmark_hint: "желательно ≤ 0.303",
      action: "Снизить долг за счёт свободного денежного потока.",
      expected_effect: "Снижение процентных расходов.",
      tradeoffs: "Выпуск новых акций размывает доли акционеров.",
      priority: "high",
      difficulty: "high",
    },
  ],
  warnings: [{ code: "market", message: "Рыночные данные отсутствуют." }],
  confidence: {
    total: 95.3,
    data_completeness: 95,
    extraction_confidence: 95,
    manual_corrections: 0,
    has_previous_period: true,
    has_industry_benchmarks: true,
    audited: true,
    notes: ["В документе обнаружено упоминание аудита отчётности."],
  },
  missing_metrics: ["EBITDA"],
  risk_radar: {
    altman: null,
    piotroski: {
      score: 6,
      max: 7,
      signals: [
        {
          key: "roa_positive",
          name: "Положительная рентабельность активов",
          value: true,
          detail: "ROA = 0.0625 (> 0).",
        },
        { key: "leverage_decreased", name: "Снижение долговой нагрузки", value: null, detail: "" },
      ],
      interpretation: "6 из 7 сигналов положительны.",
    },
    beneish: {
      m_score: null,
      indices: { DSRI: 0.82, GMI: 0.96, AQI: null },
      flag: null,
      substituted: [],
      interpretation: "M-Score не рассчитан: доступно 4 из 8 индексов.",
    },
    dupont: null,
  },
  disclaimer: "Сервис не заменяет профессиональную финансовую консультацию.",
};

const extractionFixture: ExtractionResult = {
  upload_id: "up_demo123",
  periods: ["2025 Q4", "2024 Q4"],
  latest_period: "2025 Q4",
  previous_period: "2024 Q4",
  currency: "RUB",
  scale: "units",
  audited: true,
  values: [
    {
      metric: "revenue",
      original_label: "Выручка",
      value: 3245900000,
      currency: null,
      scale: null,
      period: "2025 Q4",
      source: "sheet1!B4",
      confidence: 92,
      snippet: "Выручка: 3 245 900 000",
      manually_edited: false,
    },
    {
      metric: "ebitda",
      original_label: "EBITDA",
      value: null,
      source: "",
      confidence: 0,
      snippet: "",
      manually_edited: false,
    },
  ],
  previous_values: [],
  warnings: [],
  suggested_industry: "retail",
};

describe("lib/api", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe("error mapping", () => {
    const cases: Array<{ status: number; detail: string }> = [
      { status: 400, detail: "Неизвестная отрасль." },
      { status: 404, detail: "Анализ не найден." },
      { status: 413, detail: "Файл больше 15 МБ. Уменьшите размер файла." },
      { status: 415, detail: "Формат файла не распознан. Поддерживаются PDF, XLSX, XLS и CSV." },
      { status: 422, detail: "Не удалось извлечь данные из файла. Попробуйте Excel/CSV." },
    ];

    it.each(cases)(
      "maps a $status response into an ApiError carrying the RU detail",
      async ({ status, detail }) => {
        vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(status, { detail }));

        const promise = getAnalysis("whatever");
        await expect(promise).rejects.toBeInstanceOf(ApiError);
        await expect(promise).rejects.toMatchObject({ status, message: detail });
      },
    );

    it("falls back to a stable translation key when the body has no detail", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(404, {}));

      await expect(getAnalysis("x")).rejects.toMatchObject({
        status: 404,
        message: "errors.notFound",
      });
    });

    it("falls back to errors.unknown for a status the client has no mapping for", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(500, {}));

      await expect(getAnalysis("x")).rejects.toMatchObject({
        status: 500,
        message: "errors.unknown",
      });
    });
  });

  describe("success shapes", () => {
    it("returns the ExtractionResult shape from extract()", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, extractionFixture));

      const result = await extract("up_demo123");
      expect(result).toEqual(extractionFixture);
      // null must survive untouched — never coerced to 0.
      expect(result.values[1].value).toBeNull();
    });

    it("returns the AnalysisResult shape from analyze(), risk_radar included", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, analysisFixture));

      const request: AnalysisRequest = {
        industry: "retail",
        scale: "units",
        audited: true,
        values: extractionFixture.values,
        previous_values: [],
      };
      const result = await analyze(request);

      expect(result).toEqual(analysisFixture);
      expect(result.risk_radar?.piotroski.score).toBe(6);
      expect(result.risk_radar?.beneish.m_score).toBeNull();
      expect(result.risk_radar?.beneish.flag).toBeNull();
      expect(result.category_scores[1].score).toBeNull();
    });

    it("sends a multipart body from uploadFile()", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse(200, {
          upload_id: "up_1",
          filename: "report.xlsx",
          content_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          size_bytes: 1234,
          detected_kind: "xlsx",
        }),
      );

      const file = new File(["data"], "report.xlsx");
      const result = await uploadFile(file);

      expect(result.detected_kind).toBe("xlsx");
      const [, init] = vi.mocked(fetch).mock.calls[0];
      expect(init?.body).toBeInstanceOf(FormData);
    });

    it("returns the industries list", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse(200, {
          industries: [{ id: "retail", name: "Розничная торговля", note: "" }],
          disclaimer: "Часть отраслевых ориентиров основана на данных Damodaran.",
        }),
      );

      const result = await getIndustries();
      expect(result.industries).toHaveLength(1);
    });

    it("returns the deletion confirmation", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { deleted: "an_demo123" }));

      const result = await deleteAnalysis("an_demo123");
      expect(result).toEqual({ deleted: "an_demo123" });
    });
  });

  describe("timeouts", () => {
    function abortableFetchMock() {
      return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      });
    }

    it("aborts getAnalysis() after 15s with ApiError{status:0, message:'timeout'}", async () => {
      vi.useFakeTimers();
      vi.stubGlobal("fetch", abortableFetchMock());

      const promise = getAnalysis("slow");
      const assertion = expect(promise).rejects.toMatchObject({ status: 0, message: "timeout" });
      await vi.advanceTimersByTimeAsync(15_000);
      await assertion;
    });

    it("aborts uploadFile() after 30s, not the 15s default", async () => {
      vi.useFakeTimers();
      vi.stubGlobal("fetch", abortableFetchMock());

      const file = new File(["data"], "report.xlsx");
      const promise = uploadFile(file);
      const assertion = expect(promise).rejects.toMatchObject({ status: 0, message: "timeout" });

      // Still short of the 30s upload/extract budget: must not have settled yet.
      await vi.advanceTimersByTimeAsync(15_000);
      await vi.advanceTimersByTimeAsync(15_000);
      await assertion;
    });
  });
});
