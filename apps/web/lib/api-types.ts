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
// GET /api/industries
// ---------------------------------------------------------------------------

export interface Industry {
  id: string;
  name: string;
  note: string;
}

export interface IndustriesResponse {
  industries: Industry[];
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
  disclaimer: string;
}

// ---------------------------------------------------------------------------
// DELETE /api/analysis/{id}
// ---------------------------------------------------------------------------

export interface DeleteAnalysisResponse {
  deleted: string;
}
