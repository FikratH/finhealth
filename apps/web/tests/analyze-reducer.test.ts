import { describe, expect, it } from "vitest";
import {
  analyzeReducer,
  buildAnalysisRequest,
  bytesToMB,
  exceedsMaxSize,
  findExtractedValue,
  initialAnalyzeState,
  isAcceptedExtension,
  MAX_UPLOAD_BYTES,
  type AnalyzeAction,
  type AnalyzeState,
} from "@/lib/analyze-reducer";
import type { ExtractedValue, ExtractionResult, Industry } from "@/lib/api-types";

const industries: Industry[] = [
  { id: "retail", name: "Розничная торговля", note: "" },
  { id: "manufacturing", name: "Производство", note: "" },
];

function extractedValue(overrides: Partial<ExtractedValue>): ExtractedValue {
  return {
    metric: "revenue",
    original_label: "Доход от реализации",
    value: 3245900,
    currency: null,
    scale: null,
    period: "31.12.2024",
    source: "CSV:3",
    confidence: 95,
    snippet: "Доход от реализации;3 245 900;2 987 400",
    manually_edited: false,
    ...overrides,
  };
}

const extractionFixture: ExtractionResult = {
  upload_id: "up_1",
  periods: ["31.12.2024", "31.12.2023"],
  latest_period: "31.12.2024",
  previous_period: "31.12.2023",
  currency: "KZT",
  scale: "thousands",
  audited: true,
  values: [
    extractedValue({ metric: "revenue", value: 3245900 }),
    extractedValue({
      metric: "ebitda",
      original_label: "",
      value: null,
      source: "",
      confidence: 0,
      snippet: "",
    }),
  ],
  previous_values: [extractedValue({ metric: "revenue", value: 2987400, period: "31.12.2023" })],
  warnings: [
    "Знак «Себестоимость» нормализован: значение в скобках приведено к положительной величине расхода.",
  ],
  suggested_industry: "manufacturing",
};

function reduceAll(actions: AnalyzeAction[], start: AnalyzeState = initialAnalyzeState()): AnalyzeState {
  return actions.reduce(analyzeReducer, start);
}

describe("analyzeReducer", () => {
  it("walks the happy path from file selection through a successful extraction", () => {
    const file = new File(["data"], "demo_company.csv", { type: "text/csv" });
    const state = reduceAll([
      { type: "industries_loaded", industries },
      { type: "file_selected", file },
      { type: "industry_selected", industry: "retail" },
      { type: "upload_started" },
      {
        type: "upload_succeeded",
        upload: {
          upload_id: "up_1",
          filename: "demo_company.csv",
          content_type: "text/csv",
          size_bytes: file.size,
          detected_kind: "csv",
        },
      },
      { type: "extract_succeeded", extraction: extractionFixture },
    ]);

    expect(state.step).toBe("verify");
    expect(state.uploadPhase).toBe("idle");
    expect(state.error).toBeNull();
    expect(state.values).toEqual(extractionFixture.values);
    expect(state.previousValues).toEqual(extractionFixture.previous_values);
    expect(state.scale).toBe("thousands");
    expect(state.currency).toBe("KZT");
    expect(state.audited).toBe(true);
    // A deliberate industry pick survives extraction — the suggestion only
    // fills the field when the user hadn't chosen anything yet.
    expect(state.industry).toBe("retail");
    expect(state.suggestedIndustry).toBe("manufacturing");
  });

  it("adopts the suggested industry only when the user hadn't picked one", () => {
    const state = reduceAll([{ type: "extract_succeeded", extraction: extractionFixture }]);
    expect(state.industry).toBe("manufacturing");
  });

  it("surfaces an upload failure without leaving the upload step", () => {
    const state = reduceAll([
      { type: "upload_started" },
      { type: "upload_failed", error: { message: "Файл пуст.", status: 400 } },
    ]);

    expect(state.step).toBe("upload");
    expect(state.uploadPhase).toBe("idle");
    expect(state.error).toEqual({ message: "Файл пуст.", status: 400 });
  });

  it("keeps a 422 extract failure (after a successful upload) on the upload step", () => {
    // Mirrors the real async orchestration: uploadFile() resolves, then
    // extract() rejects — the flow must not have advanced to "verify" in
    // between, and the failure must land the user back on step 1 to retry.
    const state = reduceAll([
      { type: "upload_started" },
      {
        type: "upload_succeeded",
        upload: {
          upload_id: "up_1",
          filename: "scan.pdf",
          content_type: "application/pdf",
          size_bytes: 1000,
          detected_kind: "pdf",
        },
      },
      {
        type: "upload_failed",
        error: { message: "Не удалось извлечь данные из файла. Попробуйте Excel/CSV.", status: 422 },
      },
    ]);

    expect(state.step).toBe("upload");
    expect(state.extraction).toBeNull();
    expect(state.error?.status).toBe(422);
  });

  it("marks an edited latest-period value as manually_edited", () => {
    const state = reduceAll(
      [{ type: "value_edited", period: "latest", metric: "revenue", value: 4000000 }],
      { ...initialAnalyzeState(), values: extractionFixture.values, step: "verify" },
    );

    const edited = findExtractedValue(state.values, "revenue");
    expect(edited?.value).toBe(4000000);
    expect(edited?.manually_edited).toBe(true);
    // The original source/snippet survive an edit — provenance still shows
    // what was originally read before the correction.
    expect(edited?.source).toBe("CSV:3");
  });

  it("offers manual entry on an N/A row by editing straight into a null value", () => {
    const state = reduceAll(
      [{ type: "value_edited", period: "latest", metric: "ebitda", value: 500000 }],
      { ...initialAnalyzeState(), values: extractionFixture.values, step: "verify" },
    );

    const edited = findExtractedValue(state.values, "ebitda");
    expect(edited?.value).toBe(500000);
    expect(edited?.manually_edited).toBe(true);
  });

  it("synthesizes a previous-period row when editing a metric with no previous value at all", () => {
    // previous_values isn't N/A-filled by the backend the way values is —
    // "ebitda" has no entry there until the user supplies one.
    const state = reduceAll(
      [{ type: "value_edited", period: "previous", metric: "ebitda", value: 420000 }],
      {
        ...initialAnalyzeState(),
        step: "verify",
        extraction: extractionFixture,
        previousValues: extractionFixture.previous_values,
      },
    );

    const synthesized = findExtractedValue(state.previousValues, "ebitda");
    expect(synthesized).toMatchObject({
      metric: "ebitda",
      value: 420000,
      manually_edited: true,
      period: "31.12.2023",
    });
  });

  it("resets to the upload step and drops extraction state on back_to_upload", () => {
    const withExtraction: AnalyzeState = {
      ...initialAnalyzeState(),
      step: "verify",
      extraction: extractionFixture,
      values: extractionFixture.values,
      industry: "manufacturing",
    };
    const state = analyzeReducer(withExtraction, { type: "back_to_upload" });

    expect(state.step).toBe("upload");
    expect(state.file).toBeNull();
    expect(state.extraction).toBeNull();
    expect(state.values).toEqual([]);
    // The industry choice is deliberately preserved — only file/extraction
    // state resets.
    expect(state.industry).toBe("manufacturing");
  });

  it("applies the suggested industry on demand without touching anything else", () => {
    const state = analyzeReducer(
      { ...initialAnalyzeState(), industry: "retail", suggestedIndustry: "manufacturing" },
      { type: "apply_suggested_industry" },
    );
    expect(state.industry).toBe("manufacturing");
  });

  it("does nothing when applying a suggestion that doesn't exist", () => {
    const start = { ...initialAnalyzeState(), industry: "retail" };
    const state = analyzeReducer(start, { type: "apply_suggested_industry" });
    expect(state).toBe(start);
  });

  it("walks analyze_started → analyze_succeeded", () => {
    const state = reduceAll([
      { type: "analyze_started" },
      { type: "analyze_succeeded", analysisId: "an_123" },
    ]);
    expect(state.verifyPhase).toBe("idle");
    expect(state.analysisId).toBe("an_123");
  });

  it("surfaces an analyze failure without losing the verify step's data", () => {
    const start: AnalyzeState = { ...initialAnalyzeState(), step: "verify", extraction: extractionFixture };
    const state = analyzeReducer(
      analyzeReducer(start, { type: "analyze_started" }),
      { type: "analyze_failed", error: { message: "Неизвестная отрасль.", status: 400 } },
    );
    expect(state.step).toBe("verify");
    expect(state.extraction).toBe(extractionFixture);
    expect(state.error?.message).toBe("Неизвестная отрасль.");
  });
});

describe("client-side file pre-checks", () => {
  it("accepts the four documented extensions", () => {
    expect(isAcceptedExtension("report.pdf")).toBe(true);
    expect(isAcceptedExtension("report.XLSX")).toBe(true);
    expect(isAcceptedExtension("report.xls")).toBe(true);
    expect(isAcceptedExtension("report.csv")).toBe(true);
    expect(isAcceptedExtension("report.docx")).toBe(false);
  });

  it("flags a file over the 15MB limit before any network call", () => {
    const small = new File([new Uint8Array(1024)], "small.csv");
    const big = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "big.csv");
    expect(exceedsMaxSize(small)).toBe(false);
    expect(exceedsMaxSize(big)).toBe(true);
    expect(bytesToMB(MAX_UPLOAD_BYTES)).toBe(15);
  });
});

describe("buildAnalysisRequest", () => {
  it("echoes the (possibly edited) extraction values back with the document's settings", () => {
    const state: AnalyzeState = {
      ...initialAnalyzeState(),
      upload: {
        upload_id: "up_1",
        filename: "demo_company.csv",
        content_type: "text/csv",
        size_bytes: 100,
        detected_kind: "csv",
      },
      extraction: extractionFixture,
      values: extractionFixture.values,
      previousValues: extractionFixture.previous_values,
      industry: "manufacturing",
      currency: "KZT",
      scale: "thousands",
      audited: true,
    };

    const request = buildAnalysisRequest(state);
    expect(request).toEqual({
      upload_id: "up_1",
      industry: "manufacturing",
      currency: "KZT",
      scale: "thousands",
      latest_period: "31.12.2024",
      previous_period: "31.12.2023",
      audited: true,
      values: extractionFixture.values,
      previous_values: extractionFixture.previous_values,
    });
  });

  it("sends null (not an empty string) for an unset currency", () => {
    const request = buildAnalysisRequest({ ...initialAnalyzeState(), industry: "retail" });
    expect(request.currency).toBeNull();
  });
});
