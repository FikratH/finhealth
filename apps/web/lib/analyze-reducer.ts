// Pure client-side state machine for the /analyze upload → verify flow.
// No API calls happen here — `components/analyze/analyze-flow.tsx` calls
// `lib/api.ts` and dispatches the outcome. Keeping the machine pure makes
// every transition (including the ones that only show up under a race, like
// an extract() failure) directly testable without mocking fetch.
import type {
  AnalysisRequest,
  ExtractedValue,
  ExtractionResult,
  Industry,
  Scale,
  UploadedDocument,
} from "./api-types";

// Mirrors apps/api MAX_FILE_SIZE (see main.py: `Файл больше 15 МБ`).
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = [".pdf", ".xlsx", ".xls", ".csv"] as const;

export type AnalyzeStep = "upload" | "verify";
export type UploadPhase = "idle" | "uploading" | "extracting";
export type VerifyPhase = "idle" | "analyzing";
export type ValuePeriod = "latest" | "previous";

/** `message` is either the backend's RU detail string (pass through
 * verbatim) or a translation key: the literal `"timeout"` api.ts throws on
 * an aborted request, or one of its `"errors.*"` fallback keys. See
 * `lib/analyze-errors.ts` for telling the two apart. */
export interface AnalyzeError {
  message: string;
  status: number;
}

export interface AnalyzeState {
  step: AnalyzeStep;
  uploadPhase: UploadPhase;
  verifyPhase: VerifyPhase;
  file: File | null;
  industries: Industry[];
  industry: string;
  suggestedIndustry: string | null;
  upload: UploadedDocument | null;
  extraction: ExtractionResult | null;
  values: ExtractedValue[];
  previousValues: ExtractedValue[];
  scale: Scale;
  currency: string;
  audited: boolean;
  error: AnalyzeError | null;
  analysisId: string | null;
}

export function initialAnalyzeState(): AnalyzeState {
  return {
    step: "upload",
    uploadPhase: "idle",
    verifyPhase: "idle",
    file: null,
    industries: [],
    industry: "",
    suggestedIndustry: null,
    upload: null,
    extraction: null,
    values: [],
    previousValues: [],
    scale: "units",
    currency: "",
    audited: false,
    error: null,
    analysisId: null,
  };
}

export type AnalyzeAction =
  | { type: "industries_loaded"; industries: Industry[] }
  | { type: "file_selected"; file: File }
  | { type: "file_cleared" }
  | { type: "industry_selected"; industry: string }
  | { type: "upload_started" }
  | { type: "upload_succeeded"; upload: UploadedDocument }
  | { type: "extract_succeeded"; extraction: ExtractionResult }
  | { type: "upload_failed"; error: AnalyzeError }
  | { type: "value_edited"; period: ValuePeriod; metric: string; value: number | null }
  | { type: "scale_changed"; scale: Scale }
  | { type: "currency_changed"; currency: string }
  | { type: "audited_changed"; audited: boolean }
  | { type: "apply_suggested_industry" }
  | { type: "back_to_upload" }
  | { type: "analyze_started" }
  | { type: "analyze_succeeded"; analysisId: string }
  | { type: "analyze_failed"; error: AnalyzeError };

function editValue(
  list: ExtractedValue[],
  metric: string,
  value: number | null,
  fallbackPeriod: string | null,
): ExtractedValue[] {
  const index = list.findIndex((v) => v.metric === metric);
  if (index === -1) {
    // The metric had no value at all for this period (common for
    // previous_values, which — unlike values — isn't N/A-filled for every
    // dictionary metric). Manual entry synthesizes the row.
    return [
      ...list,
      {
        metric,
        original_label: "",
        value,
        currency: null,
        scale: null,
        period: fallbackPeriod,
        source: "",
        confidence: 0,
        snippet: "",
        manually_edited: true,
      },
    ];
  }
  const next = list.slice();
  next[index] = { ...next[index], value, manually_edited: true };
  return next;
}

export function analyzeReducer(state: AnalyzeState, action: AnalyzeAction): AnalyzeState {
  switch (action.type) {
    case "industries_loaded":
      return { ...state, industries: action.industries };

    case "file_selected":
      return { ...state, file: action.file, error: null };

    case "file_cleared":
      return { ...state, file: null };

    case "industry_selected":
      return { ...state, industry: action.industry };

    case "upload_started":
      return { ...state, uploadPhase: "uploading", error: null };

    case "upload_succeeded":
      return { ...state, upload: action.upload, uploadPhase: "extracting" };

    case "extract_succeeded": {
      const { extraction } = action;
      const suggested = extraction.suggested_industry ?? null;
      return {
        ...state,
        step: "verify",
        uploadPhase: "idle",
        extraction,
        values: extraction.values,
        previousValues: extraction.previous_values,
        scale: extraction.scale,
        currency: extraction.currency ?? "",
        audited: extraction.audited,
        suggestedIndustry: suggested,
        // First-run convenience only: if the user hadn't picked an industry
        // yet, adopt the suggestion. Never overwrite a deliberate choice —
        // the badge (not an overwrite) is how a later-arriving suggestion
        // that disagrees with the user's pick gets surfaced.
        industry: state.industry === "" && suggested ? suggested : state.industry,
        error: null,
      };
    }

    case "upload_failed":
      return { ...state, uploadPhase: "idle", error: action.error };

    case "value_edited": {
      const fallbackPeriod =
        action.period === "latest"
          ? (state.extraction?.latest_period ?? null)
          : (state.extraction?.previous_period ?? null);
      const key = action.period === "latest" ? "values" : "previousValues";
      return {
        ...state,
        [key]: editValue(state[key], action.metric, action.value, fallbackPeriod),
      };
    }

    case "scale_changed":
      return { ...state, scale: action.scale };

    case "currency_changed":
      return { ...state, currency: action.currency };

    case "audited_changed":
      return { ...state, audited: action.audited };

    case "apply_suggested_industry":
      return state.suggestedIndustry
        ? { ...state, industry: state.suggestedIndustry }
        : state;

    case "back_to_upload":
      return {
        ...state,
        step: "upload",
        uploadPhase: "idle",
        file: null,
        upload: null,
        extraction: null,
        values: [],
        previousValues: [],
        suggestedIndustry: null,
        error: null,
      };

    case "analyze_started":
      return { ...state, verifyPhase: "analyzing", error: null };

    case "analyze_succeeded":
      return { ...state, verifyPhase: "idle", analysisId: action.analysisId };

    case "analyze_failed":
      return { ...state, verifyPhase: "idle", error: action.error };

    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

// ---------------------------------------------------------------------------
// Pure helpers used both by the component and by tests.
// ---------------------------------------------------------------------------

export function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

export function isAcceptedExtension(filename: string): boolean {
  return (ACCEPTED_EXTENSIONS as readonly string[]).includes(fileExtension(filename));
}

export function exceedsMaxSize(file: File): boolean {
  return file.size > MAX_UPLOAD_BYTES;
}

export function bytesToMB(bytes: number): number {
  return bytes / (1024 * 1024);
}

/** Assembles the POST /api/analyze body from current state — the client
 * echoes back the (possibly user-edited) extraction values verbatim. */
export function buildAnalysisRequest(state: AnalyzeState): AnalysisRequest {
  return {
    upload_id: state.upload?.upload_id ?? null,
    industry: state.industry,
    currency: state.currency || null,
    scale: state.scale,
    latest_period: state.extraction?.latest_period ?? null,
    previous_period: state.extraction?.previous_period ?? null,
    audited: state.audited,
    values: state.values,
    previous_values: state.previousValues,
  };
}

export function findExtractedValue(
  list: ExtractedValue[],
  metric: string,
): ExtractedValue | undefined {
  return list.find((v) => v.metric === metric);
}
