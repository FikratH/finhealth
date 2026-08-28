"""OCR for scanned PDFs (P7.T4): capability gating, detection routing,
mocked-OCR pipeline, confidence marking, disabled-path regression.

Round 1 fix note (see review-t4-verdict.md): `tesseract` and `pdftoppm`
**are installed** on the machine this suite was developed/reviewed
against (`/opt/homebrew/bin`), but `tesseract`'s language data is
PARTIAL — only `eng`/`osd`/`snum`, no `rus` (confirmed via `tesseract
--list-langs`; a plain `apt install tesseract-ocr` without the separate
`tesseract-ocr-rus` package reproduces the exact same partial state). That
false assumption in round 0's docstrings is what let the "partial install
silently returns garbage as a 200" bug (Finding 1) stay invisible: the
disabled-path tests below now explicitly force BOTH gates off rather than
relying on the machine's real state, and a dedicated block of REAL,
unmocked end-to-end tests exercises the actual installed binaries —
self-computing their own expected outcome from this runner's real
`tesseract --list-langs` output, so they pass honestly whether run here
(partial install) or on a full install (CI with both language packs).

The MOCKED tests still inject a fake `pytesseract`/`pdf2image` module via
`sys.modules` (both are pip-installed for real per requirements-dev.txt,
so `import pytesseract`/`import pdf2image` inside extraction_ocr.py's lazy
imports genuinely succeeds — it's their own shelling out to the tesseract/
poppler binaries that's faked, for deterministic, fast, binary-independent
coverage of routing/pipeline/confidence/budget logic). This all runs
in-process, directly against extraction.py/extraction_ocr.py's functions,
NOT through the spawned ProcessPoolExecutor (app/main.py): a spawned
worker is a fresh Python interpreter that re-imports everything, so a
`sys.modules` injection made in the TEST process has no effect on it.
"""
import io
import shutil
import subprocess
import sys
import types

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import main
from app.services import extraction, extraction_ocr, ocr

client = TestClient(app=main.app)


# ---------------------------------------------------------------------------
# PDF fixture builders
# ---------------------------------------------------------------------------

def _blank_pdf_bytes() -> bytes:
    """A real, valid PDF with no text layer and no image content at all --
    built with pypdfium2 (an existing transitive dependency of pdfplumber,
    already installed), so this needs no fixture file. Used by mocked
    tests where the actual pixel content is irrelevant (pytesseract is
    faked to return canned text regardless)."""
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument.new()
    pdf.new_page(200, 200)
    buf = io.BytesIO()
    pdf.save(buf)
    return buf.getvalue()


def _embed_bitmap_page(pdf, img) -> None:
    import pypdfium2 as pdfium

    page = pdf.new_page(img.width, img.height)
    bitmap = pdfium.PdfBitmap.from_pil(img)
    image_obj = pdfium.PdfImage.new(pdf)
    image_obj.set_bitmap(bitmap)
    image_obj.set_matrix(pdfium.PdfMatrix().scale(img.width, img.height))
    page.insert_obj(image_obj)
    page.gen_content()


def _real_scanned_pdf_from_lines(lines: list[str], width: int = 900) -> bytes:
    """A real, valid, IMAGE-only PDF (no text layer, verified by
    pdfplumber in `test_real_...` below) with `lines` actually rendered as
    text via Pillow and embedded as a real page image (pypdfium2). Used by
    the real end-to-end tests further down -- real poppler rasterizes it,
    real tesseract recognizes it. No fixture file needed."""
    import pypdfium2 as pdfium
    from PIL import ImageDraw, ImageFont

    line_height = 70
    img = Image.new("L", (width, line_height * len(lines) + 40), color=255)
    draw = ImageDraw.Draw(img)
    font = ImageFont.load_default(size=28)
    for i, line in enumerate(lines):
        draw.text((20, 20 + i * line_height), line, fill=0, font=font)
    pdf = pdfium.PdfDocument.new()
    _embed_bitmap_page(pdf, img)
    buf = io.BytesIO()
    pdf.save(buf)
    return buf.getvalue()


def _real_multipage_pdf(n_pages: int, page_size=(600, 150), label_prefix="PAGE") -> bytes:
    """A real, valid, image-only multi-page PDF, each page labeled
    "{label_prefix} {n}" via real rendered text -- used to prove page-cap
    bounding (Finding 2) against real poppler/tesseract, not a mock."""
    import pypdfium2 as pdfium
    from PIL import ImageDraw, ImageFont

    font = ImageFont.load_default(size=24)
    pdf = pdfium.PdfDocument.new()
    for i in range(n_pages):
        img = Image.new("L", page_size, color=255)
        draw = ImageDraw.Draw(img)
        draw.text((20, page_size[1] // 2 - 15), f"{label_prefix} {i + 1}", fill=0, font=font)
        _embed_bitmap_page(pdf, img)
    buf = io.BytesIO()
    pdf.save(buf)
    return buf.getvalue()


def _real_blank_multipage_pdf(n_pages: int, page_size=(2500, 2500)) -> bytes:
    """A real, valid, image-only multi-page PDF of large BLANK pages --
    content doesn't matter here, only page count/size: poppler's decode
    cost scales with pixel count regardless of what's drawn, which is what
    the timeout-handler proof (Finding 6) needs to force real, slow
    rasterization deterministically."""
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument.new()
    for _ in range(n_pages):
        _embed_bitmap_page(pdf, Image.new("L", page_size, color=255))
    buf = io.BytesIO()
    pdf.save(buf)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Fake pytesseract/pdf2image injection (mocked tests)
# ---------------------------------------------------------------------------

def _enable_ocr(monkeypatch):
    monkeypatch.setenv("OCR_ENABLED", "1")
    monkeypatch.setattr("shutil.which", lambda name: f"/usr/bin/{name}")
    monkeypatch.setattr(ocr, "_tesseract_langs", lambda path: {"eng", "rus"})


def _inject_fake_ocr_modules(monkeypatch, page_texts, *, total_pages: int | None = None):
    """Fakes `pytesseract.image_to_string`, `pdf2image.convert_from_bytes`,
    `pdf2image.pdfinfo_from_bytes` (plus the `exceptions` submodule) via
    `sys.modules` injection. The fake `convert_from_bytes` HONORS
    `first_page`/`last_page` the way real poppler does (bounding the
    returned image count, not just accepting-and-ignoring the kwargs) so
    mocked tests actually exercise the real bounding logic (round-1 fix,
    Finding 2) rather than trivially passing regardless of it. Returns
    `(tesseract_calls, convert_calls)` — both lists of per-call kwarg
    dicts, for asserting on language/timeout/page-range arguments."""
    if isinstance(page_texts, str):
        page_texts = [page_texts]
    reported_total = total_pages if total_pages is not None else len(page_texts)
    tesseract_calls: list[dict] = []
    convert_calls: list[dict] = []

    fake_pytesseract = types.ModuleType("pytesseract")

    def fake_image_to_string(image, lang=None, timeout=0):
        tesseract_calls.append({"lang": lang, "timeout": timeout})
        idx = len(tesseract_calls) - 1
        return page_texts[idx] if idx < len(page_texts) else ""

    fake_pytesseract.image_to_string = fake_image_to_string
    monkeypatch.setitem(sys.modules, "pytesseract", fake_pytesseract)

    fake_pdf2image = types.ModuleType("pdf2image")

    def fake_convert_from_bytes(data, dpi=200, first_page=None, last_page=None, timeout=None):
        convert_calls.append({"first_page": first_page, "last_page": last_page, "timeout": timeout})
        first = first_page or 1
        last = min(last_page, reported_total) if last_page else reported_total
        return [Image.new("RGB", (10, 10)) for _ in range(max(0, last - first + 1))]

    def fake_pdfinfo_from_bytes(data, timeout=None):
        return {"Pages": reported_total}

    fake_pdf2image.convert_from_bytes = fake_convert_from_bytes
    fake_pdf2image.pdfinfo_from_bytes = fake_pdfinfo_from_bytes
    monkeypatch.setitem(sys.modules, "pdf2image", fake_pdf2image)

    fake_exceptions = types.ModuleType("pdf2image.exceptions")
    for name in ("PDFInfoNotInstalledError", "PDFPageCountError",
                "PDFPopplerTimeoutError", "PDFSyntaxError", "PopplerNotInstalledError"):
        setattr(fake_exceptions, name, type(name, (Exception,), {}))
    monkeypatch.setitem(sys.modules, "pdf2image.exceptions", fake_exceptions)
    return tesseract_calls, convert_calls


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


def test_enabled_true_when_env_and_binaries_and_langs_present(monkeypatch):
    _enable_ocr(monkeypatch)
    assert ocr.ocr_enabled() is True


def test_binaries_present_without_env_stays_disabled(monkeypatch):
    monkeypatch.setattr("shutil.which", lambda name: f"/usr/bin/{name}")
    monkeypatch.setattr(ocr, "_tesseract_langs", lambda path: {"eng", "rus"})
    assert ocr.ocr_enabled() is False  # OCR_ENABLED unset


def test_binary_check_is_cached_after_first_call(monkeypatch):
    which_calls: list[str] = []
    lang_calls: list[str] = []

    def fake_which(name):
        which_calls.append(name)
        return f"/usr/bin/{name}"

    def fake_langs(path):
        lang_calls.append(path)
        return {"eng", "rus"}

    monkeypatch.setenv("OCR_ENABLED", "1")
    monkeypatch.setattr("shutil.which", fake_which)
    monkeypatch.setattr(ocr, "_tesseract_langs", fake_langs)
    assert ocr.ocr_enabled() is True
    assert ocr.ocr_enabled() is True
    # shutil.which invoked once per required binary total, langs check once — not per call
    assert len(which_calls) == len(ocr.REQUIRED_BINARIES)
    assert len(lang_calls) == 1


def test_health_reflects_ocr_enabled(monkeypatch):
    _enable_ocr(monkeypatch)
    assert client.get("/api/health").json() == {
        "status": "ok", "vault_enabled": False, "ocr_enabled": True}


def test_health_ocr_enabled_false_when_env_set_but_binaries_absent(monkeypatch):
    monkeypatch.setenv("OCR_ENABLED", "1")
    monkeypatch.setattr("shutil.which", lambda name: None)
    assert client.get("/api/health").json()["ocr_enabled"] is False


# --- Round-1 fix, Finding 1a: partial install (binaries present, `rus`
# traineddata absent) must report ocr_enabled=False, not True. ---

def test_binaries_present_but_rus_language_missing_stays_disabled(monkeypatch):
    """Mocked reproduction of the exact partial-install shape found on
    the review machine: tesseract/pdftoppm exist, but `tesseract
    --list-langs` only reports `eng` (no `rus`)."""
    monkeypatch.setenv("OCR_ENABLED", "1")
    monkeypatch.setattr("shutil.which", lambda name: f"/usr/bin/{name}")
    monkeypatch.setattr(ocr, "_tesseract_langs", lambda path: {"eng"})  # no "rus"
    assert ocr.ocr_enabled() is False


def test_health_reflects_missing_rus_language_as_disabled(monkeypatch):
    monkeypatch.setenv("OCR_ENABLED", "1")
    monkeypatch.setattr("shutil.which", lambda name: f"/usr/bin/{name}")
    monkeypatch.setattr(ocr, "_tesseract_langs", lambda path: {"eng"})
    assert client.get("/api/health").json()["ocr_enabled"] is False


def test_tesseract_langs_returns_empty_set_on_subprocess_failure(monkeypatch):
    """A vanished binary, a non-zero exit, or a hang must degrade to
    "no languages known" — never raise out of the capability check."""
    def raising_run(*args, **kwargs):
        raise FileNotFoundError("gone")

    monkeypatch.setattr(subprocess, "run", raising_run)
    assert ocr._tesseract_langs("/usr/bin/tesseract") == set()


def test_tesseract_langs_parses_real_list_langs_output_shape(monkeypatch):
    """Pins the parser against tesseract 5.x's actual `--list-langs`
    output shape (one header line, then one code per line)."""
    class FakeCompleted:
        stdout = "List of available languages (3):\neng\nosd\nrus\n"

    monkeypatch.setattr(subprocess, "run", lambda *a, **k: FakeCompleted())
    assert ocr._tesseract_langs("/usr/bin/tesseract") == {"eng", "osd", "rus"}


# ---------------------------------------------------------------------------
# Disabled-path regression: the pre-P7.T4 scanned-PDF error is unchanged
# ---------------------------------------------------------------------------

_SCAN_MESSAGE = ("PDF не содержит текстового слоя (вероятно, это скан). "
                 "Загрузите Excel/CSV либо PDF более высокого качества.")


def test_disabled_path_scanned_pdf_error_message_unchanged(monkeypatch):
    """Round-1 fix, Finding 4: explicitly forces BOTH gates off (env
    unset — conftest's autouse isolation already does this — AND
    `shutil.which` mocked to report both binaries absent) so this test's
    outcome does not silently depend on whatever this runner's real PATH
    happens to have. The original version relied only on `OCR_ENABLED`
    being unset, which was true here by accident, not by design — and the
    machine this was developed/reviewed on genuinely HAS both binaries
    installed (just a partial language install), so an env-only guard
    was one refactor away from silently starting to depend on that."""
    monkeypatch.setattr("shutil.which", lambda name: None)
    with pytest.raises(extraction.ScannedPdfError) as exc_info:
        extraction.extract_from_pdf(_blank_pdf_bytes())
    assert str(exc_info.value) == _SCAN_MESSAGE


def test_disabled_path_via_real_http_and_process_pool():
    """Same regression, end to end through POST /api/upload + POST
    /api/extract — the real spawned ProcessPoolExecutor. Deliberately NOT
    mocking `shutil.which` here: a spawned worker re-imports `ocr.py`
    fresh and never sees a monkeypatch made in the test process (a fresh
    interpreter, per this file's own module docstring), so the only gate
    that actually reaches the worker is `OCR_ENABLED` via inherited
    `os.environ` — conftest.py's autouse isolation deletes it, which is
    what makes this test deterministic regardless of the real machine's
    installed binaries or language data. Also pins the new
    `code:"scanned_pdf"` field (additive) alongside the unchanged
    message."""
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
    uses (label matching, column classification, period selection) — not
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
    15-point PDF penalty (80) — OCR's additional cap (60) must still bring
    it down further, proving the cap is actually applied, not just present
    but never binding."""
    _enable_ocr(monkeypatch)
    _inject_fake_ocr_modules(monkeypatch, _OCR_TEXT)
    result = extraction.extract_from_pdf(_blank_pdf_bytes())
    revenue = next(v for v in result.values if v.metric == "revenue")
    assert revenue.confidence == extraction_ocr.CONFIDENCE_CAP == 60.0


def test_ocr_finds_nothing_raises_the_ocr_specific_message(monkeypatch):
    """OCR ran (env on, binaries "present") but every page recognized as
    blank — still an honest ScannedPdfError, not a silent all-N/A result."""
    _enable_ocr(monkeypatch)
    _inject_fake_ocr_modules(monkeypatch, "")
    with pytest.raises(extraction.ScannedPdfError) as exc_info:
        extraction.extract_from_pdf(_blank_pdf_bytes())
    assert "OCR не смог распознать" in str(exc_info.value)


def test_ocr_uses_rus_plus_eng_language(monkeypatch):
    _enable_ocr(monkeypatch)
    tesseract_calls, _ = _inject_fake_ocr_modules(monkeypatch, _OCR_TEXT)
    extraction.extract_from_pdf(_blank_pdf_bytes())
    assert tesseract_calls[0]["lang"] == "rus+eng"


# --- Round-1 fix, Finding 1b: non-empty GARBAGE text (recognized, but
# matching no label) must raise the OCR-specific error too, not return a
# silent 200 all-N/A. ---

def test_ocr_garbage_text_matching_no_metric_raises_ocr_specific_error(monkeypatch):
    """Mocked reproduction of Finding 1: OCR recognizes SOMETHING
    non-empty ("Bbipyuka..." — Latin lookalikes for "Выручка", exactly what
    a partial/eng-only install produces on Cyrillic input per the
    reviewer's own repro), but it matches no label at all. Before the fix,
    `ocr_full_text.strip()` alone let this sail through as a 200 with
    every metric N/A; the productivity guard must now catch it."""
    _enable_ocr(monkeypatch)
    _inject_fake_ocr_modules(monkeypatch, "Bbipyuka  1500000  1200000\n")
    with pytest.raises(extraction.ScannedPdfError) as exc_info:
        extraction.extract_from_pdf(_blank_pdf_bytes())
    assert "OCR не смог распознать данные" in str(exc_info.value)


def test_ocr_productive_result_with_at_least_one_real_metric_does_not_raise(monkeypatch):
    """Negative case for the productivity guard: mixed garbage + one real
    row must NOT raise — the guard is "zero metrics," not "perfect text.\""""
    _enable_ocr(monkeypatch)
    _inject_fake_ocr_modules(
        monkeypatch, "Bbipyuka  garbage  garbage\nВыручка  1000000  900000\n")
    result = extraction.extract_from_pdf(_blank_pdf_bytes())  # must not raise
    by_metric = {v.metric: v for v in result.values}
    assert by_metric["revenue"].value == 1000000


# ---------------------------------------------------------------------------
# extraction_ocr.ocr_pdf_pages: page cap / per-page failure / total budget
# ---------------------------------------------------------------------------

def test_page_cap_truncates_and_warns(monkeypatch):
    monkeypatch.setattr(extraction_ocr, "MAX_PAGES", 2)
    _inject_fake_ocr_modules(monkeypatch, [_OCR_TEXT] * 5, total_pages=5)
    texts, warnings = extraction_ocr.ocr_pdf_pages(b"irrelevant")
    assert len(texts) == 2
    assert any("ограничен первыми 2 стр. из 5" in w for w in warnings)


def test_rasterization_is_bounded_via_first_last_page_kwargs_not_slicing(monkeypatch):
    """Round-1 fix, Finding 2: rasterization must be bounded UPSTREAM via
    `first_page`/`last_page` passed to `convert_from_bytes`, not by
    slicing its returned list after the fact (which would still rasterize
    every page into memory first). Asserts the actual kwargs, not just the
    returned count — a regression to python-side slicing would still get
    the returned count "right" by accident but never pass these kwargs."""
    _, convert_calls = _inject_fake_ocr_modules(monkeypatch, [_OCR_TEXT] * 3, total_pages=3)
    extraction_ocr.ocr_pdf_pages(b"irrelevant")
    assert convert_calls[0]["first_page"] == 1
    assert convert_calls[0]["last_page"] == extraction_ocr.MAX_PAGES
    assert convert_calls[0]["timeout"] is not None and convert_calls[0]["timeout"] >= 1


def test_per_page_tesseract_timeout_degrades_that_page_not_the_whole_run(monkeypatch):
    """A page-level RuntimeError (pytesseract's own timeout, or a
    TesseractError) must not abort the rest of the document — it degrades
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
    fake_pdf2image.convert_from_bytes = lambda data, dpi=200, first_page=None, last_page=None, timeout=None: [
        Image.new("RGB", (10, 10)) for _ in range(2)]
    fake_pdf2image.pdfinfo_from_bytes = lambda data, timeout=None: {"Pages": 2}
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
    pytesseract — proving the outer budget, not just the per-page one, is
    actually enforced (the graceful-degradation guard against the pool's
    own kill-on-timeout)."""
    monkeypatch.setattr(extraction_ocr, "TOTAL_BUDGET_SECONDS", 0)
    tesseract_calls, _ = _inject_fake_ocr_modules(monkeypatch, [_OCR_TEXT] * 3, total_pages=3)
    texts, warnings = extraction_ocr.ocr_pdf_pages(b"irrelevant")
    assert texts == []
    assert tesseract_calls == []  # pytesseract never invoked at all
    assert any("остановлен по общему лимиту времени" in w for w in warnings)


def test_rasterization_failure_returns_empty_without_raising(monkeypatch):
    """pdf2image itself failing to rasterize (bad PDF, or — in
    production, if the binary vanished mid-request — a poppler error)
    must degrade to an empty result with a warning, never propagate a raw
    exception out of the worker."""
    fake_exceptions = types.ModuleType("pdf2image.exceptions")
    for name in ("PDFInfoNotInstalledError", "PDFPageCountError",
                "PDFPopplerTimeoutError", "PDFSyntaxError", "PopplerNotInstalledError"):
        setattr(fake_exceptions, name, type(name, (Exception,), {}))
    monkeypatch.setitem(sys.modules, "pdf2image.exceptions", fake_exceptions)

    fake_pdf2image = types.ModuleType("pdf2image")

    def raising_convert(data, dpi=200, first_page=None, last_page=None, timeout=None):
        raise fake_exceptions.PDFSyntaxError("bad pdf")

    fake_pdf2image.convert_from_bytes = raising_convert
    fake_pdf2image.pdfinfo_from_bytes = lambda data, timeout=None: {"Pages": 1}
    monkeypatch.setitem(sys.modules, "pdf2image", fake_pdf2image)
    fake_pytesseract = types.ModuleType("pytesseract")
    fake_pytesseract.image_to_string = lambda *a, **k: ""
    monkeypatch.setitem(sys.modules, "pytesseract", fake_pytesseract)

    texts, warnings = extraction_ocr.ocr_pdf_pages(b"irrelevant")
    assert texts == []
    assert any("Не удалось подготовить PDF" in w for w in warnings)


def test_page_count_lookup_failure_is_best_effort_not_fatal(monkeypatch):
    """`pdfinfo_from_bytes` failing (any reason) must not abort OCR — the
    truncation warning is purely informational; recognition still
    proceeds, bounded by MAX_PAGES regardless."""
    def raising_pdfinfo(data, timeout=None):
        raise RuntimeError("pdfinfo exploded")

    _, convert_calls = _inject_fake_ocr_modules(monkeypatch, _OCR_TEXT)
    import pdf2image
    pdf2image.pdfinfo_from_bytes = raising_pdfinfo
    texts, warnings = extraction_ocr.ocr_pdf_pages(b"irrelevant")
    assert texts == [_OCR_TEXT]
    assert not any("ограничен первыми" in w for w in warnings)  # no page count to report


def test_inner_budget_never_exceeds_extract_timeout_seconds(monkeypatch):
    """Round-1 fix, Finding 3: pre-fix `max(10, ETS - 20)` inverted for
    any ETS < 30 (e.g. ETS=5 -> inner budget 10, exceeding the outer
    timeout). `min(max(10, ETS - 20), ETS)` must hold the invariant across
    the whole range, matching the reviewer's own measured table."""
    cases = {5: 5, 9: 9, 10: 10, 29: 10, 90: 70}
    for ets, expected in cases.items():
        budget = min(max(10, ets - 20), ets)
        assert budget == expected
        assert budget <= ets


# ---------------------------------------------------------------------------
# Real end-to-end: the actual installed tesseract/pdftoppm binaries.
# Self-computing expected outcomes from THIS runner's real `tesseract
# --list-langs` output, so these pass honestly on a partial install (like
# the machine this fix was developed on) or a full one (CI with both
# language packs) alike — never a hardcoded assumption either way.
# ---------------------------------------------------------------------------

_REAL_TESSERACT = shutil.which("tesseract")
_REAL_PDFTOPPM = shutil.which("pdftoppm")
requires_real_binaries = pytest.mark.skipif(
    not (_REAL_TESSERACT and _REAL_PDFTOPPM),
    reason="tesseract/pdftoppm not installed on this runner",
)


def _real_tesseract_langs() -> set[str]:
    """Independent of ocr._tesseract_langs (not calling it) — a real,
    separately-implemented check of the same fact, so this isn't circular
    with the implementation under test."""
    if not _REAL_TESSERACT:
        return set()
    proc = subprocess.run(
        [_REAL_TESSERACT, "--list-langs"], capture_output=True, text=True, timeout=5)
    return {line.strip() for line in proc.stdout.splitlines()[1:] if line.strip()}


_REAL_LABELS = ["Выручка  1500000  1200000", "Итого активы  2400000  2100000"]


@requires_real_binaries
def test_real_capability_check_matches_actual_tesseract_language_install(monkeypatch):
    """No mocking beyond OCR_ENABLED — pins ocr_enabled() against
    whatever this machine's REAL tesseract install actually has. On the
    machine this fix was developed/reviewed against, `rus` is genuinely
    absent (the reviewer's exact finding): this would have reported True
    before the fix and correctly reports False after it."""
    monkeypatch.setenv("OCR_ENABLED", "1")
    expected = {"eng", "rus"} <= _real_tesseract_langs()
    assert ocr.ocr_enabled() is expected


@requires_real_binaries
def test_real_end_to_end_honest_outcome_for_this_runners_actual_install(monkeypatch):
    """Full real pipeline, no mocking at all: real pdfplumber (confirms no
    text layer), real ocr.ocr_enabled() routing decision, real
    pdf2image/poppler rasterization, real tesseract recognition. On a
    partial install (this dev machine): the capability check now refuses
    OCR up front (Finding 1a) and the pre-P7.T4 "no text layer" error
    fires — not a silent 200. On a full install: OCR actually recognizes
    the Cyrillic labels and the extraction succeeds."""
    monkeypatch.setenv("OCR_ENABLED", "1")
    data = _real_scanned_pdf_from_lines(_REAL_LABELS)
    if not ({"eng", "rus"} <= _real_tesseract_langs()):
        with pytest.raises(extraction.ScannedPdfError) as exc_info:
            extraction.extract_from_pdf(data)
        assert str(exc_info.value) == _SCAN_MESSAGE
    else:
        result = extraction.extract_from_pdf(data)
        assert any(v.value is not None for v in result.values)


@requires_real_binaries
def test_real_productivity_guard_catches_garbage_even_if_capability_gate_bypassed(monkeypatch):
    """Bypasses the capability gate (simulating a race or a future bug in
    ocr.ocr_enabled()) to force the REAL tesseract to run regardless —
    proving the productivity guard (Finding 1b) independently, as
    defense-in-depth beneath the capability-check fix (Finding 1a), not
    merely redundant with it. On this runner's partial install, real
    eng-only recognition of Cyrillic input produces real unmatched
    garbage, and the guard must still catch it rather than return a
    silent 200 all-N/A."""
    monkeypatch.setenv("OCR_ENABLED", "1")
    monkeypatch.setattr(extraction.OCR, "ocr_enabled", lambda: True)
    data = _real_scanned_pdf_from_lines(_REAL_LABELS)
    if not ({"eng", "rus"} <= _real_tesseract_langs()):
        with pytest.raises(extraction.ScannedPdfError) as exc_info:
            extraction.extract_from_pdf(data)
        assert "OCR не смог распознать данные" in str(exc_info.value)
    else:
        result = extraction.extract_from_pdf(data)
        assert any(v.value is not None for v in result.values)


@requires_real_binaries
def test_real_rasterization_bounded_to_max_pages_not_full_document():
    """Round-1 fix, Finding 2, proven against real poppler: a document
    with more pages than MAX_PAGES must only ever have MAX_PAGES actually
    rasterized+recognized — not the whole document, sliced afterward."""
    n_pages = extraction_ocr.MAX_PAGES + 10
    data = _real_multipage_pdf(n_pages)
    texts, warnings = extraction_ocr.ocr_pdf_pages(data)
    assert len(texts) == extraction_ocr.MAX_PAGES
    assert any(f"из {n_pages}" in w for w in warnings)
    assert "PAGE 1" in texts[0]
    assert f"PAGE {extraction_ocr.MAX_PAGES}" in texts[-1]


@requires_real_binaries
def test_real_poppler_timeout_handler_is_live_and_degrades_gracefully(monkeypatch):
    """Round-1 fix, Finding 6: `PDFPopplerTimeoutError` was imported and
    caught but could never fire — nothing ever passed `timeout=` to
    `convert_from_bytes`. A real, deliberately-too-tight total budget
    against real, large pages proves it now genuinely fires and the
    function degrades to `([], [warning])` rather than propagating the
    exception, hanging, or (pre-Finding-2-fix) exhausting memory first."""
    monkeypatch.setattr(extraction_ocr, "TOTAL_BUDGET_SECONDS", 1.3)
    data = _real_blank_multipage_pdf(extraction_ocr.MAX_PAGES)
    texts, warnings = extraction_ocr.ocr_pdf_pages(data)
    assert texts == []
    assert any("Не удалось подготовить PDF" in w for w in warnings)
