// TypeScript mirrors of the FinHealth API contract.
//
// Hand-written, field-for-field against `docs/api-contract-v1.md` (frozen
// 2026-08-27, extended additively the same day with `risk_radar` and
// `benchmark.source`). Source of truth for field types is
// `apps/api/app/schemas.py` — when the two disagree, schemas.py wins and
// this file needs a follow-up edit, not the other way around.
//
// Nullability is copied exactly: a field the backend can send as `null`
// stays `| null` here even where that's inconvenient, because several of
// these nulls are semantically loaded (see `overall_score`, `value` on
// `ExtractedValue`, `beneish.flag`) and silently defaulting them to 0 or ""
// in a consuming component would misrepresent the analysis.

export type Scale = "units" | "thousands" | "millions" | "billions";

// ---------------------------------------------------------------------------
// GET /api/health
// ---------------------------------------------------------------------------

/** `vault_enabled` (P5.T8, additive): whether the server currently offers
 * opt-in document retention — read before ever showing the retain checkbox
 * (components/analyze/upload-step.tsx), so a signed-in user in the default
 * (vault-disabled) configuration never sees a control that would 503 the
 * whole upload.
 * `ocr_enabled` (P7.T4, additive): whether a scanned PDF (no text layer)
 * is actually routed through OCR server-side instead of erroring — read
 * before deciding whether to show the "or enable OCR" hint on a scanned-
 * PDF upload error (lib/analyze-errors.ts's errorHintKey). */
export interface HealthResponse {
  status: string;
  vault_enabled: boolean;
  ocr_enabled: boolean;
}

// ---------------------------------------------------------------------------
// GET /api/industries
// ---------------------------------------------------------------------------

export interface Industry {
  id: string;
  name: string;
  /** Additive (founder feedback R1): the EN display name, alongside `name`
   * rather than replacing it — see lib/format.ts's `localizedIndustryName`
   * for the locale-picking + fallback logic every consumer should use. */
  name_en: string;
  note: string;
  note_en: string;
}

export interface IndustriesResponse {
  industries: Industry[];
  disclaimer: string;
}

// ---------------------------------------------------------------------------
// GET /api/industries/{id}/benchmarks
// ---------------------------------------------------------------------------

/** One industry's full scoring configuration — apps/api/app/data/
 * benchmarks.json's per-industry entry, as `main.py`'s
 * `industry_benchmarks` endpoint returns it verbatim (`{industry, ...cfg,
 * disclaimer}`). Not used by `lib/simulator` (see that module's own header
 * comment for why a persisted AnalysisResult already carries everything
 * the simulator needs) — kept as a general-purpose API client addition,
 * e.g. for a future industry-comparison or "what would a different
 * industry's benchmarks say" feature. */
export interface IndustryBenchmarksResponse {
  industry: string;
  name: string;
  name_en: string;
  note: string;
  note_en: string;
  category_weights: Record<string, number>;
  excluded_ratios: string[];
  /** Keyed by ratio key (e.g. "current_ratio") — the same shape as
   * `IndustryBenchmark` above, minus the `ratio`/`source` fields the
   * per-analysis embedding adds. */
  ratios: Record<
    string,
    {
      weight: number;
      direction: string;
      good: [number, number];
      acceptable: [number, number];
      note: string;
      method: string;
      source?: string;
      source_url?: string;
      as_of?: string;
    }
  >;
  disclaimer: string;
}

// ---------------------------------------------------------------------------
// POST /api/upload
// ---------------------------------------------------------------------------

export interface UploadedDocument {
  upload_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  /** "pdf" | "xlsx" | "xls" | "csv" — detected from file content, not the extension. */
  detected_kind: string;
}

// ---------------------------------------------------------------------------
// POST /api/extract
// ---------------------------------------------------------------------------

export interface ExtractedValue {
  /** Standardized key, e.g. "revenue". Expense-magnitude metrics
   * (cost_of_goods_sold, interest_expense, capital_expenditures) always
   * arrive as POSITIVE magnitudes. */
  metric: string;
  /** The label exactly as it appears in the source document. */
  original_label: string;
  /** null = N/A — NEVER treat as 0. */
  value: number | null;
  currency?: string | null;
  /** null → the request-level (ExtractionResult/AnalysisRequest) scale applies. */
  scale?: Scale | null;
  period?: string | null;
  /** Page / sheet / cell reference the value was read from. */
  source: string;
  /** 0-100. */
  confidence: number;
  /** Raw fragment from the document, for provenance display. */
  snippet: string;
  manually_edited: boolean;
}

export interface ExtractionResult {
  upload_id: string;
  periods: string[];
  latest_period?: string | null;
  previous_period?: string | null;
  currency?: string | null;
  scale: Scale;
  audited: boolean;
  /** Latest period's values. */
  values: ExtractedValue[];
  /** Previous period's values, when a previous period was found. */
  previous_values: ExtractedValue[];
  warnings: string[];
  suggested_industry?: string | null;
}

// ---------------------------------------------------------------------------
// POST /api/analyze
// ---------------------------------------------------------------------------

export interface AnalysisRequest {
  upload_id?: string | null;
  industry: string;
  currency?: string | null;
  scale: Scale;
  latest_period?: string | null;
  previous_period?: string | null;
  audited: boolean;
  /** Client echoes back the (possibly user-edited) extraction values. */
  values: ExtractedValue[];
  previous_values: ExtractedValue[];
}

export type RatioStatus = "good" | "attention" | "critical" | "na";
export type RatioUnit = "x" | "%" | "money";

export interface IndustryBenchmark {
  ratio: string;
  weight: number;
  /** "higher" | "lower" | "range" */
  direction: string;
  good: [number, number];
  acceptable: [number, number];
  note: string;
  /** Citation string (e.g. "Damodaran (NYU Stern), Jan 2026") when an industry
   * benchmark backs this ratio; empty string for demonstration ranges. */
  source: string;
}

/** Additive (Phase 7 Task 5): a second, Kazakhstan-sourced reference POINT
 * — never a good/acceptable band, and never a factor in `status`/`score`
 * (those are decided by `benchmark` alone, unchanged). Present only when
 * apps/api/app/data/benchmarks_kz.json has an honestly citable entry for
 * this (industry, ratio) — coverage is deliberately partial. */
export interface IndustryBenchmarkKZ {
  ratio: string;
  value: number;
  note: string;
  /** Citation string, e.g. "Нацбанк РК / МВФ, Индикаторы фин. устойчивости, Табл. 5.5 (нефин. организации)". */
  source: string;
  source_url: string;
  /** e.g. "2024Q1" — the source's own last-populated quarter, not today's date. */
  as_of: string;
  method: string;
  /** Additive (round-1 fix, Finding 1): "economy_wide" when this is an
   * aggregate across Kazakhstan's whole non-financial corporate sector
   * (not specific to the ratio's own industry — the UI renders a
   * distinct label for this case) or "industry" when it genuinely is
   * sector-specific (e.g. the banking entries). */
  scope: string;
}

export interface RatioResult {
  key: string;
  name: string;
  category: string;
  formula: string;
  inputs: Record<string, number | null>;
  /** The formula with the user's actual values substituted in — powers provenance. */
  substitution: string;
  value: number | null;
  unit: RatioUnit;
  /** Money-unit ratios are informational only: always status "na", score null. */
  status: RatioStatus;
  /** 0-100 inside its category; null when not scoreable. */
  score: number | null;
  benchmark?: IndustryBenchmark | null;
  /** Additive (Phase 7 Task 5) — see IndustryBenchmarkKZ. */
  benchmark_kz?: IndustryBenchmarkKZ | null;
  explanation: string;
  applicable: boolean;
  warnings: string[];
}

export interface CategoryScore {
  category: string;
  label: string;
  /** null => not enough data to score this category. */
  score: number | null;
  weight: number;
  ratios_used: number;
}

export interface Recommendation {
  problem: string;
  ratio: string;
  current_value?: number | null;
  benchmark_hint: string;
  action: string;
  expected_effect: string;
  tradeoffs: string;
  /** "high" | "medium" | "low" */
  priority: string;
  /** "low" | "medium" | "high" */
  difficulty: string;
}

export interface AnalysisWarning {
  /** Stable, machine-readable: "score", a ratio key, "market", "benchmarks", ... */
  code: string;
  message: string;
}

export interface ConfidenceBreakdown {
  total: number;
  data_completeness: number;
  extraction_confidence: number;
  manual_corrections: number;
  has_previous_period: boolean;
  has_industry_benchmarks: boolean;
  audited: boolean;
  notes: string[];
}

export interface PiotroskiSignal {
  key: string;
  name: string;
  value: boolean | null;
  detail: string;
}

export interface PiotroskiResult {
  score: number;
  max: number;
  signals: PiotroskiSignal[];
  interpretation: string;
}

export interface BeneishResult {
  /** null when fewer than 6 of the 8 required indices could be computed. */
  m_score: number | null;
  indices: Record<string, number | null>;
  /** Always null whenever m_score is null. */
  flag: string | null;
  /** Index keys that were missing from the data and replaced with neutral
   * values — NOT estimated from other figures. */
  substituted: string[];
  interpretation: string;
}

export interface DuPontResult {
  net_margin: number | null;
  asset_turnover: number | null;
  equity_multiplier: number | null;
  roe: number | null;
}

/** Advanced financial scoring models bundle. Additive as of the 2026-08-27
 * contract extension: absent on analyses persisted before that date, but
 * always present on newly created ones — see the `risk_radar?` field note
 * on `AnalysisResult` below. */
export interface RiskRadar {
  /** Same RatioResult shape as ratios[]'s "altman_z" entry; may be null. */
  altman: RatioResult | null;
  /** Always non-null within a present risk_radar. */
  piotroski: PiotroskiResult;
  /** Always non-null within a present risk_radar. */
  beneish: BeneishResult;
  dupont: DuPontResult | null;
}

export interface AnalysisResult {
  analysis_id: string;
  created_at: string;
  industry: string;
  industry_name: string;
  /** Additive (founder feedback R1): may be `""` on an analysis persisted
   * before this field existed — pass both this and `industry_name` through
   * lib/format.ts's `localizedIndustryName` rather than rendering it
   * directly. */
  industry_name_en: string;
  currency?: string | null;
  scale: Scale;
  latest_period?: string | null;
  previous_period?: string | null;
  /** null means insufficient data to score — health_label then reads
   * «Недостаточно данных для оценки». Never render null as 0. */
  overall_score: number | null;
  health_label: string;
  category_scores: CategoryScore[];
  ratios: RatioResult[];
  strengths: string[];
  risks: string[];
  recommendations: Recommendation[];
  warnings: AnalysisWarning[];
  confidence: ConfidenceBreakdown;
  missing_metrics: string[];
  /** Present on every newly created analysis. Typed as optional (rather than
   * nullable) because older stored payloads, persisted before the
   * 2026-08-27 additive extension, don't have the field at all — callers
   * must handle `undefined`, not just a null risk_radar. */
  risk_radar?: RiskRadar;
  /** The verified values this analysis was computed from (latest period
   * only, scale-defaulted, otherwise verbatim). Same optionality reasoning
   * as `risk_radar`: present on every newly created analysis, absent on
   * payloads stored before the 2026-08-27 additive extension — callers
   * must handle `undefined`. Powers the ratio detail disclosure's
   * provenance trace (lib/results.ts's `traceRatioInputs`): match a key in
   * a ratio's `inputs{}` against `source_values[].metric` to find the
   * document line it came from; no match means the input is derived
   * (an average, a subtotal, an alias) rather than read directly. */
  source_values?: ExtractedValue[];
  /** Present only once `POST /api/analysis/{id}/narrative` has succeeded at
   * least once — absent on every analysis that hasn't asked for it (or
   * whose request came back 503/502). The app is fully functional without
   * it; see `NarrativeResult` below. */
  narrative?: NarrativeResult;
  disclaimer: string;
}

// ---------------------------------------------------------------------------
// DELETE /api/analysis/{id}
// ---------------------------------------------------------------------------

export interface DeleteAnalysisResponse {
  deleted: string;
}

// ---------------------------------------------------------------------------
// GET /api/my/analyses, DELETE /api/my/analyses/{id}
// ---------------------------------------------------------------------------

/** One row of the signed-in user's analysis history — a summary
 * projection (apps/api/app/routers/my.py's `my_analyses` endpoint), never the
 * full `AnalysisResult` payload. */
export interface MyAnalysisSummary {
  analysis_id: string;
  created_at: string;
  industry_name: string;
  /** Additive (founder feedback R1), same fallback rules as
   * AnalysisResult.industry_name_en above — the projection already
   * degrades to the RU name server-side (apps/api/app/routers/my.py) when
   * a row predates this field, but stays a plain string here (never
   * empty) rather than optional. */
  industry_name_en: string;
  /** null means insufficient data to score, same meaning as
   * `AnalysisResult.overall_score` — never render as 0. */
  overall_score: number | null;
  health_label: string;
}

export interface MyAnalysesResponse {
  /** The caller's entitlement plan (apps/api/app/entitlements.py) —
   * "free" | "pro". Display-only: no endpoint enforces a limit yet, so
   * this powers a quiet chip on the history page, nothing else. */
  plan: string;
  analyses: MyAnalysisSummary[];
}

// ---------------------------------------------------------------------------
// GET /api/my/documents, DELETE /api/my/documents/{id}
// ---------------------------------------------------------------------------

/** One row of the signed-in user's retained-document vault (P5.T7,
 * apps/api/app/routers/my.py's `my_documents` endpoint) — metadata only, never
 * the document's raw bytes. */
export interface MyDocumentSummary {
  doc_id: string;
  filename: string;
  /** "pdf" | "xlsx" | "xls" | "csv" — same vocabulary as
   * UploadedDocument.detected_kind. */
  kind: string;
  size_bytes: number;
  created_at: string;
}

export interface MyDocumentsResponse {
  documents: MyDocumentSummary[];
}

export interface DeleteDocumentResponse {
  deleted: string;
}

// ---------------------------------------------------------------------------
// POST /api/analysis/{id}/narrative
// ---------------------------------------------------------------------------

/** The LLM narrative layer's output — prose AROUND the already-computed
 * numbers above, never a source of numbers itself (see
 * apps/api/app/services/narrative.py's prompt contract). Optional and
 * provider-agnostic: `POST /api/analysis/{id}/narrative` returns 503 when
 * no key is configured server-side, 502 on any provider/parse failure. */
export interface NarrativeResult {
  text_ru: string;
  text_en: string;
  model: string;
  generated_at: string;
}

// ---------------------------------------------------------------------------
// POST /api/waitlist
// ---------------------------------------------------------------------------

/** The Pro waitlist signup's only two outcomes (P6.T6) — always a 200
 * either way, never a 409: "already_joined" is a normal, honest result,
 * not an error. */
export interface WaitlistResponse {
  status: "joined" | "already_joined";
}
