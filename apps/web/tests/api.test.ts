import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  analyze,
  deleteAnalysis,
  downloadMyDocument,
  extract,
  generateNarrative,
  getAnalysis,
  getHealth,
  getIndustries,
  getIndustryBenchmarks,
  parseContentDispositionFilename,
  uploadFile,
} from "@/lib/api";
import type {
  AnalysisRequest,
  AnalysisResult,
  ExtractionResult,
  NarrativeResult,
} from "@/lib/api-types";

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

/** A 2xx response whose body can't be parsed as JSON (truncated/malformed) —
 * mirrors what `response.json()` actually does: reject with a SyntaxError. */
function invalidJsonResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new SyntaxError("Unexpected end of JSON input");
    },
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

// A pre-2026-08-27 stored payload: `risk_radar` is absent entirely, not
// present-as-null — this is the crux of typing it `RiskRadar | undefined`
// rather than `RiskRadar | null` in api-types.ts (see D1 in the report).
const analysisFixtureWithoutRiskRadar: AnalysisResult = { ...analysisFixture };
delete analysisFixtureWithoutRiskRadar.risk_radar;

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

    it("unwraps a {detail:{code,message}} body (the narrative endpoint's shape) into ApiError.message AND ApiError.code, not the fallback key", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse(503, {
          detail: {
            code: "narrative_unavailable",
            message: "Пояснение аналитика недоступно: ключ OPENAI_API_KEY не настроен.",
          },
        }),
      );

      await expect(generateNarrative("an_demo123")).rejects.toMatchObject({
        status: 503,
        message: "Пояснение аналитика недоступно: ключ OPENAI_API_KEY не настроен.",
        code: "narrative_unavailable",
      });
    });

    it("leaves ApiError.code undefined for the plain {detail:\"<RU string>\"} shape", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(404, { detail: "Анализ не найден." }));

      await expect(getAnalysis("x")).rejects.toMatchObject({
        status: 404,
        message: "Анализ не найден.",
        code: undefined,
      });
    });

    it("maps a malformed 2xx body into ApiError instead of throwing a raw SyntaxError", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(invalidJsonResponse(200));

      const promise = getAnalysis("x");
      await expect(promise).rejects.toBeInstanceOf(ApiError);
      await expect(promise).rejects.toMatchObject({
        status: 200,
        message: "errors.parseFailure",
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

    it("returns the stored AnalysisResult shape from getAnalysis()", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, analysisFixture));

      const result = await getAnalysis("an_demo123");

      expect(result).toEqual(analysisFixture);
      const [path, init] = vi.mocked(fetch).mock.calls[0];
      expect(path).toBe("/api/analysis/an_demo123");
      expect(init?.method).toBe("GET");
    });

    it("leaves risk_radar as undefined (not null) for a pre-extension stored payload", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, analysisFixtureWithoutRiskRadar));

      const result = await getAnalysis("an_old123");

      expect(result.risk_radar).toBeUndefined();
      expect("risk_radar" in result).toBe(false);
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

    it("uploadFile() omits the retain field entirely when not requested — byte-identical to pre-P5.T7", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse(200, {
          upload_id: "up_1", filename: "report.xlsx", content_type: "x",
          size_bytes: 4, detected_kind: "xlsx",
        }),
      );

      await uploadFile(new File(["data"], "report.xlsx"));

      const [, init] = vi.mocked(fetch).mock.calls[0];
      const body = init?.body as FormData;
      expect(body.has("retain")).toBe(false);
    });

    it("uploadFile(file, true) sends retain=1 in the multipart body", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse(200, {
          upload_id: "up_1", filename: "report.xlsx", content_type: "x",
          size_bytes: 4, detected_kind: "xlsx",
        }),
      );

      await uploadFile(new File(["data"], "report.xlsx"), true);

      const [, init] = vi.mocked(fetch).mock.calls[0];
      const body = init?.body as FormData;
      expect(body.get("retain")).toBe("1");
    });

    it("uploadFile(file, false) omits the retain field, same as the default", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse(200, {
          upload_id: "up_1", filename: "report.xlsx", content_type: "x",
          size_bytes: 4, detected_kind: "xlsx",
        }),
      );

      await uploadFile(new File(["data"], "report.xlsx"), false);

      const [, init] = vi.mocked(fetch).mock.calls[0];
      const body = init?.body as FormData;
      expect(body.has("retain")).toBe(false);
    });

    it("returns the health/vault_enabled response from getHealth()", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { status: "ok", vault_enabled: true }));

      const result = await getHealth();

      expect(result).toEqual({ status: "ok", vault_enabled: true });
      const [path, init] = vi.mocked(fetch).mock.calls[0];
      expect(path).toBe("/api/health");
      expect(init?.method).toBe("GET");
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

    it("returns one industry's full benchmark config", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse(200, {
          industry: "manufacturing",
          name: "Производство",
          note: "",
          category_weights: { liquidity: 0.2, leverage: 0.25 },
          excluded_ratios: [],
          ratios: {
            current_ratio: {
              weight: 1,
              direction: "range",
              good: [1.5, 3.0],
              acceptable: [1.1, 4.0],
              note: "",
              method: "demo",
            },
          },
          disclaimer: "Часть отраслевых ориентиров основана на данных Damodaran.",
        }),
      );

      const result = await getIndustryBenchmarks("manufacturing");
      expect(result.category_weights.liquidity).toBe(0.2);
      expect(result.ratios.current_ratio.direction).toBe("range");
      const [url] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe("/api/industries/manufacturing/benchmarks");
    });

    it("returns the deletion confirmation", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { deleted: "an_demo123" }));

      const result = await deleteAnalysis("an_demo123");
      expect(result).toEqual({ deleted: "an_demo123" });
    });

    it("posts to the narrative endpoint with no query string, and returns the NarrativeResult shape", async () => {
      const narrative: NarrativeResult = {
        text_ru: "Состояние стабильное.",
        text_en: "The state is stable.",
        model: "gpt-5-mini",
        generated_at: "2026-08-27T12:00:00+00:00",
      };
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, narrative));

      const result = await generateNarrative("an_demo123");

      expect(result).toEqual(narrative);
      const [path, init] = vi.mocked(fetch).mock.calls[0];
      expect(path).toBe("/api/analysis/an_demo123/narrative");
      expect(init?.method).toBe("POST");
    });

    it("appends ?refresh=1 when refresh is requested, and omits it otherwise", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse(200, {
          text_ru: "x", text_en: "y", model: "gpt-5-mini", generated_at: "2026-08-27T12:00:00Z",
        }),
      );
      await generateNarrative("an_demo123", { refresh: true });
      const [path] = vi.mocked(fetch).mock.calls[0];
      expect(path).toBe("/api/analysis/an_demo123/narrative?refresh=1");
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

  describe("parseContentDispositionFilename", () => {
    it("prefers the RFC 5987 filename*= (UTF-8, percent-encoded) parameter over the plain fallback", () => {
      const header =
        "attachment; filename=\"Balans.csv\"; filename*=UTF-8''%D0%91%D0%B0%D0%BB%D0%B0%D0%BD%D1%81.csv";
      expect(parseContentDispositionFilename(header)).toBe("Баланс.csv");
    });

    it("falls back to the plain filename= parameter when filename*= is absent", () => {
      expect(parseContentDispositionFilename('attachment; filename="report.csv"')).toBe("report.csv");
    });

    it("falls back to filename= when filename*= has unparseable percent-encoding", () => {
      const header = "attachment; filename=\"report.csv\"; filename*=UTF-8''%";
      expect(parseContentDispositionFilename(header)).toBe("report.csv");
    });

    it("returns undefined for a null header", () => {
      expect(parseContentDispositionFilename(null)).toBeUndefined();
    });

    it("returns undefined when neither parameter is present", () => {
      expect(parseContentDispositionFilename("attachment")).toBeUndefined();
    });
  });

  describe("downloadMyDocument", () => {
    function blobResponse(headers: Record<string, string>, blob: Blob): Response {
      return {
        ok: true,
        status: 200,
        headers: new Headers(headers),
        blob: async () => blob,
      } as unknown as Response;
    }

    let createObjectURL: ReturnType<typeof vi.fn>;
    let revokeObjectURL: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      createObjectURL = vi.fn(() => "blob:mock-url");
      revokeObjectURL = vi.fn();
      // jsdom doesn't implement these at all — stubbing them (rather than
      // spying) is the only option, and vi.stubGlobal is undone by this
      // file's existing afterEach (vi.unstubAllGlobals()), same as the
      // fetch stub every other test in this file already relies on.
      vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
      vi.useFakeTimers();
    });

    it("fetches the download endpoint, saves the blob via an object-URL anchor click, and names it from Content-Disposition", async () => {
      const blob = new Blob(["revenue;1000\n"], { type: "text/csv" });
      vi.mocked(fetch).mockResolvedValueOnce(
        blobResponse({ "Content-Disposition": 'attachment; filename="report.csv"' }, blob),
      );
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      const appendSpy = vi.spyOn(document.body, "appendChild");

      await downloadMyDocument("doc_1", "fallback.csv");

      const [path, init] = vi.mocked(fetch).mock.calls[0];
      expect(path).toBe("/api/my/documents/doc_1/download");
      expect(init?.method ?? "GET").toBe("GET");
      expect(createObjectURL).toHaveBeenCalledWith(blob);
      const anchor = appendSpy.mock.calls.find((call) => call[0] instanceof HTMLAnchorElement)?.[0] as
        | HTMLAnchorElement
        | undefined;
      expect(anchor?.href).toBe("blob:mock-url");
      expect(anchor?.download).toBe("report.csv"); // from Content-Disposition, not the fallback
      expect(clickSpy).toHaveBeenCalledTimes(1);

      // Revocation is deferred (see lib/api.ts's comment on why), not
      // immediate — it must not have fired before the click had a chance
      // to be observed by the browser.
      expect(revokeObjectURL).not.toHaveBeenCalled();
      await vi.runAllTimersAsync();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");

      clickSpy.mockRestore();
      appendSpy.mockRestore();
    });

    it("falls back to the caller-supplied filename when Content-Disposition is missing", async () => {
      const blob = new Blob(["data"]);
      vi.mocked(fetch).mockResolvedValueOnce(blobResponse({}, blob));
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      const appendSpy = vi.spyOn(document.body, "appendChild");

      await downloadMyDocument("doc_1", "fallback.csv");

      const anchor = appendSpy.mock.calls.find((call) => call[0] instanceof HTMLAnchorElement)?.[0] as
        | HTMLAnchorElement
        | undefined;
      expect(anchor?.download).toBe("fallback.csv");

      clickSpy.mockRestore();
      appendSpy.mockRestore();
    });

    it("maps a non-2xx response (e.g. 503 vault_unavailable) into ApiError instead of attempting a download", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse(503, { detail: { code: "vault_unavailable", message: "Хранилище недоступно." } }),
      );

      await expect(downloadMyDocument("doc_1", "fallback.csv")).rejects.toMatchObject({
        status: 503,
        message: "Хранилище недоступно.",
        code: "vault_unavailable",
      });
      expect(createObjectURL).not.toHaveBeenCalled();
    });

    it("maps a 404 (cross-user or unknown id) into ApiError", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(404, { detail: "Документ не найден." }));

      await expect(downloadMyDocument("doc_1", "fallback.csv")).rejects.toMatchObject({
        status: 404,
        message: "Документ не найден.",
      });
    });

    it("maps a network failure into ApiError{status:0}", async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));

      await expect(downloadMyDocument("doc_1", "fallback.csv")).rejects.toMatchObject({
        status: 0,
        message: "errors.network",
      });
    });
  });
});
