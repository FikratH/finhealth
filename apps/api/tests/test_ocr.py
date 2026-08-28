"""OCR for scanned PDFs (P7.T4): capability gating, detection routing,
mocked-OCR pipeline, confidence marking, disabled-path regression.

Binaries (tesseract/pdftoppm) are never actually installed in this
environment -- capability-gating tests monkeypatch `shutil.which` directly;
the mocked-pipeline tests inject a fake `pytesseract`/`pdf2image` module via
`sys.modules` (both are pip-installed for real per requirements-dev.txt, so
`import pytesseract`/`import pdf2image` inside extraction_ocr.py's lazy
imports genuinely succeeds -- it's only their own shelling-out to the
tesseract/poppler BINARIES that's absent and needs faking). This all runs
in-process, directly against extraction.py/extraction_ocr.py's functions,
NOT through the spawned ProcessPoolExecutor (app/main.py): a spawned worker
is a fresh Python interpreter that re-imports everything, so a
`sys.modules` injection made in the TEST process has no effect on it. The
one HTTP-level test here (the disabled-path regression) needs no mocking at
all -- OCR really is unusable in this environment (no binaries, env unset),
so the real pool path is safe to exercise end-to-end.
"""
import io
import sys
import types

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import main
from app.services import extraction, extraction_ocr, ocr

client = TestClient(app=main.app)


def _blank_pdf_bytes() -> bytes:
    """A real, valid PDF with no text layer at all -- built with pypdfium2
    (an existing transitive dependency of pdfplumber, already installed),
    so this needs no fixture file and no hand-rolled fake PDF bytes."""
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument.new()
    pdf.new_page(200, 200)
    buf = io.BytesIO()
    pdf.save(buf)
    return buf.getvalue()


def _enable_ocr(monkeypatch):
    monkeypatch.setenv("OCR_ENABLED", "1")
    monkeypatch.setattr("shutil.which", lambda name: f"/usr/bin/{name}")


def _inject_fake_ocr_modules(monkeypatch, page_texts):
    """Fakes `pytesseract.image_to_string` and `pdf2image.convert_from_bytes`
    (plus its `exceptions` submodule) via `sys.modules` injection. Real
    Pillow images (already installed, via pdfplumber) stand in for
    pdf2image's actual rasterized pages -- one fake page per entry in
    `page_texts`."""
    if isinstance(page_texts, str):
        page_texts = [page_texts]
    calls: list[dict] = []

    fake_pytesseract = types.ModuleType("pytesseract")

    def fake_image_to_string(image, lang=None, timeout=0):
        calls.append({"lang": lang, "timeout": timeout})
        idx = len(calls) - 1
        return page_texts[idx] if idx < len(page_texts) else ""

    fake_pytesseract.image_to_string = fake_image_to_string
    monkeypatch.setitem(sys.modules, "pytesseract", fake_pytesseract)

    fake_pdf2image = types.ModuleType("pdf2image")

    def fake_convert_from_bytes(data, dpi=200):
        return [Image.new("RGB", (10, 10)) for _ in page_texts]

    fake_pdf2image.convert_from_bytes = fake_convert_from_bytes
    monkeypatch.setitem(sys.modules, "pdf2image", fake_pdf2image)

    fake_exceptions = types.ModuleType("pdf2image.exceptions")
    for name in ("PDFInfoNotInstalledError", "PDFPageCountError",
                "PDFPopplerTimeoutError", "PDFSyntaxError", "PopplerNotInstalledError"):
        setattr(fake_exceptions, name, type(name, (Exception,), {}))
    monkeypatch.setitem(sys.modules, "pdf2image.exceptions", fake_exceptions)
    return calls


_OCR_TEXT = "Показатель  2024  2023\nВыручка  1000000  900000\n"


# ---------------------------------------------------------------------------
# Capability gating: ocr.ocr_enabled() and GET /api/health's ocr_enabled
# ---------------------------------------------------------------------------

def test_ocr_disabled_by_default():
    assert ocr.ocr_enabled() is False


def test_env_alone_is_not_enough_without_binaries(monkeypatch):
    monkeypatch.setenv("OCR_ENABLED", "1")
    monkeypatch.setattr("shutil.which", lambda name: None)
    assert ocr.ocr_enabled() is False


def test_requires_both_binaries_present_not_just_one(monkeypatch):
    monkeypatch.setenv("OCR_ENABLED", "1")
    monkeypatch.setattr(
        "shutil.which", lambda name: "/usr/bin/tesseract" if name == "tesseract" else None)
    assert ocr.ocr_enabled() is False  # pdftoppm still missing


def test_enabled_true_when_env_and_both_binaries_present(monkeypatch):
    _enable_ocr(monkeypatch)
    assert ocr.ocr_enabled() is True


def test_binaries_present_without_env_stays_disabled(monkeypatch):
    monkeypatch.setattr("shutil.which", lambda name: f"/usr/bin/{name}")
    assert ocr.ocr_enabled() is False  # OCR_ENABLED unset


def test_binary_check_is_cached_after_first_call(monkeypatch):
    calls: list[str] = []

    def fake_which(name):
        calls.append(name)
        return f"/usr/bin/{name}"

    monkeypatch.setenv("OCR_ENABLED", "1")
    monkeypatch.setattr("shutil.which", fake_which)
    assert ocr.ocr_enabled() is True
    assert ocr.ocr_enabled() is True
    # shutil.which invoked once per required binary total, not once per call
    assert len(calls) == len(ocr.REQUIRED_BINARIES)


def test_health_reflects_ocr_enabled(monkeypatch):
    _enable_ocr(monkeypatch)
    assert client.get("/api/health").json() == {
        "status": "ok", "vault_enabled": False, "ocr_enabled": True}


def test_health_ocr_enabled_false_when_env_set_but_binaries_absent(monkeypatch):
    monkeypatch.setenv("OCR_ENABLED", "1")
    monkeypatch.setattr("shutil.which", lambda name: None)
    assert client.get("/api/health").json()["ocr_enabled"] is False


# ---------------------------------------------------------------------------
# Disabled-path regression: the pre-P7.T4 scanned-PDF error is unchanged
# ---------------------------------------------------------------------------

_SCAN_MESSAGE = ("PDF не содержит текстового слоя (вероятно, это скан). "
                 "Загрузите Excel/CSV либо PDF более высокого качества.")


def test_disabled_path_scanned_pdf_error_message_unchanged():
    """OCR really is unusable in this test environment (no binaries on
    PATH, OCR_ENABLED unset) -- exercised through the real extract_from_pdf
    function, no mocking at all, proving the exact pre-P7.T4 message still
    fires byte-for-byte."""
    with pytest.raises(extraction.ScannedPdfError) as exc_info:
        extraction.extract_from_pdf(_blank_pdf_bytes())
    assert str(exc_info.value) == _SCAN_MESSAGE


def test_disabled_path_via_real_http_and_process_pool():
    """Same regression, end to end through POST /api/upload + POST
    /api/extract -- the real spawned ProcessPoolExecutor, no monkeypatching
    at all (safe here specifically because the disabled path needs none).
    Also pins the new `code:"scanned_pdf"` field (additive) alongside the
    unchanged message."""
    up = client.post(
        "/api/upload", files={"file": ("scan.pdf", _blank_pdf_bytes(), "application/pdf")})
    assert up.status_code == 200, up.text
    upload_id = up.json()["upload_id"]
    resp = client.post("/api/extract", json={"upload_id": upload_id})
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == {"code": "scanned_pdf", "message": _SCAN_MESSAGE}


# ---------------------------------------------------------------------------
# Detection routing + mocked-OCR pipeline + confidence marking + provenance
# ---------------------------------------------------------------------------

def test_detection_routes_to_ocr_instead_of_raising_when_enabled(monkeypatch):
    _enable_ocr(monkeypatch)
    _inject_fake_ocr_modules(monkeypatch, _OCR_TEXT)
    result = extraction.extract_from_pdf(_blank_pdf_bytes())  # must not raise
    assert result.latest_period == "2024"


def test_mocked_ocr_pipeline_runs_through_the_same_extraction_pipeline(monkeypatch):
    """The recognized text is parsed by the exact same
    _rows_from_matrix/_extract_from_tables machinery every other source
    uses (label matching, column classification, period selection) -- not
    a parallel OCR-only code path."""
    _enable_ocr(monkeypatch)
    _inject_fake_ocr_modules(monkeypatch, _OCR_TEXT)
    result = extraction.extract_from_pdf(_blank_pdf_bytes())
    by_metric = {v.metric: v for v in result.values}
    assert by_metric["revenue"].value == 1000000
    assert by_metric["revenue"].period == "2024"
    prev_by_metric = {v.metric: v for v in result.previous_values}
    assert prev_by_metric["revenue"].value == 900000


def test_ocr_provenance_marked_in_source_and_warnings(monkeypatch):
    _enable_ocr(monkeypatch)
    _inject_fake_ocr_modules(monkeypatch, _OCR_TEXT)
    result = extraction.extract_from_pdf(_blank_pdf_bytes())
    revenue = next(v for v in result.values if v.metric == "revenue")
    assert "распознано OCR" in revenue.source
    assert any("оптическое распознавание" in w for w in result.warnings)


def test_ocr_confidence_is_capped_lower_than_native_text(monkeypatch):
    """"Выручка" is an exact synonym match (95 base) minus the existing
    15-point PDF penalty (80) -- OCR's additional cap (60) must still bring
    it down further, proving the cap is actually applied, not just present
    but never binding."""
    _enable_ocr(monkeypatch)
    _inject_fake_ocr_modules(monkeypatch, _OCR_TEXT)
    result = extraction.extract_from_pdf(_blank_pdf_bytes())
    revenue = next(v for v in result.values if v.metric == "revenue")
    assert revenue.confidence == extraction_ocr.CONFIDENCE_CAP == 60.0


def test_ocr_finds_nothing_raises_the_ocr_specific_message(monkeypatch):
    """OCR ran (env on, binaries "present") but every page recognized as
    blank -- still an honest ScannedPdfError, not a silent all-N/A result."""
    _enable_ocr(monkeypatch)
    _inject_fake_ocr_modules(monkeypatch, "")
    with pytest.raises(extraction.ScannedPdfError) as exc_info:
        extraction.extract_from_pdf(_blank_pdf_bytes())
    assert "OCR не смог распознать" in str(exc_info.value)


def test_ocr_uses_rus_plus_eng_language(monkeypatch):
    _enable_ocr(monkeypatch)
    calls = _inject_fake_ocr_modules(monkeypatch, _OCR_TEXT)
    extraction.extract_from_pdf(_blank_pdf_bytes())
    assert calls[0]["lang"] == "rus+eng"


# ---------------------------------------------------------------------------
# extraction_ocr.ocr_pdf_pages: page cap / per-page failure / total budget
# ---------------------------------------------------------------------------

def test_page_cap_truncates_and_warns(monkeypatch):
    monkeypatch.setattr(extraction_ocr, "MAX_PAGES", 2)
    _inject_fake_ocr_modules(monkeypatch, [_OCR_TEXT] * 5)
    texts, warnings = extraction_ocr.ocr_pdf_pages(b"irrelevant")
    assert len(texts) == 2
    assert any("ограничен первыми 2 стр. из 5" in w for w in warnings)


def test_per_page_tesseract_timeout_degrades_that_page_not_the_whole_run(monkeypatch):
    """A page-level RuntimeError (pytesseract's own timeout, or a
    TesseractError) must not abort the rest of the document -- it degrades
    to an empty page with a warning, and later pages still get processed."""
    fake_pytesseract = types.ModuleType("pytesseract")
    call_count = {"n": 0}

    def flaky_image_to_string(image, lang=None, timeout=0):
        call_count["n"] += 1
        if call_count["n"] == 1:
            raise RuntimeError("Tesseract process timeout")
        return "Выручка  1000000  900000\n"

    fake_pytesseract.image_to_string = flaky_image_to_string
    monkeypatch.setitem(sys.modules, "pytesseract", fake_pytesseract)

    fake_pdf2image = types.ModuleType("pdf2image")
    fake_pdf2image.convert_from_bytes = lambda data, dpi=200: [
        Image.new("RGB", (10, 10)) for _ in range(2)]
    monkeypatch.setitem(sys.modules, "pdf2image", fake_pdf2image)
    fake_exceptions = types.ModuleType("pdf2image.exceptions")
    for name in ("PDFInfoNotInstalledError", "PDFPageCountError",
                "PDFPopplerTimeoutError", "PDFSyntaxError", "PopplerNotInstalledError"):
        setattr(fake_exceptions, name, type(name, (Exception,), {}))
    monkeypatch.setitem(sys.modules, "pdf2image.exceptions", fake_exceptions)

    texts, warnings = extraction_ocr.ocr_pdf_pages(b"irrelevant")
    assert texts == ["", "Выручка  1000000  900000\n"]
    assert any("Не удалось распознать стр. 1" in w for w in warnings)


def test_total_budget_exhausted_stops_early_with_a_clear_warning(monkeypatch):
    """A near-zero total budget must stop before ever calling
    pytesseract -- proving the outer budget, not just the per-page one, is
    actually enforced (the graceful-degradation guard against the pool's
    own kill-on-timeout)."""
    monkeypatch.setattr(extraction_ocr, "TOTAL_BUDGET_SECONDS", 0)
    calls = _inject_fake_ocr_modules(monkeypatch, [_OCR_TEXT] * 3)
    texts, warnings = extraction_ocr.ocr_pdf_pages(b"irrelevant")
    assert texts == []
    assert calls == []  # pytesseract never invoked at all
    assert any("остановлен по общему лимиту времени" in w for w in warnings)


def test_rasterization_failure_returns_empty_without_raising(monkeypatch):
    """pdf2image itself failing to rasterize (bad PDF, or -- in
    production, if the binary vanished mid-request -- a poppler error)
    must degrade to an empty result with a warning, never propagate a raw
    exception out of the worker."""
    fake_pdf2image = types.ModuleType("pdf2image")

    def raising_convert(data, dpi=200):
        raise fake_exceptions.PDFSyntaxError("bad pdf")

    fake_exceptions = types.ModuleType("pdf2image.exceptions")
    for name in ("PDFInfoNotInstalledError", "PDFPageCountError",
                "PDFPopplerTimeoutError", "PDFSyntaxError", "PopplerNotInstalledError"):
        setattr(fake_exceptions, name, type(name, (Exception,), {}))
    fake_pdf2image.convert_from_bytes = raising_convert
    monkeypatch.setitem(sys.modules, "pdf2image", fake_pdf2image)
    monkeypatch.setitem(sys.modules, "pdf2image.exceptions", fake_exceptions)
    fake_pytesseract = types.ModuleType("pytesseract")
    fake_pytesseract.image_to_string = lambda *a, **k: ""
    monkeypatch.setitem(sys.modules, "pytesseract", fake_pytesseract)

    texts, warnings = extraction_ocr.ocr_pdf_pages(b"irrelevant")
    assert texts == []
    assert any("Не удалось подготовить PDF" in w for w in warnings)
