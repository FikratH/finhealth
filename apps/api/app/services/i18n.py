"""Read-time locale translation for a stored AnalysisResult payload.

Architecture (founder feedback R1 — full API i18n): the canonical stored
payload is ALWAYS Russian — `POST /api/analyze` and `storage.save_analysis`
are completely unchanged by this module. `GET /api/analysis/{id}` (and,
additively, `POST /api/analyze`) accept `?locale=ru|en`; `ru` (the default)
returns the stored payload byte-for-byte untouched — this module is never
even called on that path, so every existing RU golden stays frozen by
construction. `en` runs the payload through `localize_payload()` here,
which re-DERIVES every RU string from the same structured numeric fields
(ratio value/unit/status/key, category scores, confidence booleans, the
live `benchmarks.json`/`benchmarks_kz.json` data) that produced the RU
text in the first place — it does not parse or machine-translate the
stored RU sentences. This works uniformly for analyses persisted before
this module existed too: every field it reads (RatioResult.value/unit/
status/key/inputs, CategoryScore.score/weight, ConfidenceBreakdown's
booleans, BeneishResult.m_score/flag/substituted/indices,
PiotroskiResult.score/max) has been part of the schema since before any
locale concept existed, so there is no "legacy payload" branch for most of
the payload.

Two narrow spots genuinely cannot be re-derived from numbers alone and use
a closed, code-controlled vocabulary lookup instead (never a parse of
arbitrary/user/document text): the small set of per-ratio caveat
sentences ratios.py emits (`RATIO_WARNING_EN`, ~20 fixed strings, zero of
them ever contain a document-derived value) and the numeric figures
embedded in Piotroski's nine signal `detail` strings (i18n_risk_radar.py
regex-extracts the numbers OUR OWN `_fmt()` produced and re-emits them in
an English template — the numbers themselves are copied verbatim, never
re-derived or guessed). Both degrade to the original RU string, never a
crash or a half-translated sentence, the moment a lookup misses — see each
function's own docstring.
"""
from __future__ import annotations

import re
from typing import Optional

from . import scoring as S
from .i18n_ratios import (
    localize_ratio, localize_ratio_warning, localize_ratio_warnings,
)

Locale = str  # "ru" | "en" — plain str so this stays JSON-payload-friendly.
DEFAULT_LOCALE: Locale = "ru"
SUPPORTED_LOCALES = {"ru", "en"}


def normalize_locale(raw: Optional[str]) -> Locale:
    """Anything other than a recognized locale (missing, empty, "RU", a
    typo, a future locale this deployment doesn't know yet) falls back to
    the default RU — additive query params must never 400 an otherwise
    valid request over a locale typo."""
    if not raw:
        return DEFAULT_LOCALE
    lowered = raw.strip().lower()
    return lowered if lowered in SUPPORTED_LOCALES else DEFAULT_LOCALE


# ---------------------------------------------------------------------------
# Health label / category labels — pure band lookups, mirroring
# schemas.health_label() and ratios.CATEGORY_LABELS exactly (band edges
# copied, not reimplemented independently, so the two can never drift).
# ---------------------------------------------------------------------------
def health_label_en(score: Optional[float]) -> str:
    if score is None:
        return "Not enough data to score"
    if score < 25:
        return "Critical condition"
    if score < 45:
        return "Weak condition"
    if score < 65:
        return "Satisfactory condition"
    if score < 80:
        return "Good condition"
    return "Strong condition"


CATEGORY_LABELS_EN: dict[str, str] = {
    "liquidity": "Liquidity",
    "leverage": "Leverage",
    "profitability": "Profitability",
    "efficiency": "Operating Efficiency",
    "cashflow": "Cash Flow",
    "market": "Market Valuation",
}

# ---------------------------------------------------------------------------
# Metric names (app/services/metrics.py's METRICS[*]['name'], RU -> EN).
# Reverse-keyed by the RU display name (not the dict key) because that's
# what's already baked into stored payloads (AnalysisResult.missing_metrics
# is a list of *names*, not keys) — see localize_missing_metrics below.
# Mirrors apps/web/lib/metric-names.ts's EN column so the same metric
# reads identically whether it's named by the API or the web (F5 fix:
# `sga_expense` had drifted to a spelled-out variant — corrected to
# metric-names.ts's own "SG&A Expenses").
# ---------------------------------------------------------------------------
METRIC_NAME_RU_TO_EN: dict[str, str] = {
    "Выручка": "Revenue",
    "Себестоимость": "Cost of Goods Sold",
    "Валовая прибыль": "Gross Profit",
    "Операционная прибыль (EBIT)": "Operating Income (EBIT)",
    "EBITDA": "EBITDA",
    "Процентные расходы": "Interest Expense",
    "Чистая прибыль": "Net Income",
    "Итого активы": "Total Assets",
    "Оборотные активы": "Current Assets",
    "Денежные средства": "Cash and Cash Equivalents",
    "Краткосрочные финансовые вложения": "Short-Term Investments",
    "Дебиторская задолженность": "Accounts Receivable",
    "Запасы": "Inventory",
    "Итого обязательства": "Total Liabilities",
    "Краткосрочные обязательства": "Current Liabilities",
    "Кредиторская задолженность": "Accounts Payable",
    "Процентный долг": "Interest-Bearing Debt",
    "Собственный капитал": "Shareholders' Equity",
    "Денежный поток от операционной деятельности": "Operating Cash Flow",
    "Капитальные затраты (CAPEX)": "Capital Expenditures (CapEx)",
    "Количество акций": "Shares Outstanding",
    "Прибыль на акцию (EPS)": "Earnings Per Share (EPS)",
    "Цена акции": "Share Price",
    "Рыночная капитализация": "Market Capitalization",
    "Нераспределённая прибыль": "Retained Earnings",
    "Основные средства": "Property, Plant & Equipment",
    "Долгосрочные займы": "Long-Term Debt",
    "Амортизация": "Depreciation & Amortization",
    "Коммерческие и управленческие расходы": "SG&A Expenses",
}


def localize_metric_name(ru_name: str) -> str:
    """RU display name -> EN. Unknown input (a name this dictionary has
    never seen — only possible for a payload from a future metrics.py
    entry this module hasn't been updated for yet) degrades to the RU
    name unchanged rather than raising, per this module's fallback law."""
    return METRIC_NAME_RU_TO_EN.get(ru_name, ru_name)


def localize_missing_metrics(missing_metrics: list[str]) -> list[str]:
    return [localize_metric_name(n) for n in missing_metrics]


# Per-ratio explanation/warnings/benchmark-citation localization lives in
# i18n_ratios.py (split out for file-size discipline — see this module's
# own docstring). `localize_ratio`/`localize_ratio_warning(s)` are
# imported at the top of this file; `localize_ratio_warning` is reused
# below by localize_top_warning (top-level AnalysisResult.warnings coded
# by ratio key shares the exact same closed-vocabulary table).


# ---------------------------------------------------------------------------
# Recommendations / strengths / risks — see i18n_recommendations.py (split
# out for file-size discipline: the largest single piece of this i18n
# surface). Imported lazily inside localize_payload(), same reasoning as
# i18n_risk_radar's deferred import above.
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Confidence notes — recomputed from ConfidenceBreakdown's own booleans/
# counts (has_previous_period, manual_corrections, audited) plus the
# already-localized missing_metrics list, mirroring
# scoring.compute_confidence's note-building order exactly (no-previous,
# manual, audited, missing — see that function).
#
# DELIBERATE upward divergence, do not "fix" to match RU: the RU note's
# own missing-values list (scoring.compute_confidence's `missing = [v.metric
# for v in values if v.value is None]`) uses raw metric KEYS ("ebitda",
# "shares_outstanding"), not the display names `AnalysisResult.
# missing_metrics` carries. The EN note below uses `missing_metrics_en` —
# real display names ("EBITDA", "Shares Outstanding") — because there's no
# reason to import the RU sentence's own rougher edge into a fresh
# translation when a cleaner source was already sitting right there. A
# future parity pass should leave this alone; if anything, the RU sentence
# is the one that should eventually switch to display names too (tracked
# as a both-locales backlog item, not part of this round).
# ---------------------------------------------------------------------------
def confidence_notes_en(confidence: dict, missing_metrics_en: list[str]) -> list[str]:
    notes: list[str] = []
    if not confidence.get("has_previous_period"):
        notes.append(
            "No comparative period: average values were replaced with period-end values, "
            "reducing the accuracy of ROA/ROE and turnover ratios.")
    manual = confidence.get("manual_corrections") or 0
    if manual:
        notes.append(f"Manually verified/corrected values: {manual} — these values are "
                     "treated as confirmed.")
    if confidence.get("audited"):
        notes.append("The document mentions an audit of the financial statements.")
    if missing_metrics_en:
        shown = missing_metrics_en[:8]
        tail = "…" if len(missing_metrics_en) > 8 else ""
        notes.append("For better accuracy, add: " + ", ".join(shown) + tail + ".")
    return notes


# ---------------------------------------------------------------------------
# Top-level AnalysisResult.warnings — the "score" code is recomputed from
# category_scores (which categories have score=None and weight>0, mirroring
# scoring.overall_score's own `skipped` list); every other code is either a
# per-ratio caveat (same closed-vocabulary table as ratio warnings) or one
# of three fully static sentences (market/beneish/benchmarks — see
# analysis.run_analysis).
# ---------------------------------------------------------------------------
_STATIC_TOP_WARNING_EN: dict[str, str] = {
    "Рыночные данные отсутствуют — рыночные мультипликаторы (P/E, P/B, EV/EBITDA) не рассчитывались.":
        "Market data is not available — market multiples (P/E, P/B, EV/EBITDA) were not calculated.",
    "M-Score Бениша не рассчитан: модели требуются данные за два периода и "
    "дополнительные метрики (основные средства, амортизация, коммерческие/"
    "управленческие расходы), которых недостаточно в извлечённых данных.":
        "The Beneish M-Score was not calculated: the model needs two periods of data plus "
        "additional metrics (property/plant/equipment, depreciation, SG&A expenses) that "
        "the extracted data doesn't provide.",
    "Часть отраслевых ориентиров основана на данных Damodaran (NYU Stern, "
    "янв. 2026); остальные являются демонстрационными и помечены соответствующим "
    "образом.":
        "Some industry benchmarks are based on Damodaran data (NYU Stern, Jan 2026); "
        "the rest are demonstration ranges, marked as such.",
}


def _score_note_en(category_scores: list[dict]) -> Optional[str]:
    """Mirrors scoring.overall_score's own branch order exactly: it checks
    `available` (categories that actually scored) FIRST, and only talks
    about renormalization in the branch where at least one category did.
    F1 fix: the earlier version skipped straight to the renormalization
    sentence whenever any category lacked a score — which, when NO
    category has data at all (`overall_score` is null, a first-class UI
    state), asserted a renormalization that never happened, listing every
    category as if weights had been redistributed among the others."""
    available = [c for c in category_scores
                if c.get("score") is not None and (c.get("weight") or 0) > 0]
    if not available:
        return "Not enough data in any scoring category."
    skipped = [CATEGORY_LABELS_EN.get(c.get("category"), c.get("label"))
               for c in category_scores
               if c.get("score") is None and (c.get("weight") or 0) > 0]
    if not skipped:
        return None
    return ("Categories without data were excluded from the calculation, weights were "
           "renormalized: " + ", ".join(skipped) + ".")


def localize_top_warning(warning: dict, category_scores: list[dict]) -> dict:
    code = warning.get("code", "")
    message = warning.get("message", "")
    if code == "score":
        note = _score_note_en(category_scores)
        return {"code": code, "message": note if note is not None else message}
    static = _STATIC_TOP_WARNING_EN.get(message)
    if static is not None:
        return {"code": code, "message": static}
    # Everything else is coded by ratio key (see analysis.run_analysis's
    # `Warning_(code=r.key, message=w)` loop) — same closed-vocabulary
    # per-ratio table as RatioResult.warnings.
    return {"code": code, "message": localize_ratio_warning(message)}


def localize_warnings(warnings: list[dict], category_scores: list[dict]) -> list[dict]:
    return [localize_top_warning(w, category_scores) for w in warnings]


# ---------------------------------------------------------------------------
# Disclaimer (schemas.BENCHMARK_SOURCES_DISCLAIMER + AnalysisResult's own
# leading sentence) — two fully static strings, translated once here.
# ---------------------------------------------------------------------------
BENCHMARK_SOURCES_DISCLAIMER_EN = (
    "Some industry benchmarks are based on Damodaran data (NYU Stern, Jan 2026); "
    "for Kazakhstan, an additional reference point from the National Bank of "
    "Kazakhstan / IMF (Financial Soundness Indicators) is shown where an official "
    "public source exists; the remaining benchmarks are demonstration ranges, "
    "marked as such."
)

DISCLAIMER_EN = (
    "This service does not replace professional financial advice. "
    + BENCHMARK_SOURCES_DISCLAIMER_EN
)


# ---------------------------------------------------------------------------
# source_values[].source — provenance references (extraction.py's
# `_rows_from_matrix`/`_Row.source`, e.g. "PDF, стр. 5 (текст), строка 12")
# rendered directly in the ratio-detail source popover
# (components/analyze/source-popover.tsx). A closed set of five prefix
# shapes (CSV / an XLSX-or-XLS sheet name / a PDF ruling-line table / a
# PDF text-layer reconstruction / an OCR-recognized page) each followed by
# ", строка N" — every number is extraction's own row/page/table index,
# never a value from the document itself. The XLSX/XLS sheet NAME is the
# one genuinely user-authored substring here and is deliberately passed
# through untouched, same principle as `original_label` elsewhere in this
# product: it is the workbook's own text, not the app's, and translating
# it would misrepresent what the source file actually says.
# ---------------------------------------------------------------------------
_SOURCE_REF_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"^CSV, строка (?P<row>\d+)$"), "CSV, row {row}"),
    (re.compile(r"^Лист «(?P<sheet>.+)», строка (?P<row>\d+)$"), "Sheet «{sheet}», row {row}"),
    (re.compile(r"^PDF, стр\. (?P<page>\d+), таблица (?P<table>\d+), строка (?P<row>\d+)$"),
     "PDF, p. {page}, table {table}, row {row}"),
    (re.compile(r"^PDF, стр\. (?P<page>\d+) \(текст\), строка (?P<row>\d+)$"),
     "PDF, p. {page} (text), row {row}"),
    (re.compile(r"^PDF, стр\. (?P<page>\d+) \(распознано OCR\), строка (?P<row>\d+)$"),
     "PDF, p. {page} (OCR-recognized), row {row}"),
]


def localize_source_ref(source: str) -> str:
    if not source:
        return source
    for pattern, template in _SOURCE_REF_PATTERNS:
        m = pattern.match(source)
        if m:
            return template.format(**m.groupdict())
    return source  # unrecognized shape — RU fallback, never a crash


def localize_source_values(source_values: list[dict]) -> list[dict]:
    return [{**v, "source": localize_source_ref(v.get("source", ""))} for v in source_values]


def industry_name_en(payload: dict, industry: str) -> str:
    """F3 fix: `industry_name_en` was only added to `AnalysisResult` in a
    prior founder-R1 round, so a genuinely legacy payload stored before
    that round has it absent/empty — the old fallback
    (`industry_name_en or industry_name`) then silently returned the RU
    name under `?locale=en`. `benchmarks.json` has carried `name_en` for
    every industry since that same round, so a FRESH lookup by the
    payload's own `industry` id (same pattern `i18n_ratios.py`'s
    `_industry_benchmark_entry` already uses for benchmark notes) gets the
    real EN name for a legacy payload too, rather than only ever reading
    what happened to be stored at analysis time. Falls back to the stored
    RU name only if the industry id itself is now unknown (a genuinely
    unrecoverable case — an industry removed from benchmarks.json since
    this analysis was made)."""
    stored_en = payload.get("industry_name_en")
    if stored_en:
        return stored_en
    try:
        cfg = S.get_industry(industry)
    except KeyError:
        cfg = None
    if cfg and cfg.get("name_en"):
        return cfg["name_en"]
    return payload.get("industry_name", "")


# ---------------------------------------------------------------------------
# Top-level orchestrator.
# ---------------------------------------------------------------------------
def localize_payload(payload: dict) -> dict:
    """Returns a NEW dict — the stored `payload` is never mutated in
    place, so a caller holding the original (e.g. a cache) is unaffected.
    Only ever called for locale="en"; the "ru" (default) path in main.py
    returns the stored payload as-is and never reaches this function."""
    from . import i18n_recommendations as REC
    from . import i18n_risk_radar as RR

    out = dict(payload)
    industry = payload.get("industry", "")

    out["health_label"] = health_label_en(payload.get("overall_score"))
    out["industry_name"] = industry_name_en(payload, industry)

    out["category_scores"] = [
        {**c, "label": CATEGORY_LABELS_EN.get(c.get("category"), c.get("label"))}
        for c in payload.get("category_scores", [])
    ]

    ratios = [localize_ratio(r, industry) for r in payload.get("ratios", [])]
    out["ratios"] = ratios

    out["recommendations"] = REC.build_recommendations_en(ratios)
    strengths, risks = REC.strengths_and_risks_en(ratios)
    out["strengths"] = strengths
    out["risks"] = risks

    missing_en = localize_missing_metrics(payload.get("missing_metrics", []))
    out["missing_metrics"] = missing_en

    confidence = dict(payload.get("confidence") or {})
    confidence["notes"] = confidence_notes_en(confidence, missing_en)
    out["confidence"] = confidence

    out["warnings"] = localize_warnings(payload.get("warnings", []), out["category_scores"])

    if payload.get("source_values"):
        out["source_values"] = localize_source_values(payload["source_values"])

    if payload.get("risk_radar"):
        out["risk_radar"] = RR.localize_risk_radar(payload["risk_radar"])

    out["disclaimer"] = DISCLAIMER_EN
    return out
