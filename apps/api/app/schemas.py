"""Pydantic schemas shared across the API."""
from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class Scale(str, Enum):
    units = "units"
    thousands = "thousands"
    millions = "millions"
    billions = "billions"


SCALE_MULTIPLIER = {
    Scale.units: 1,
    Scale.thousands: 1_000,
    Scale.millions: 1_000_000,
    Scale.billions: 1_000_000_000,
}


class ExtractRequest(BaseModel):
    upload_id: str


class UploadedDocument(BaseModel):
    upload_id: str
    filename: str
    content_type: str
    size_bytes: int
    detected_kind: str  # pdf | xlsx | xls | csv


class ExtractedValue(BaseModel):
    metric: str                      # standardized key, e.g. "revenue"
    original_label: str              # label as it appears in the document
    value: Optional[float] = None    # numeric value in document scale; None => N/A
    currency: Optional[str] = None
    scale: Optional[Scale] = None
    period: Optional[str] = None
    source: str = ""                 # page / sheet / cell reference
    confidence: float = Field(0, ge=0, le=100)
    snippet: str = ""                # raw fragment from the document
    manually_edited: bool = False


class PeriodSelectionMeta(BaseModel):
    """Additive (P7.T3c): which periods were picked as latest/previous and
    why. Exists so a verify-step can show provenance for the *period*
    choice itself, the way ExtractedValue.source/snippet already does for
    each value."""
    chosen: list[str] = []
    rejected: list[str] = []
    reason: str = ""


class ExtractionResult(BaseModel):
    upload_id: str
    periods: list[str] = []
    latest_period: Optional[str] = None
    previous_period: Optional[str] = None
    currency: Optional[str] = None
    scale: Scale = Scale.units
    audited: bool = False
    values: list[ExtractedValue] = []          # latest period
    previous_values: list[ExtractedValue] = [] # previous period, when present
    warnings: list[str] = []
    suggested_industry: Optional[str] = None
    period_selection: Optional[PeriodSelectionMeta] = None  # additive, P7.T3c


class RatioStatus(str, Enum):
    good = "good"
    attention = "attention"
    critical = "critical"
    na = "na"


class IndustryBenchmark(BaseModel):
    ratio: str
    weight: float
    direction: str                   # higher | lower | range
    good: list[float]
    acceptable: list[float]
    note: str = ""
    source: str = ""


class IndustryBenchmarkKZ(BaseModel):
    """Additive (P7.T5): a second, KZ-sourced reference POINT — never a
    good/acceptable band, and never used for scoring. See
    scripts/build_benchmarks_kz.py for provenance and
    app/services/benchmarks_kz.py for the lookup (which industry/ratio
    pairs resolve). The UI marks `value` alongside the global benchmark's
    band on CalibrationScale; verdicts keep using `benchmark` only."""
    ratio: str
    value: float
    note: str = ""
    source: str = ""
    source_url: str = ""
    as_of: str = ""
    method: str = ""
    # Additive (P7.T5 round-1 fix, Finding 1): "economy_wide" | "industry" —
    # lets the UI tell an economy-wide КЗ/РК mark (the "all" bucket — not
    # specific to the caller's own industry) apart from a genuinely
    # industry-specific one (e.g. banking), instead of only disclosing the
    # distinction in a per-entry `note` that no UI surface ever rendered.
    scope: str = ""


class RatioResult(BaseModel):
    key: str
    name: str
    category: str
    formula: str
    inputs: dict[str, Optional[float]] = {}
    substitution: str = ""
    value: Optional[float] = None
    unit: str = "x"                  # x | % | money
    status: RatioStatus = RatioStatus.na
    score: Optional[float] = None    # 0..100 inside its category
    benchmark: Optional[IndustryBenchmark] = None
    # Additive (P7.T5): present only when a citable KZ reference point
    # exists for this (industry, ratio) — coverage is deliberately partial.
    benchmark_kz: Optional[IndustryBenchmarkKZ] = None
    explanation: str = ""
    applicable: bool = True
    warnings: list[str] = []


class Recommendation(BaseModel):
    problem: str
    ratio: str
    current_value: Optional[float] = None
    benchmark_hint: str = ""
    action: str
    expected_effect: str
    tradeoffs: str
    priority: str                    # high | medium | low
    difficulty: str                  # low | medium | high


class Warning_(BaseModel):
    code: str
    message: str


class ConfidenceBreakdown(BaseModel):
    total: float = Field(0, ge=0, le=100)
    data_completeness: float = 0
    extraction_confidence: float = 0
    manual_corrections: int = 0
    has_previous_period: bool = False
    has_industry_benchmarks: bool = False
    audited: bool = False
    notes: list[str] = []


class PiotroskiSignal(BaseModel):
    key: str
    name: str
    value: Optional[bool] = None
    detail: str = ""


class PiotroskiResult(BaseModel):
    score: int
    max: int
    signals: list[PiotroskiSignal] = []
    interpretation: str = ""


class BeneishResult(BaseModel):
    m_score: Optional[float] = None
    indices: dict[str, Optional[float]] = {}
    flag: Optional[str] = None
    substituted: list[str] = []
    interpretation: str = ""


class DuPontResult(BaseModel):
    net_margin: Optional[float] = None
    asset_turnover: Optional[float] = None
    equity_multiplier: Optional[float] = None
    roe: Optional[float] = None


class RiskRadar(BaseModel):
    altman: Optional[RatioResult] = None
    piotroski: PiotroskiResult
    beneish: BeneishResult
    dupont: Optional[DuPontResult] = None


class CategoryScore(BaseModel):
    category: str
    label: str
    score: Optional[float] = None    # None => not enough data
    weight: float = 0
    ratios_used: int = 0


class AnalysisRequest(BaseModel):
    upload_id: Optional[str] = None
    industry: str
    currency: Optional[str] = None
    scale: Scale = Scale.units
    latest_period: Optional[str] = None
    previous_period: Optional[str] = None
    audited: bool = False
    values: list[ExtractedValue]
    previous_values: list[ExtractedValue] = []


class AnalysisResult(BaseModel):
    analysis_id: str
    created_at: str
    industry: str
    industry_name: str
    currency: Optional[str] = None
    scale: Scale
    latest_period: Optional[str] = None
    previous_period: Optional[str] = None
    overall_score: Optional[float]
    health_label: str
    category_scores: list[CategoryScore]
    ratios: list[RatioResult]
    strengths: list[str]
    risks: list[str]
    recommendations: list[Recommendation]
    warnings: list[Warning_]
    confidence: ConfidenceBreakdown
    missing_metrics: list[str] = []
    risk_radar: Optional[RiskRadar] = None
    # The verified values this analysis was computed from — latest period
    # only, scale-defaulted, otherwise untouched (see run_analysis). Powers
    # frontend provenance: every ratio traces back to the document line it
    # came from. Additive: absent on payloads stored before this field
    # existed, which is why it defaults to [] rather than being required.
    source_values: list[ExtractedValue] = []
    disclaimer: str = (
        "Сервис не заменяет профессиональную финансовую консультацию. "
        "Часть отраслевых ориентиров основана на данных Damodaran (NYU Stern, "
        "янв. 2026); остальные являются демонстрационными и помечены соответствующим "
        "образом."
    )


class MyAnalysisSummary(BaseModel):
    """One row of GET /api/my/analyses — a projection, never the full
    AnalysisResult payload."""
    analysis_id: str
    created_at: str
    industry_name: str
    overall_score: Optional[float]
    health_label: str


class MyAnalysesResponse(BaseModel):
    # Additive (P5.T5): the caller's entitlement plan, so the frontend can
    # show a quiet chip without a second request. Enforcement is off — this
    # is display-only, see app/entitlements.py.
    plan: str = "free"
    analyses: list[MyAnalysisSummary]


class MyDocumentSummary(BaseModel):
    """One row of GET /api/my/documents — a retained document's metadata,
    never its raw bytes (see app/services/vault.py's VaultDocument, which
    this mirrors field-for-field)."""
    doc_id: str
    filename: str
    kind: str            # pdf | xlsx | xls | csv
    size_bytes: int
    created_at: str


class MyDocumentsResponse(BaseModel):
    documents: list[MyDocumentSummary]


class WaitlistRequest(BaseModel):
    email: EmailStr
    # Where the signup happened — the pricing page's Pro CTA is the only
    # call site today, so this defaults to that; additive if a future call
    # site (e.g. a future upgrade-prompt banner) passes something else.
    source: str = "pricing_page"


class WaitlistResponse(BaseModel):
    status: str  # "joined" | "already_joined" — always a 200 either way


class NarrativeResult(BaseModel):
    text_ru: str
    text_en: str
    model: str
    generated_at: str


def health_label(score: Optional[float]) -> str:
    if score is None:
        return "Недостаточно данных для оценки"
    if score < 25:
        return "Критическое состояние"
    if score < 45:
        return "Слабое состояние"
    if score < 65:
        return "Удовлетворительное состояние"
    if score < 80:
        return "Хорошее состояние"
    return "Сильное состояние"
