"""Read-time locale translation (founder feedback R1: full API i18n).

Covers: locale param plumbing on GET /api/analysis/{id} and POST
/api/analyze (default/ru byte-identical to the untouched stored payload,
en fully translated), the i18n/i18n_risk_radar/i18n_recommendations
modules' individual translators against hand-built ratio/signal/warning
fixtures, and graceful RU-fallback behavior for a payload shape this
module's tables don't recognize (never a crash, never a half-translated
sentence).
"""
from __future__ import annotations

import re
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.services import (
    i18n, i18n_ratios as IR, i18n_recommendations as REC, i18n_risk_radar as RR,
)
from app.services.analysis import run_analysis
from app.services.beneish import beneish_m
from app.services.piotroski import piotroski_f
from app.services.ratios import Inputs, altman_z, compute_all
from app.services.recommendations import _RULES as RULES_RU
from app.services.scoring import apply_benchmarks
from app.schemas import AnalysisRequest, ExtractedValue, Scale

client = TestClient(app)
DEMO = Path(__file__).resolve().parent.parent / "demo" / "demo_company.csv"


_CYRILLIC_RE = re.compile(r"[а-яё]", re.IGNORECASE)


def _has_cyrillic(text: str) -> bool:
    return bool(_CYRILLIC_RE.search(text))


def _demo_analysis_id() -> str:
    with open(DEMO, "rb") as f:
        up = client.post("/api/upload", files={"file": ("demo_company.csv", f, "text/csv")})
    upload_id = up.json()["upload_id"]
    ex = client.post("/api/extract", json={"upload_id": upload_id}).json()
    req = {
        "upload_id": upload_id,
        "industry": ex.get("suggested_industry") or "manufacturing",
        "currency": ex.get("currency"), "scale": ex.get("scale", "units"),
        "latest_period": ex.get("latest_period"), "previous_period": ex.get("previous_period"),
        "audited": ex.get("audited", False),
        "values": ex["values"], "previous_values": ex["previous_values"],
    }
    an = client.post("/api/analyze", json=req)
    assert an.status_code == 200, an.text
    return an.json()["analysis_id"], req["industry"]


# ---------------------------------------------------------------------------
# Locale normalization
# ---------------------------------------------------------------------------
def test_normalize_locale_defaults_and_fallback():
    assert i18n.normalize_locale(None) == "ru"
    assert i18n.normalize_locale("") == "ru"
    assert i18n.normalize_locale("ru") == "ru"
    assert i18n.normalize_locale("en") == "en"
    assert i18n.normalize_locale("EN") == "en"
    assert i18n.normalize_locale(" en ") == "en"
    assert i18n.normalize_locale("fr") == "ru"          # unknown -> RU, never a 400
    assert i18n.normalize_locale("ru-RU") == "ru"        # unrecognized variant -> RU


# ---------------------------------------------------------------------------
# Endpoint plumbing: GET /api/analysis/{id}
# ---------------------------------------------------------------------------
def test_get_analysis_default_locale_is_byte_identical_to_stored():
    aid, _ = _demo_analysis_id()
    from app import storage
    stored = storage.get_analysis(aid)
    no_param = client.get(f"/api/analysis/{aid}").json()
    explicit_ru = client.get(f"/api/analysis/{aid}?locale=ru").json()
    garbage = client.get(f"/api/analysis/{aid}?locale=zz").json()
    assert no_param == stored
    assert explicit_ru == stored
    assert garbage == stored


def test_get_analysis_locale_en_translates_top_level_fields():
    aid, industry = _demo_analysis_id()
    en = client.get(f"/api/analysis/{aid}?locale=en").json()
    ru = client.get(f"/api/analysis/{aid}").json()
    assert en["health_label"] != ru["health_label"]
    assert en["health_label"] == i18n.health_label_en(ru["overall_score"])
    assert en["industry_name"] == ru["industry_name_en"]
    assert {c["category"] for c in en["category_scores"]} == {c["category"] for c in ru["category_scores"]}
    for c in en["category_scores"]:
        assert c["label"] == i18n.CATEGORY_LABELS_EN[c["category"]]
    # Numbers/scores/weights must be untouched by localization.
    ru_scores = {c["category"]: c["score"] for c in ru["category_scores"]}
    en_scores = {c["category"]: c["score"] for c in en["category_scores"]}
    assert ru_scores == en_scores
    assert en["overall_score"] == ru["overall_score"]
    assert en["disclaimer"] == i18n.DISCLAIMER_EN


def test_post_analyze_locale_en_translates_response_but_storage_stays_ru():
    with open(DEMO, "rb") as f:
        up = client.post("/api/upload", files={"file": ("demo_company.csv", f, "text/csv")})
    upload_id = up.json()["upload_id"]
    ex = client.post("/api/extract", json={"upload_id": upload_id}).json()
    req = {
        "upload_id": upload_id, "industry": ex.get("suggested_industry") or "manufacturing",
        "currency": ex.get("currency"), "scale": ex.get("scale", "units"),
        "latest_period": ex.get("latest_period"), "previous_period": ex.get("previous_period"),
        "audited": ex.get("audited", False),
        "values": ex["values"], "previous_values": ex["previous_values"],
    }
    en_resp = client.post("/api/analyze?locale=en", json=req).json()
    aid = en_resp["analysis_id"]
    assert en_resp["health_label"] == i18n.health_label_en(en_resp["overall_score"])
    # Storage is always the canonical RU payload, regardless of what locale
    # the POST response itself was rendered in.
    ru_get = client.get(f"/api/analysis/{aid}").json()
    assert ru_get["health_label"] in (
        "Сильное состояние", "Хорошее состояние", "Удовлетворительное состояние",
        "Слабое состояние", "Критическое состояние", "Недостаточно данных для оценки")


# ---------------------------------------------------------------------------
# Ratio explanation / warnings — hand-built RatioResult-shaped dicts, no
# HTTP round-trip needed for the pure-function pieces.
# ---------------------------------------------------------------------------
def _run_ru(latest: dict, previous: dict, industry: str = "manufacturing"):
    i = Inputs(latest=latest, previous=previous)
    ratios = compute_all(i)
    z = altman_z(i, industry)
    if z is not None:
        ratios.append(z)
    ratios = apply_benchmarks(ratios, industry)
    return [r.model_dump(mode="json") for r in ratios]


def test_ratio_explanation_en_mirrors_ru_structure_for_scored_ratio():
    ratios = _run_ru({"current_assets": 1500, "current_liabilities": 900}, {})
    ru = next(r for r in ratios if r["key"] == "current_ratio")
    en_text = IR.build_ratio_explanation_en(ru, "manufacturing")
    assert en_text.startswith("Value ")
    assert "Verdict:" in en_text
    assert "Значение" not in en_text and "Вывод" not in en_text


def test_ratio_explanation_en_for_missing_data_lists_raw_keys():
    ratios = _run_ru({}, {})
    ru = next(r for r in ratios if r["key"] == "current_ratio")
    assert ru["value"] is None
    en_text = IR.build_ratio_explanation_en(ru, "manufacturing")
    assert en_text == "Insufficient data: missing values for current_assets, current_liabilities."


def test_ratio_explanation_en_for_money_unit():
    ratios = _run_ru({"operating_cash_flow": 100, "capital_expenditures": 20}, {})
    ru = next(r for r in ratios if r["key"] == "free_cash_flow")
    assert ru["unit"] == "money"
    assert IR.build_ratio_explanation_en(ru, "manufacturing") == \
        "Reference figure — not included in the score."


def test_ratio_explanation_en_for_market_data_unavailable():
    ratios = _run_ru({"net_income": 100}, {})
    ru = next(r for r in ratios if r["key"] == "pe")
    assert ru["applicable"] is False
    assert IR.build_ratio_explanation_en(ru, "manufacturing") == (
        "Market data (market capitalization or share price) is not available — "
        "this ratio is not calculated for a private company.")


def test_ratio_explanation_en_for_industry_excluded_ratio():
    ratios = _run_ru({"inventory": 100, "cost_of_goods_sold": 50}, {}, industry="saas")
    ru = next(r for r in ratios if r["key"] == "inventory_turnover")
    assert ru["applicable"] is False
    en_text = IR.build_ratio_explanation_en(ru, "saas")
    assert en_text.startswith("Ratio excluded for the Software and SaaS industry:")
    assert "не характерен" not in en_text  # RU note must not leak through


def test_localize_ratio_translates_benchmark_note_field():
    ratios = _run_ru({"total_debt": 10, "shareholders_equity": 100}, {}, industry="saas")
    ru = next(r for r in ratios if r["key"] == "debt_to_equity")
    assert ru["benchmark"]["note"]  # SaaS's debt_to_equity carries a real RU note
    out = i18n.localize_ratio(ru, "saas")
    assert out["benchmark"]["note"] != ru["benchmark"]["note"]
    assert not _has_cyrillic(out["benchmark"]["note"])
    # bounds/direction/weight/source are locale-neutral and untouched.
    assert out["benchmark"]["good"] == ru["benchmark"]["good"]
    assert out["benchmark"]["source"] == ru["benchmark"]["source"]


def test_localize_ratio_translates_benchmark_kz_note_and_source_field():
    # banking.roa carries a benchmark_kz entry (app/data/benchmarks_kz.json).
    ratios = _run_ru(
        {"net_income": 10, "total_assets": 1000, "current_assets": 1,
         "current_liabilities": 1}, {}, industry="banking")
    ru = next(r for r in ratios if r["key"] == "roa")
    assert ru.get("benchmark_kz"), "fixture must exercise a ratio with a KZ overlay"
    out = i18n.localize_ratio(ru, "banking")
    assert out["benchmark_kz"]["note"] != ru["benchmark_kz"]["note"]
    assert out["benchmark_kz"]["source"] != ru["benchmark_kz"]["source"]
    assert not _has_cyrillic(out["benchmark_kz"]["note"])
    assert not _has_cyrillic(out["benchmark_kz"]["source"])
    assert out["benchmark_kz"]["value"] == ru["benchmark_kz"]["value"]  # number untouched


def test_ratio_warning_table_covers_every_warning_ratios_py_can_emit():
    """Exercises every branch of ratios.py/altman_z that appends a
    RatioResult.warnings entry, across a spread of Inputs fixtures, and
    asserts each resulting RU string is a recognized key in
    IR.RATIO_WARNING_EN — catches silent drift the moment a future
    ratios.py wording change isn't mirrored here."""
    fixtures = [
        # (latest, previous, industry)
        ({"current_assets": 100, "current_liabilities": 0}, {}, "manufacturing"),
        ({"current_liabilities": 500}, {}, "manufacturing"),  # quick_ratio: all 3 missing
        ({"shareholders_equity": -50, "total_debt": 10}, {}, "manufacturing"),
        ({"shareholders_equity": -50, "total_liabilities": 10}, {}, "manufacturing"),
        ({"operating_income": 10, "interest_expense": 0}, {}, "manufacturing"),
        ({"total_debt": 10, "cash": 5, "ebitda": -1}, {}, "manufacturing"),
        ({"net_income": 10, "total_assets": 100}, {}, "manufacturing"),
        ({"net_income": 10, "shareholders_equity": -5}, {}, "manufacturing"),
        ({"net_income": 10, "shareholders_equity": 0}, {}, "manufacturing"),
        ({"net_income": 10, "shareholders_equity": 100}, {}, "manufacturing"),
        ({"revenue": 100, "total_assets": 500}, {}, "manufacturing"),
        ({"cost_of_goods_sold": 50, "inventory": 20}, {}, "manufacturing"),
        ({"revenue": 100, "accounts_receivable": 20}, {}, "manufacturing"),
        ({"cost_of_goods_sold": 50, "accounts_payable": 20}, {}, "manufacturing"),
        ({"operating_cash_flow": 10, "net_income": -5}, {}, "manufacturing"),
        ({"net_income": -5, "share_price": 10, "eps": -1}, {}, "manufacturing"),
        ({"share_price": 10, "eps": -1}, {}, "manufacturing"),
        ({"share_price": 10, "eps": 2, "shareholders_equity": -5}, {}, "manufacturing"),
        ({"share_price": 10, "eps": 2, "shareholders_equity": 5, "ebitda": -1,
          "total_debt": 1, "cash": 1}, {}, "manufacturing"),
        # roa/roe "no previous period" + turnover-family "used period-end" warnings.
        ({"net_income": 10, "total_assets": 100}, {"net_income": 8}, "manufacturing"),
        ({"net_income": 10, "shareholders_equity": 100}, {"net_income": 8}, "manufacturing"),
        ({"revenue": 100, "total_assets": 500}, {"revenue": 90}, "manufacturing"),
        ({"cost_of_goods_sold": 50, "inventory": 20}, {"cost_of_goods_sold": 40}, "manufacturing"),
        ({"revenue": 100, "accounts_receivable": 20}, {"revenue": 90}, "manufacturing"),
        ({"cost_of_goods_sold": 50, "accounts_payable": 20}, {"cost_of_goods_sold": 40}, "manufacturing"),
        # Altman: private, no X2.
        ({"total_assets": 1000, "current_assets": 400, "current_liabilities": 300,
          "operating_income": 100, "shareholders_equity": 500, "total_liabilities": 500,
          "revenue": 900}, {}, "manufacturing"),
    ]
    seen_ru: set[str] = set()
    for latest, previous, industry in fixtures:
        for r in _run_ru(latest, previous, industry):
            seen_ru.update(r.get("warnings") or [])
    assert seen_ru, "fixtures produced no warnings at all — test itself is broken"
    unmapped = [w for w in seen_ru if w not in IR.RATIO_WARNING_EN]
    assert not unmapped, f"RU warnings with no EN translation: {unmapped}"
    # And every mapped one actually changes under localization.
    for ru_text in seen_ru:
        assert IR.localize_ratio_warning(ru_text) != ru_text


def test_ratio_warning_unrecognized_string_falls_back_to_ru():
    assert IR.localize_ratio_warning("совершенно новое предупреждение") == \
        "совершенно новое предупреждение"


# ---------------------------------------------------------------------------
# Recommendations — parity with the RU rule table, and correctness against
# a crafted attention/critical ratio.
# ---------------------------------------------------------------------------
def test_recommendation_rule_keys_match_ru_table():
    assert set(REC._RULES_EN.keys()) == set(RULES_RU.keys())
    for key, sides in RULES_RU.items():
        assert set(REC._RULES_EN[key].keys()) == set(sides.keys()), key


def test_build_recommendations_en_for_high_debt_to_equity():
    ratios = _run_ru({"total_debt": 900, "shareholders_equity": 500}, {})
    recs = REC.build_recommendations_en(ratios)
    d2e = next((r for r in recs if r["ratio"] == "Debt-to-Equity"), None)
    assert d2e is not None
    assert d2e["problem"] == REC._RULES_EN["debt_to_equity"]["high"]["problem"]
    assert d2e["problem"] != RULES_RU["debt_to_equity"]["high"]["problem"]  # not the RU text
    assert d2e["priority"] in ("high", "medium", "low")
    assert not _has_cyrillic(d2e["problem"] + d2e["action"] + d2e["expected_effect"]
                             + d2e["tradeoffs"] + d2e["benchmark_hint"])


# ---------------------------------------------------------------------------
# Confidence notes
# ---------------------------------------------------------------------------
def test_confidence_notes_en_recomputes_from_booleans_not_parsing():
    confidence = {"has_previous_period": False, "manual_corrections": 2, "audited": True}
    notes = i18n.confidence_notes_en(confidence, ["Revenue", "Total Assets"])
    assert len(notes) == 4
    assert "No comparative period" in notes[0]
    assert "2" in notes[1]
    assert "audit" in notes[2].lower()
    assert "Revenue, Total Assets" in notes[3]


def test_confidence_notes_en_empty_when_nothing_to_disclose():
    confidence = {"has_previous_period": True, "manual_corrections": 0, "audited": False}
    assert i18n.confidence_notes_en(confidence, []) == []


# ---------------------------------------------------------------------------
# Missing metrics — RU name round-trips to EN via the reverse lookup.
# ---------------------------------------------------------------------------
def test_missing_metric_names_translate_and_fall_back_gracefully():
    assert i18n.localize_missing_metrics(["Выручка", "Итого активы"]) == \
        ["Revenue", "Total Assets"]
    # An unrecognized name (future metrics.py entry) degrades to itself.
    assert i18n.localize_missing_metrics(["Совершенно новая метрика"]) == \
        ["Совершенно новая метрика"]


# ---------------------------------------------------------------------------
# Risk radar: Piotroski
# ---------------------------------------------------------------------------
def test_piotroski_signals_translate_with_numbers_preserved():
    i = Inputs(
        latest=dict(net_income=120, total_assets=1100, operating_cash_flow=90,
                   current_assets=350, current_liabilities=250, long_term_debt=200,
                   shares_outstanding=5000, revenue=3000, cost_of_goods_sold=1900),
        previous=dict(net_income=100, total_assets=1000, operating_cash_flow=150,
                     current_assets=300, current_liabilities=200, long_term_debt=150,
                     shares_outstanding=4800, revenue=2500, cost_of_goods_sold=1600),
    )
    ru = piotroski_f(i)
    en = RR.localize_piotroski(ru)
    assert en["interpretation"] != ru["interpretation"]
    assert en["interpretation"].startswith(f"F-Score {ru['score']}/{ru['max']}")
    for ru_sig, en_sig in zip(ru["signals"], en["signals"]):
        assert en_sig["value"] == ru_sig["value"]  # booleans untouched
        if ru_sig["value"] is not None:
            # No leftover Cyrillic (the real correctness bar — a signal
            # whose sentence carries no words at all, e.g. a bare
            # "ROA = 120 / 1 050 = 0.1143 (> 0)." with no trailing note,
            # is legitimately identical in both languages; that's not a
            # translation failure, so equality isn't asserted directly).
            assert not _has_cyrillic(en_sig["detail"]), (ru_sig["key"], en_sig["detail"])
            # every number that appeared in the RU detail survives verbatim
            ru_nums = re.findall(r"-?\d[\d ]*(?:\.\d+)?", ru_sig["detail"])
            en_nums = re.findall(r"-?\d[\d ]*(?:\.\d+)?", en_sig["detail"])
            assert ru_nums == en_nums, (ru_sig["key"], ru_sig["detail"], en_sig["detail"])
    # roa_positive's own detail carries no note here (both periods present)
    # — confirm the note DOES translate when it's actually triggered.
    i_no_prev_ta = Inputs(latest=dict(i.latest), previous={k: v for k, v in i.previous.items()
                                                            if k != "total_assets"})
    ru_note = piotroski_f(i_no_prev_ta)
    en_note = RR.localize_piotroski(ru_note)
    ru_roa = next(s for s in ru_note["signals"] if s["key"] == "roa_positive")
    en_roa = next(s for s in en_note["signals"] if s["key"] == "roa_positive")
    assert "Активы предыдущего периода" in ru_roa["detail"]
    assert "Prior-period assets were not provided" in en_roa["detail"]
    assert not _has_cyrillic(en_roa["detail"])


def test_piotroski_missing_data_signal_translates_via_static_table():
    i = Inputs(latest={}, previous={})
    ru = piotroski_f(i)
    en = RR.localize_piotroski(ru)
    for ru_sig, en_sig in zip(ru["signals"], en["signals"]):
        assert en_sig["value"] is None
        assert not _has_cyrillic(en_sig["detail"]), (ru_sig["key"], en_sig["detail"])
        assert en_sig["detail"] != ru_sig["detail"]  # every all-missing case has real words
    assert en["interpretation"] == "Insufficient data for the F-Score"


def test_piotroski_unrecognized_detail_falls_back_to_ru():
    assert RR._translate_piotroski_detail("roa_positive", "нечто новое") == "нечто новое"


# ---------------------------------------------------------------------------
# Risk radar: Beneish
# ---------------------------------------------------------------------------
def test_beneish_insufficient_data_en_recomputed_from_indices():
    i = Inputs(latest={"revenue": 100, "accounts_receivable": 20}, previous={})
    ru = beneish_m(i)
    assert ru["m_score"] is None
    en = RR.localize_beneish(ru)
    assert en["interpretation"].startswith("The Beneish M-Score was not calculated")
    assert "0 of 8" in en["interpretation"] or " of 8 " in en["interpretation"]


def test_beneish_computed_en_recomputed_from_m_score_flag_substituted():
    from tests.test_beneish import FULL_LATEST, FULL_PREVIOUS
    i = Inputs(latest=FULL_LATEST, previous=FULL_PREVIOUS)
    ru = beneish_m(i)
    assert ru["m_score"] is not None
    en = RR.localize_beneish(ru)
    assert f"{ru['m_score']:.4f}" in en["interpretation"]
    assert en["interpretation"] != ru["interpretation"]
    if ru["substituted"]:
        for k in ru["substituted"]:
            assert RR._BENEISH_LABEL_EN[k].split(" (")[0] in en["interpretation"]


# ---------------------------------------------------------------------------
# Risk radar: Altman
# ---------------------------------------------------------------------------
def test_altman_banking_not_applicable_en():
    ratios = _run_ru({}, {}, industry="banking")
    ru = next(r for r in ratios if r["key"] == "altman_z")
    assert ru["applicable"] is False
    out = RR.localize_altman(ru)
    assert out["name"] == "Altman Z-Score"
    assert out["explanation"].startswith("The Altman Z-Score model does not apply to banks")


def test_altman_insufficient_data_en():
    ratios = _run_ru({}, {}, industry="manufacturing")
    ru = next(r for r in ratios if r["key"] == "altman_z")
    assert ru["value"] is None
    out = RR.localize_altman(ru)
    assert out["explanation"].startswith("Insufficient data to compute the Altman Z-Score")


def test_altman_private_no_x2_en():
    ratios = _run_ru(
        {"total_assets": 1000, "current_assets": 400, "current_liabilities": 300,
         "operating_income": 100, "shareholders_equity": 500, "total_liabilities": 500,
         "revenue": 900}, {}, industry="manufacturing")
    ru = next(r for r in ratios if r["key"] == "altman_z")
    assert ru["value"] is not None
    assert "retained_earnings" not in ru["inputs"]
    out = RR.localize_altman(ru)
    assert out["name"] == "Altman Z′ (private company, no X2)"
    assert "> 2.9" in out["explanation"] and "< 1.23" in out["explanation"]
    assert out["warnings"] == ["Simplified calculation: X2 component excluded."]


def test_altman_public_with_x2_en():
    ratios = _run_ru(
        {"total_assets": 1000, "current_assets": 400, "current_liabilities": 300,
         "operating_income": 100, "shareholders_equity": 500, "total_liabilities": 500,
         "revenue": 900, "retained_earnings": 50, "market_cap": 800}, {},
        industry="manufacturing")
    ru = next(r for r in ratios if r["key"] == "altman_z")
    assert "′" not in ru["name"]  # public model, no prime
    out = RR.localize_altman(ru)
    assert out["name"] == "Altman Z (public-company model)"
    assert "> 2.99" in out["explanation"] and "< 1.81" in out["explanation"]
    assert "X2 component (retained" in out["explanation"]


# ---------------------------------------------------------------------------
# source_values[].source provenance references
# ---------------------------------------------------------------------------
def test_localize_source_ref_covers_every_extraction_shape():
    cases = [
        ("CSV, строка 5", "CSV, row 5"),
        ("Лист «Баланс 2025», строка 12", "Sheet «Баланс 2025», row 12"),
        ("PDF, стр. 3, таблица 1, строка 7", "PDF, p. 3, table 1, row 7"),
        ("PDF, стр. 5 (текст), строка 12", "PDF, p. 5 (text), row 12"),
        ("PDF, стр. 2 (распознано OCR), строка 1", "PDF, p. 2 (OCR-recognized), row 1"),
    ]
    for ru, en in cases:
        assert i18n.localize_source_ref(ru) == en
    assert i18n.localize_source_ref("") == ""
    assert i18n.localize_source_ref("нечто новое") == "нечто новое"


def test_get_analysis_locale_en_has_no_residual_cyrillic_in_source_values():
    aid, _ = _demo_analysis_id()
    en = client.get(f"/api/analysis/{aid}?locale=en").json()
    for v in en.get("source_values", []):
        assert not _has_cyrillic(v["source"]), v


# ---------------------------------------------------------------------------
# Graceful degradation on a genuinely legacy-shaped payload (no risk_radar,
# no industry_name_en) — never a crash, never a half-translated field.
# ---------------------------------------------------------------------------
def test_localize_payload_degrades_gracefully_on_legacy_shape():
    legacy = {
        "analysis_id": "x", "industry": "manufacturing", "industry_name": "Производство",
        "industry_name_en": "",  # pre-founder-R1 payloads never had this field populated
        "overall_score": 70.0, "health_label": "Хорошее состояние",
        "category_scores": [{"category": "liquidity", "label": "Ликвидность",
                             "score": 80.0, "weight": 1.0, "ratios_used": 1}],
        "ratios": [], "strengths": [], "risks": [], "recommendations": [],
        "warnings": [{"code": "benchmarks", "message": "какое-то новое сообщение"}],
        "confidence": {"total": 50.0, "has_previous_period": True,
                       "manual_corrections": 0, "audited": False, "notes": []},
        "missing_metrics": [],
        # risk_radar deliberately absent — pre-2026-08-27 shape.
    }
    out = i18n.localize_payload(legacy)
    # F3 fix: a legacy row with no industry_name_en re-derives the EN name
    # live from benchmarks.json (still known for "manufacturing") rather
    # than falling back to the stored RU name.
    assert out["industry_name"] == "Manufacturing"
    assert out["health_label"] == "Good condition"
    assert "risk_radar" not in out
    # An unrecognized warning message degrades to itself, not a crash.
    assert out["warnings"][0]["message"] == "какое-то новое сообщение"


def test_industry_name_en_falls_back_to_stored_ru_when_industry_id_is_unknown():
    # A genuinely unrecoverable case: the industry itself no longer exists
    # in benchmarks.json (removed since this analysis was made) — the live
    # lookup can't help, so this degrades to the stored RU name rather
    # than raising.
    payload = {"industry": "no_longer_exists", "industry_name": "Устаревшая отрасль",
              "industry_name_en": ""}
    assert i18n.industry_name_en(payload, "no_longer_exists") == "Устаревшая отрасль"


# ---------------------------------------------------------------------------
# Fix round F1: overall_score None (no category scored at all) must never
# be reported as a renormalization that didn't happen.
# ---------------------------------------------------------------------------
def test_score_note_en_when_no_category_has_data():
    category_scores = [
        {"category": "liquidity", "label": "Ликвидность", "score": None, "weight": 1.0},
        {"category": "leverage", "label": "Долговая нагрузка", "score": None, "weight": 1.0},
    ]
    assert i18n._score_note_en(category_scores) == "Not enough data in any scoring category."


def test_score_note_en_when_some_categories_skipped_but_others_scored():
    category_scores = [
        {"category": "liquidity", "label": "Ликвидность", "score": 80.0, "weight": 1.0},
        {"category": "leverage", "label": "Долговая нагрузка", "score": None, "weight": 1.0},
    ]
    note = i18n._score_note_en(category_scores)
    assert note is not None
    assert note.startswith("Categories without data were excluded")
    assert "Leverage" in note


def test_overall_score_none_in_both_locales_end_to_end():
    # No values at all -> every category is unscored -> overall_score None.
    req = AnalysisRequest(industry="manufacturing", scale=Scale.units, values=[])
    result = run_analysis(req)
    payload = result.model_dump(mode="json")
    assert payload["overall_score"] is None
    score_warning_ru = next(w for w in payload["warnings"] if w["code"] == "score")
    assert score_warning_ru["message"] == "Недостаточно данных ни для одной категории оценки."
    localized = i18n.localize_payload(payload)
    score_warning_en = next(w for w in localized["warnings"] if w["code"] == "score")
    assert score_warning_en["message"] == "Not enough data in any scoring category."
    assert "renormalized" not in score_warning_en["message"]
    assert localized["health_label"] == "Not enough data to score"


# ---------------------------------------------------------------------------
# Fix round F2: GET /api/my/analyses honors ?locale= per row. Same
# JWT-based auth convention as tests/test_my_analyses.py (AUTH_JWT_SECRET
# + a real signed token), not a dependency override, so this exercises the
# actual auth.require_user path end to end.
# ---------------------------------------------------------------------------
def test_my_analyses_locale_en_localizes_health_label(monkeypatch):
    import jwt
    from datetime import datetime, timedelta, timezone
    from app import storage

    secret = "test-only-secret-i18n-f2-needs-32-bytes-min"
    monkeypatch.setenv("AUTH_JWT_SECRET", secret)
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {"sub": "test-user-f2", "iss": "tonus-web", "aud": "tonus-api",
         "iat": now, "exp": now + timedelta(hours=1)},
        secret, algorithm="HS256")
    headers = {"Authorization": f"Bearer {token}"}

    storage.save_analysis(
        "f2-analysis-id", "2026-08-29T00:00:00Z",
        {"analysis_id": "f2-analysis-id", "industry": "manufacturing",
         "industry_name": "Производство", "industry_name_en": "",
         "overall_score": 93.2, "health_label": "Сильное состояние"},
        user_id="test-user-f2")

    ru = client.get("/api/my/analyses", headers=headers).json()
    en = client.get("/api/my/analyses?locale=en", headers=headers).json()

    row_ru = next(r for r in ru["analyses"] if r["analysis_id"] == "f2-analysis-id")
    row_en = next(r for r in en["analyses"] if r["analysis_id"] == "f2-analysis-id")
    assert row_ru["health_label"] == "Сильное состояние"
    assert row_en["health_label"] == "Strong condition"
    assert row_en["health_label"] == i18n.health_label_en(row_en["overall_score"])
    # F2's companion fix: industry_name_en re-derives live too, even
    # though this row's stored industry_name_en was never populated.
    assert row_en["industry_name_en"] == "Manufacturing"


# ---------------------------------------------------------------------------
# Fix round F4: an unrecognized Beneish index/flag must never 500 the EN path.
# ---------------------------------------------------------------------------
def test_beneish_unknown_index_key_falls_back_instead_of_crashing():
    beneish = {"m_score": None, "indices": {"DSRI": None, "NEWIDX": None},
              "flag": None, "substituted": []}
    # Patch the index order so "NEWIDX" is actually walked (simulates a
    # future beneish.py adding a 9th index this table hasn't learned yet).
    RR._BENEISH_INDEX_ORDER.append("NEWIDX")
    try:
        interp = RR._beneish_interpretation_en(beneish)
    finally:
        RR._BENEISH_INDEX_ORDER.remove("NEWIDX")
    assert "NEWIDX" in interp  # raw key passthrough, not a KeyError


def test_beneish_unknown_substituted_key_falls_back_instead_of_crashing():
    beneish = {"m_score": -2.0, "flag": "grey", "substituted": ["NEWIDX"]}
    interp = RR._beneish_interpretation_en(beneish)
    assert "NEWIDX" in interp


def test_beneish_unknown_flag_falls_back_instead_of_crashing():
    beneish = {"m_score": -2.0, "flag": "mystery-flag", "substituted": []}
    interp = RR._beneish_interpretation_en(beneish)
    assert "mystery-flag" in interp
