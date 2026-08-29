"""English localization for a single RatioResult (explanation, warnings,
and the benchmark/benchmark_kz citation fields riding alongside it). Split
out from i18n.py for file-size discipline (see extraction_headers.py's
own split for the precedent) — this is the largest single per-item
translator in the i18n surface.

Same rule as i18n.py: `explanation` is re-DERIVED from the ratio's own
structured fields (value/unit/status/key/inputs) plus a fresh lookup into
the live benchmarks.json/benchmarks_kz.json, never parsed out of the
stored RU sentence. `warnings` is the one place that's a closed-vocabulary
exact-match lookup rather than a recompute — see RATIO_WARNING_EN's own
docstring for why that's safe here (every string in it is produced by our
own code from a fixed template, never document- or user-derived text).
"""
from __future__ import annotations

from typing import Optional

from . import benchmarks_kz as KZ
from . import scoring as S

# ---------------------------------------------------------------------------
# Per-ratio caveat sentences (ratios.py's RatioDef.compute functions).
# Closed vocabulary: every one of these strings is produced by OUR code
# from a fixed template with NO document-derived or user-derived text
# interpolated (the one parametrized case — which averaged metric's
# period-end value stood in for the average — only ever takes one of
# three fixed labels, all three enumerated explicitly below). Exact-match
# lookup; anything unmapped (a warning string a future ratios.py change
# adds without updating this table) falls back to the original RU string.
# ---------------------------------------------------------------------------
RATIO_WARNING_EN: dict[str, str] = {
    "Краткосрочные обязательства равны нулю — коэффициент не определён.":
        "Current liabilities are zero — the ratio is undefined.",
    "Денежные средства не найдены и приняты равными нулю — "
    "Quick Ratio является нижней оценкой.":
        "Cash was not found and was treated as zero — "
        "the Quick Ratio is a lower-bound estimate.",
    "Краткосрочные фин. вложения не найдены и приняты равными нулю — "
    "Quick Ratio является нижней оценкой.":
        "Short-term investments were not found and were treated as zero — "
        "the Quick Ratio is a lower-bound estimate.",
    "Дебиторская задолженность не найдены и приняты равными нулю — "
    "Quick Ratio является нижней оценкой.":
        "Accounts receivable was not found and was treated as zero — "
        "the Quick Ratio is a lower-bound estimate.",
    "Собственный капитал отрицателен — Debt-to-Equity не интерпретируем, показан как N/A.":
        "Shareholders' equity is negative — Debt-to-Equity is not meaningful and is shown as N/A.",
    "Собственный капитал отрицателен — коэффициент не интерпретируем.":
        "Shareholders' equity is negative — the ratio is not meaningful.",
    "Процентные расходы равны нулю — покрытие процентов не рассчитывается.":
        "Interest expense is zero — interest coverage is not calculated.",
    "EBITDA не положительна — Net Debt / EBITDA не интерпретируем.":
        "EBITDA is not positive — Net Debt / EBITDA is not meaningful.",
    "Нет данных предыдущего периода: ROA рассчитан по активам на конец периода (точность снижена).":
        "No prior-period data: ROA was computed on period-end assets "
        "instead of the average (accuracy reduced).",
    "Собственный капитал отрицателен — ROE не интерпретируем.":
        "Shareholders' equity is negative — ROE is not meaningful.",
    "Средний собственный капитал не положителен — ROE не интерпретируем.":
        "Average shareholders' equity is not positive — ROE is not meaningful.",
    "Нет данных предыдущего периода: ROE рассчитан по капиталу на конец периода (точность снижена).":
        "No prior-period data: ROE was computed on period-end equity "
        "instead of the average (accuracy reduced).",
    "Использованы активы на конец периода вместо средних.":
        "Used period-end assets instead of the average.",
    "Использовано значение «Запасы» на конец периода вместо среднего.":
        "Used period-end Inventory instead of the average.",
    "Использовано значение «Дебиторская задолженность» на конец периода вместо среднего.":
        "Used period-end Accounts Receivable instead of the average.",
    "Использовано значение «Кредиторская задолженность» на конец периода вместо среднего.":
        "Used period-end Accounts Payable instead of the average.",
    "Чистая прибыль не положительна — Cash Conversion не интерпретируем.":
        "Net income is not positive — Cash Conversion is not meaningful.",
    "Чистая прибыль отрицательна — P/E не интерпретируем.":
        "Net income is negative — P/E is not meaningful.",
    "EPS отрицателен — P/E не интерпретируем.":
        "EPS is negative — P/E is not meaningful.",
    "Собственный капитал не положителен — P/B не интерпретируем.":
        "Shareholders' equity is not positive — P/B is not meaningful.",
    "EV/EBITDA не положительна — EV/EBITDA не интерпретируем.":
        "EBITDA is not positive — EV/EBITDA is not meaningful.",
    "EBITDA не положительна — EV/EBITDA не интерпретируем.":
        "EBITDA is not positive — EV/EBITDA is not meaningful.",
    "Упрощённый расчёт: без компонента X2.":
        "Simplified calculation: X2 component excluded.",
}


def localize_ratio_warning(text: str) -> str:
    return RATIO_WARNING_EN.get(text, text)


def localize_ratio_warnings(warnings: list[str]) -> list[str]:
    return [localize_ratio_warning(w) for w in warnings]


# Static, non-parametrized explanation strings that appear verbatim
# regardless of the industry/ratio (compute_all's market-data-unavailable
# case, the money-unit informational case) — same closed-vocabulary
# exact-match treatment as the warnings table above.
_STATIC_EXPLANATION_EN: dict[str, str] = {
    "Рыночные данные (капитализация или цена акции) отсутствуют — "
    "показатель не рассчитывается для непубличной компании.":
        "Market data (market capitalization or share price) is not available — "
        "this ratio is not calculated for a private company.",
    "Справочная величина, не участвует в балльной оценке.":
        "Reference figure — not included in the score.",
    "Недостаточно данных для расчёта.":
        "Insufficient data to compute this ratio.",
}

_VERDICT_EN = {
    "good": "within the industry benchmark",
    "attention": "outside the desirable range — needs attention",
    "critical": "materially outside the industry benchmark",
}

_UNIT_SUFFIX_EN = {"x": "", "%": "%", "money": ""}


def _fmt_range(lo: float, hi: float, unit_suffix: str, direction: str) -> str:
    """Mirrors scoring.apply_benchmarks' `rng` construction exactly
    (same >=1e12 / <=-1e10 / lower-and-zero special cases), English words
    only — the numeric formatting (`{x:g}`) is identical to the RU path."""
    if hi >= 1e12:
        return f"≥ {lo:g}{unit_suffix}"
    if lo <= -1e10 or (direction == "lower" and lo == 0):
        return f"≤ {hi:g}{unit_suffix}"
    return f"{lo:g}–{hi:g}{unit_suffix}"


def _industry_benchmark_entry(industry: str, ratio_key: str) -> Optional[dict]:
    try:
        cfg = S.get_industry(industry)
    except KeyError:
        return None
    return cfg.get("ratios", {}).get(ratio_key)


def build_ratio_explanation_en(ratio: dict, industry: str) -> str:
    """Re-derives a RatioResult's `explanation` in English straight from
    its own structured fields (value/unit/status/key/inputs) plus a FRESH
    lookup into the live `benchmarks.json` for this (industry, ratio) —
    never a parse of the stored RU `explanation` string. Mirrors
    scoring.apply_benchmarks' explanation-construction branches one for
    one (excluded / missing-value / money-unit / market-unavailable /
    scored) so the EN text says exactly what the RU text says, just in
    English. Works for every stored analysis, old or new: every field
    read here has been part of RatioResult since before locale existed.
    """
    key = ratio.get("key", "")
    value = ratio.get("value")
    unit = ratio.get("unit", "x")
    status = ratio.get("status", "na")
    applicable = ratio.get("applicable", True)
    inputs = ratio.get("inputs") or {}

    if key == "altman_z":
        # Altman has its own model-specific explanation shape — see
        # i18n_risk_radar.build_altman_explanation_en. Callers route there
        # directly; this function is never invoked for altman_z itself,
        # but returns the stored explanation defensively if it ever is.
        return ratio.get("explanation", "")

    if not applicable:
        # Two applicable=False shapes: excluded-for-industry (has an
        # explanation already built with the industry name + note) and
        # market-data-unavailable (a fully static sentence).
        stored = ratio.get("explanation", "")
        static = _STATIC_EXPLANATION_EN.get(stored)
        if static is not None:
            return static
        # Excluded-for-industry: "Показатель исключён для отрасли «X»: note."
        cfg = None
        try:
            cfg = S.get_industry(industry)
        except KeyError:
            pass
        if cfg is not None and key in set(cfg.get("excluded_ratios", [])):
            name_en = cfg.get("name_en") or cfg.get("name", industry)
            note_en = cfg.get("note_en") or cfg.get(
                "note", "not characteristic of the industry's business model.")
            return f'Ratio excluded for the {name_en} industry: {note_en}'
        return stored  # unrecognized applicable=False shape — RU fallback

    if value is None:
        missing = [k for k, v in inputs.items() if v is None]
        if missing:
            return "Insufficient data: missing values for " + ", ".join(missing) + "."
        return "Insufficient data to compute this ratio."

    if unit == "money":
        return _STATIC_EXPLANATION_EN["Справочная величина, не участвует в балльной оценке."]

    bm = _industry_benchmark_entry(industry, key)
    if bm is None:
        # No benchmark mapping for this (industry, ratio) and it isn't
        # excluded — scoring.py leaves the explanation untouched in this
        # branch too, so there's nothing to translate.
        return ratio.get("explanation", "")

    u = _UNIT_SUFFIX_EN.get(unit, "")
    lo, hi = bm["good"]
    rng = _fmt_range(float(lo), float(hi), u, bm["direction"])
    verdict = _VERDICT_EN.get(status, status)
    if bm.get("method") != "demo" and bm.get("source"):
        bm_phrase = f"Industry benchmark (source: {bm['source']}, data {bm.get('as_of', '')}): {rng}."
    else:
        bm_phrase = f"Demonstration industry range: {rng}."
    note_en = bm.get("note_en")
    tail = f" {note_en}" if note_en else ""
    return f"Value {value:.2f}{u}. {bm_phrase} Verdict: {verdict}.{tail}"


def _localize_benchmark_fields(ratio: dict, industry: str) -> dict:
    """Returns a shallow-patched `ratio` with `benchmark.note` and
    `benchmark_kz.note`/`.source` swapped for their `_en` counterparts
    (fresh lookups into the live benchmarks.json/benchmarks_kz.json, same
    principle as the composed `explanation` sentence above) — these raw
    fields ride along in the JSON response independently of `explanation`
    (`benchmark_kz.source` is rendered directly as a footnote citation,
    see components/results/footnotes.tsx) so an `en`-locale payload must
    not leave Russian text in them even though today's UI happens not to
    surface `.note` on its own. Falls back to the stored RU value wherever
    a `_en` counterpart doesn't exist (e.g. an industry/ratio pair this
    round's translation pass didn't cover)."""
    out = dict(ratio)
    key = ratio.get("key", "")
    benchmark = ratio.get("benchmark")
    if benchmark and benchmark.get("note"):
        bm = _industry_benchmark_entry(industry, key)
        if bm and bm.get("note_en"):
            out["benchmark"] = {**benchmark, "note": bm["note_en"]}
    benchmark_kz = ratio.get("benchmark_kz")
    if benchmark_kz:
        kz = KZ.get_kz_benchmark(industry, key)
        if kz:
            patched = dict(benchmark_kz)
            if kz.get("note_en"):
                patched["note"] = kz["note_en"]
            if kz.get("source_en"):
                patched["source"] = kz["source_en"]
            out["benchmark_kz"] = patched
    return out


def localize_ratio(ratio: dict, industry: str) -> dict:
    """Returns a NEW ratio dict with `explanation`/`warnings`/benchmark
    citation fields localized to English; every other field (value, unit,
    status, benchmark numeric bounds, formula, substitution — all
    locale-neutral already) passes through unchanged. `name`/`category`
    are handled by the caller (i18n.localize_payload), since `name` needs
    the Altman special case and `category` needs the shared
    CATEGORY_LABELS_EN, not per-ratio logic. Altman routes to
    i18n_risk_radar.localize_altman instead (its own model-specific
    explanation/name shape)."""
    if ratio.get("key") == "altman_z":
        from . import i18n_risk_radar as RR
        return RR.localize_altman(ratio)
    out = _localize_benchmark_fields(ratio, industry)
    out["explanation"] = build_ratio_explanation_en(ratio, industry)
    out["warnings"] = localize_ratio_warnings(ratio.get("warnings") or [])
    return out
