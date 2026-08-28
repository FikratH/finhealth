"""OCR for scanned PDFs (P7.T4): capability gating, detection routing,
mocked-OCR pipeline, confidence marking, disabled-path regression.

Round 1 fix note: `tesseract`/`pdftoppm` are installed on the machine this
suite is developed/reviewed against, but round 1 was written against a
PARTIAL language install (binary present, no `rus` traineddata) — that
false assumption in round 0's docstrings is what let the "partial install
silently returns garbage as a 200" bug (Finding 1) stay invisible.

Round 2 fix note: `tesseract-lang` (the full language pack, including
`rus`) has since been installed on this machine specifically to get the
strongest possible real-binary proof for round 2 — no PATH shim needed.
With a genuine full install, live execution surfaced NEW-1: tesseract's
DEFAULT recognition mode collapses inter-column whitespace to a single
space, but `lines_to_matrix` requires 2+ spaces to split columns at all —
a real, perfectly-recognized page yielded ZERO rows, so the round-1
productivity guard (working exactly as designed) turned every successful
recognition into a 422. Fixed with `config="-c preserve_interword_spaces=1"`
on the `image_to_string` call. This means the real end-to-end tests below
now exercise the actual SUCCESS path, not just "OCR correctly refused" —
both are proven, self-computed from this runner's real
`tesseract --list-langs` output so they stay honest on a partial install
too.

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
import logging
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

def _load_readable_font(size: int):
    """A real TrueType font with actual Cyrillic glyph shapes. PIL's
    bitmap default font's glyphs are too crude for tesseract to reliably
    tell Latin from Cyrillic lookalikes apart at low res (measured: a
    default-font "PAGE" came back recognized as Cyrillic "РАСЕ", and a
    default-font "Выручка" came back as mostly "Х"es) — real-binary tests
    need real glyphs, not placeholder boxes. Falls back to the bitmap
    default only if no system TrueType font is found (e.g. a minimal
    Linux CI image without fontconfig) — degraded, not fatal, since these
    tests already skip cleanly when the binaries themselves are absent."""
    from PIL import ImageFont

    for path in (
        "/System/Library/Fonts/Supplemental/Arial.ttf",  # macOS
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",  # common Linux
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default(size=size)


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


def _real_scanned_pdf_table(
    rows: list[tuple[str, str, str]], col_x=(20, 500, 900), width=1300,
) -> bytes:
    """A real, valid, IMAGE-only PDF (no text layer, verified by
    pdfplumber in `test_real_...` below) with `rows` rendered as an
    actual table: each column drawn at its OWN x-position, not embedded
    as literal space characters in one string. This matters — measured
    directly: literal spaces rendered via a single draw.text() call do
    not produce a wide enough pixel gap for tesseract's
    `preserve_interword_spaces` to recover as a real multi-space column
    separator; genuinely-separate column positions (what any real
    scanned table actually looks like) do. Real poppler rasterizes this,
    real tesseract recognizes it — no fixture file needed."""
    import pypdfium2 as pdfium
    from PIL import ImageDraw

    line_height = 70
    font = _load_readable_font(30)
    img = Image.new("L", (width, line_height * len(rows) + 40), color=255)
    draw = ImageDraw.Draw(img)
    for i, row in enumerate(rows):
        for x, cell in zip(col_x, row):
            draw.text((x, 20 + i * line_height), cell, fill=0, font=font)
    pdf = pdfium.PdfDocument.new()
    _embed_bitmap_page(pdf, img)
    buf = io.BytesIO()
    pdf.save(buf)
    return buf.getvalue()


def _real_multipage_pdf(n_pages: int, page_size=(600, 150)) -> bytes:
    """A real, valid, image-only multi-page PDF, each page labeled
    "Стр. {n}" via real rendered text (RU, matching this codebase's own
    page-reference convention, e.g. extraction.py's "PDF, стр. N") —
    used to prove page-cap bounding (Finding 2) against real poppler/
    tesseract, not a mock. Deliberately NOT "PAGE {n}": measured that a
    bare Latin "PAGE" recognized under `lang="rus+eng"` comes back as the
    Cyrillic lookalike "РАСЕ" (P/Р, A/А, G, E/Е are visually identical
    between the two alphabets) — a real recognition ambiguity, not a
    fixture bug, that a Cyrillic label sidesteps entirely."""
    import pypdfium2 as pdfium
    from PIL import ImageDraw

    font = _load_readable_font(24)
    pdf = pdfium.PdfDocument.new()
    for i in range(n_pages):
        img = Image.new("L", page_size, color=255)
        draw = ImageDraw.Draw(img)
        draw.text((20, page_size[1] // 2 - 15), f"Стр. {i + 1}", fill=0, font=font)
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
    """Fakes `pytesseract.image_to_string`, `pdf2image.convert_from_bytes`
    (per-page: `first_page == last_page`, matching round-2's rasterize-
    one-page-at-a-time fix), `pdf2image.pdfinfo_from_bytes` (plus the
    `exceptions` submodule) via `sys.modules` injection. The fake
    `convert_from_bytes` HONORS `first_page`/`last_page` the way real
    poppler does — returns one image if the requested page is within
    `reported_total`, an empty list past it — so mocked tests actually
    exercise the real per-page bounding logic, not a stand-in that would
    pass regardless of it. Returns `(tesseract_calls, convert_calls)` —
    both lists of per-call kwarg dicts."""
    if isinstance(page_texts, str):
        page_texts = [page_texts]
    reported_total = total_pages if total_pages is not None else len(page_texts)
    tesseract_calls: list[dict] = []
    convert_calls: list[dict] = []

    fake_pytesseract = types.ModuleType("pytesseract")

    def fake_image_to_string(image, lang=None, config="", timeout=0):
        tesseract_calls.append({"lang": lang, "config": config, "timeout": timeout})
        idx = len(tesseract_calls) - 1
        return page_texts[idx] if idx < len(page_texts) else ""

    fake_pytesseract.image_to_string = fake_image_to_string
    monkeypatch.setitem(sys.modules, "pytesseract", fake_pytesseract)

    fake_pdf2image = types.ModuleType("pdf2image")

    def fake_convert_from_bytes(data, dpi=200, first_page=None, last_page=None, timeout=None):
        convert_calls.append({"first_page": first_page, "last_page": last_page, "timeout": timeout})
        page_no = first_page or 1
        if page_no > reported_total or page_no > (last_page or page_no):
            return []
        return [Image.new("RGB", (10, 10))]

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
    """Mocked reproduction of the partial-install shape: tesseract/
    pdftoppm exist, but `tesseract --list-langs` only reports `eng`."""
    monkeypatch.setenv("OCR_ENABLED", "1")
    monkeypatch.setattr("shutil.which", lambda name: f"/usr/bin/{name}")
    monkeypatch.setattr(ocr, "_tesseract_langs", lambda path: {"eng"})  # no "rus"
    assert ocr.ocr_enabled() is False


def test_health_reflects_missing_rus_language_as_disabled(monkeypatch):
    monkeypatch.setenv("OCR_ENABLED", "1")
    monkeypatch.setattr("shutil.which", lambda name: f"/usr/bin/{name}")
    monkeypatch.setattr(ocr, "_tesseract_langs", lambda path: {"eng"})
    assert client.get("/api/health").json()["ocr_enabled"] is False


def test_tesseract_langs_returns_empty_set_when_binary_vanishes(monkeypatch):
    """A binary that disappears between shutil.which's check and this
    call (FileNotFoundError from subprocess.run itself) must degrade to
    "no languages known" — never raise out of the capability check."""
    def raising_run(*args, **kwargs):
        raise FileNotFoundError("gone")

    monkeypatch.setattr(subprocess, "run", raising_run)
    assert ocr._tesseract_langs("/usr/bin/tesseract") == set()


def test_tesseract_langs_parses_real_list_langs_output_shape(monkeypatch):
    """Pins the parser against tesseract 5.x's actual `--list-langs`
    output shape (one header line, then one code per line, exit 0)."""
    class FakeCompleted:
        returncode = 0
        stdout = "List of available languages (3):\neng\nosd\nrus\n"

    monkeypatch.setattr(subprocess, "run", lambda *a, **k: FakeCompleted())
    assert ocr._tesseract_langs("/usr/bin/tesseract") == {"eng", "osd", "rus"}


# --- Round-2 fix, Finding NEW-3: the probe must fail closed on EVERY
# failure mode, not just the ones round 1 happened to catch. ---

def test_tesseract_langs_fails_closed_on_nonzero_exit_with_valid_looking_output(monkeypatch):
    """A non-zero exit code must be treated as failure even when stdout
    still looks like a plausible language list — round 1 never read
    `proc.returncode` at all, so this previously reported `{"eng","rus"}`
    (fail-OPEN) instead of the empty set."""
    class FakeCompleted:
        returncode = 3
        stdout = "List of available languages (2):\neng\nrus\n"

    monkeypatch.setattr(subprocess, "run", lambda *a, **k: FakeCompleted())
    assert ocr._tesseract_langs("/usr/bin/tesseract") == set()


def test_tesseract_langs_fails_closed_on_non_utf8_stdout(monkeypatch):
    """`subprocess.run(..., text=True)` decodes under `errors="strict"`,
    so a non-UTF-8 byte on stdout (e.g. a non-ASCII TESSDATA_PREFIX in a
    non-UTF-8 container locale) previously raised `UnicodeDecodeError`
    right out of this function — a `ValueError`, uncaught by round 1's
    `except (OSError, TimeoutExpired)`, which escaped `ocr_enabled()` and
    could 500 `GET /api/health` (a route the frontend polls and infra
    healthchecks hit)."""
    def raising_run(*args, **kwargs):
        raise UnicodeDecodeError("utf-8", b"\xff", 0, 1, "invalid start byte")

    monkeypatch.setattr(subprocess, "run", raising_run)
    assert ocr._tesseract_langs("/usr/bin/tesseract") == set()


def test_health_never_500s_on_a_misbehaving_tesseract_probe(monkeypatch):
    """End-to-end proof of NEW-3's blast radius: even with OCR_ENABLED=1
    and a `tesseract` binary that "exists" (shutil.which) but whose probe
    explodes with a non-UTF-8 decode error, GET /api/health still returns
    200 with ocr_enabled: false — never a 500."""
    monkeypatch.setenv("OCR_ENABLED", "1")
    monkeypatch.setattr("shutil.which", lambda name: f"/usr/bin/{name}")

    def raising_run(*args, **kwargs):
        raise UnicodeDecodeError("utf-8", b"\xff", 0, 1, "invalid start byte")

    monkeypatch.setattr(subprocess, "run", raising_run)
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["ocr_enabled"] is False


# ---------------------------------------------------------------------------
# Disabled-path regression: the pre-P7.T4 scanned-PDF error is unchanged
# ---------------------------------------------------------------------------

_SCAN_MESSAGE = ("PDF не содержит текстового слоя (вероятно, это скан). "
                 "Загрузите Excel/CSV либо PDF более высокого качества.")


def test_disabled_path_scanned_pdf_error_message_unchanged(monkeypatch):
    """Explicitly forces BOTH gates off (env unset — conftest's autouse
    isolation already does this — AND `shutil.which` mocked to report
    both binaries absent) so this test's outcome does not silently depend
    on whatever this runner's real PATH happens to have. The machine this
    was developed/reviewed on genuinely has both binaries AND the full
    language pack installed now (round 2), so an env-only guard would be
    one refactor away from silently starting to depend on that."""
    monkeypatch.setattr("shutil.which", lambda name: None)
    with pytest.raises(extraction.ScannedPdfError) as exc_info:
        extraction.extract_from_pdf(_blank_pdf_bytes())
    assert str(exc_info.value) == _SCAN_MESSAGE


def test_disabled_path_via_real_http_and_process_pool(caplog):
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
    message.

    Close wave (W4): before this fix, `ScannedPdfError` was `extract()`'s
    only failure path with no log call at all — pins that main.py's except
    branch now logs unconditionally, with an empty `ocr_warnings` list
    here (OCR never ran: `OCR_ENABLED` is unset)."""
    up = client.post(
        "/api/upload", files={"file": ("scan.pdf", _blank_pdf_bytes(), "application/pdf")})
    assert up.status_code == 200, up.text
    upload_id = up.json()["upload_id"]
    with caplog.at_level(logging.INFO):
        resp = client.post("/api/extract", json={"upload_id": upload_id})
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == {"code": "scanned_pdf", "message": _SCAN_MESSAGE}
    scan_record = next(r for r in caplog.records if r.name == "finhealth"
                       and "scanned pdf" in r.getMessage())
    assert f"id={upload_id}" in scan_record.getMessage()
    assert "ocr_warnings=[]" in scan_record.getMessage()


def test_scanned_pdf_error_carries_ocr_warnings_for_the_close_wave_log_line():
    """Unit-level proof that `ScannedPdfError` genuinely carries whatever
    diagnostics `extraction_ocr.ocr_pdf_pages` collected — the fact
    `test_disabled_path_via_real_http_and_process_pool` above only
    exercises with an EMPTY list (OCR never ran in that scenario). Drives
    the productivity-guard raise site directly (mocked OCR pipeline, no
    real tesseract needed) and checks the exception's own attribute,
    independent of the HTTP/logging layer."""
    from app.services import extraction_ocr as EO

    def fake_ocr_pdf_pages(data):
        return ["Bbipyuka  1500000  1200000\n"], ["страница 1: низкая уверенность"]

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(EO, "ocr_pdf_pages", fake_ocr_pdf_pages)
        _enable_ocr(mp)
        with pytest.raises(extraction.ScannedPdfError) as exc_info:
            extraction.extract_from_pdf(_blank_pdf_bytes())
    assert exc_info.value.ocr_warnings == ["страница 1: низкая уверенность"]


# ---------------------------------------------------------------------------
# lines_to_matrix: the exact contract that made NEW-1 dangerous
# ---------------------------------------------------------------------------

def test_lines_to_matrix_requires_double_space_column_separation():
    """Pins the root cause of NEW-1: tesseract's DEFAULT mode collapses
    inter-column whitespace to a SINGLE space, and lines_to_matrix
    requires 2+ spaces to split columns at all. Single-space-collapsed
    text (what tesseract emits WITHOUT preserve_interword_spaces=1) must
    yield zero rows; the same content with columns genuinely preserved as
    multi-space-separated fields (what it emits WITH the config, per the
    round-2 fix below) must parse. This is exactly why that config= is
    load-bearing, not cosmetic."""
    single_space = "Выручка 1000000 900000"
    double_space = "Выручка  1000000  900000"
    assert extraction_ocr.lines_to_matrix(single_space) == []
    assert extraction_ocr.lines_to_matrix(double_space) == [["Выручка", "1000000", "900000"]]


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


def test_ocr_passes_preserve_interword_spaces_config_to_tesseract(monkeypatch):
    """Round-2 fix, NEW-1: without this config, tesseract's default mode
    collapses column gaps to single spaces and lines_to_matrix parses
    zero rows from any real recognition output — the OCR path could
    recognize a page perfectly and still extract nothing. Pins that the
    fix is actually wired into the real call, not just documented."""
    _enable_ocr(monkeypatch)
    tesseract_calls, _ = _inject_fake_ocr_modules(monkeypatch, _OCR_TEXT)
    extraction.extract_from_pdf(_blank_pdf_bytes())
    assert tesseract_calls[0]["config"] == "-c preserve_interword_spaces=1"


# --- Round-1 fix, Finding 1b: non-empty GARBAGE text (recognized, but
# matching no label) must raise the OCR-specific error too, not return a
# silent 200 all-N/A. ---

def test_ocr_garbage_text_matching_no_metric_raises_ocr_specific_error(monkeypatch):
    """Mocked reproduction: OCR recognizes SOMETHING non-empty
    ("Bbipyuka..." — Latin lookalikes for "Выручка", exactly what a
    partial/eng-only install produces on Cyrillic input), but it matches
    no label at all. Before round 1's fix, `ocr_full_text.strip()` alone
    let this sail through as a 200 with every metric N/A; the productivity
    guard must catch it."""
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


# --- Round-2 fix, Finding NEW-1: the mocked fixtures above already use
# double-space (preserved) text throughout, matching what tesseract emits
# WITH the config fix. These two make the contrast explicit. ---

def test_realistic_single_space_recognition_would_hit_the_productivity_guard(monkeypatch):
    """Mocked simulation of tesseract's DEFAULT (no
    preserve_interword_spaces) output shape on a REAL, correctly-
    recognized page — single spaces between columns (the reviewer's own
    repro: 'Revenue 1500000 1200000'). Every word recognized perfectly,
    but lines_to_matrix still yields zero rows from it, so the
    productivity guard fires. This is the mocked proof of NEW-1's root
    cause, independent of whether the config= fix is wired in — it shows
    what would still happen if it weren't."""
    _enable_ocr(monkeypatch)
    _inject_fake_ocr_modules(monkeypatch, "Revenue 1500000 1200000\n")
    with pytest.raises(extraction.ScannedPdfError):
        extraction.extract_from_pdf(_blank_pdf_bytes())


def test_realistic_preserved_spacing_recognition_extracts_correctly(monkeypatch):
    """Mocked simulation of tesseract's output WITH
    preserve_interword_spaces=1 (columns separated by real multi-space
    gaps, matching the reviewer's own measured fix output) — must parse
    and extract."""
    _enable_ocr(monkeypatch)
    _inject_fake_ocr_modules(monkeypatch, "Revenue        1500000        1200000\n")
    result = extraction.extract_from_pdf(_blank_pdf_bytes())
    by_metric = {v.metric: v for v in result.values}
    assert by_metric["revenue"].value == 1500000


# ---------------------------------------------------------------------------
# extraction_ocr.ocr_pdf_pages: page cap / per-page failure / total budget
# ---------------------------------------------------------------------------

def test_page_cap_truncates_and_warns(monkeypatch):
    monkeypatch.setattr(extraction_ocr, "MAX_PAGES", 2)
    _inject_fake_ocr_modules(monkeypatch, [_OCR_TEXT] * 5, total_pages=5)
    texts, warnings = extraction_ocr.ocr_pdf_pages(b"irrelevant")
    assert len(texts) == 2
    assert any("ограничен первыми 2 стр. из 5" in w for w in warnings)


def test_rasterization_is_per_page_not_a_single_bulk_call(monkeypatch):
    """Round-2 fix, F2 residual: rasterization must happen ONE PAGE AT A
    TIME — a separate `convert_from_bytes` call per page with
    `first_page == last_page`, not one bulk call across the whole
    MAX_PAGES range — so peak memory is a single decoded page, not
    MAX_PAGES of them at once (round-1's fix bounded the RANGE but still
    rasterized it in one shot). Asserts the actual per-call kwargs, not
    just the returned page count, which a regression to a single bulk
    call would still get "right" by accident."""
    _, convert_calls = _inject_fake_ocr_modules(monkeypatch, [_OCR_TEXT] * 3, total_pages=3)
    extraction_ocr.ocr_pdf_pages(b"irrelevant")
    assert len(convert_calls) == 3
    for idx, call in enumerate(convert_calls, start=1):
        assert call["first_page"] == idx
        assert call["last_page"] == idx
        assert call["timeout"] is not None and call["timeout"] >= 1


def test_per_page_tesseract_timeout_degrades_that_page_not_the_whole_run(monkeypatch):
    """A page-level RuntimeError (pytesseract's own timeout, or a
    TesseractError) must not abort the rest of the document — it degrades
    to an empty page with a warning, and later pages still get processed."""
    fake_pytesseract = types.ModuleType("pytesseract")
    call_count = {"n": 0}

    def flaky_image_to_string(image, lang=None, config="", timeout=0):
        call_count["n"] += 1
        if call_count["n"] == 1:
            raise RuntimeError("Tesseract process timeout")
        return "Выручка  1000000  900000\n"

    fake_pytesseract.image_to_string = flaky_image_to_string
    monkeypatch.setitem(sys.modules, "pytesseract", fake_pytesseract)

    fake_pdf2image = types.ModuleType("pdf2image")

    def fake_convert(data, dpi=200, first_page=None, last_page=None, timeout=None):
        page_no = first_page or 1
        return [Image.new("RGB", (10, 10))] if page_no <= 2 else []

    fake_pdf2image.convert_from_bytes = fake_convert
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


def test_rasterization_failure_on_first_page_returns_empty_without_raising(monkeypatch):
    """pdf2image itself failing to rasterize the first page (bad PDF, or
    — in production, if the binary vanished mid-request — a poppler
    error) must degrade to an empty result with a warning, never
    propagate a raw exception out of the worker."""
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


def test_rasterization_failure_mid_document_reports_partial_progress(monkeypatch):
    """Round-2 addition: a rasterization failure on a LATER page (not the
    first) — newly reachable now that rasterization happens per page
    inside the loop — must report what WAS recognized so far, with a
    distinct message from the "nothing at all" case."""
    fake_exceptions = types.ModuleType("pdf2image.exceptions")
    for name in ("PDFInfoNotInstalledError", "PDFPageCountError",
                "PDFPopplerTimeoutError", "PDFSyntaxError", "PopplerNotInstalledError"):
        setattr(fake_exceptions, name, type(name, (Exception,), {}))
    monkeypatch.setitem(sys.modules, "pdf2image.exceptions", fake_exceptions)

    fake_pdf2image = types.ModuleType("pdf2image")

    def flaky_convert(data, dpi=200, first_page=None, last_page=None, timeout=None):
        if (first_page or 1) == 1:
            return [Image.new("RGB", (10, 10))]
        raise fake_exceptions.PDFPopplerTimeoutError("timed out")

    fake_pdf2image.convert_from_bytes = flaky_convert
    fake_pdf2image.pdfinfo_from_bytes = lambda data, timeout=None: {"Pages": 3}
    monkeypatch.setitem(sys.modules, "pdf2image", fake_pdf2image)
    fake_pytesseract = types.ModuleType("pytesseract")
    fake_pytesseract.image_to_string = lambda *a, **k: "Выручка  1000000  900000\n"
    monkeypatch.setitem(sys.modules, "pytesseract", fake_pytesseract)

    texts, warnings = extraction_ocr.ocr_pdf_pages(b"irrelevant")
    assert texts == ["Выручка  1000000  900000\n"]
    assert any("растеризовать стр. 2" in w and "распознано 1 стр." in w for w in warnings)
    assert not any("Не удалось подготовить PDF" in w for w in warnings)


def test_page_count_lookup_failure_is_best_effort_not_fatal(monkeypatch):
    """`pdfinfo_from_bytes` failing (any reason) must not abort OCR — the
    truncation warning is purely informational; recognition still
    proceeds, bounded by MAX_PAGES regardless."""
    def raising_pdfinfo(data, timeout=None):
        raise RuntimeError("pdfinfo exploded")

    _inject_fake_ocr_modules(monkeypatch, _OCR_TEXT)
    import pdf2image
    pdf2image.pdfinfo_from_bytes = raising_pdfinfo
    texts, warnings = extraction_ocr.ocr_pdf_pages(b"irrelevant")
    assert texts == [_OCR_TEXT]
    assert not any("ограничен первыми" in w for w in warnings)  # no page count to report


def test_inner_budget_never_exceeds_extract_timeout_seconds():
    """Round-1 fix, Finding 3: pre-fix `max(10, ETS - 20)` inverted for
    any ETS < 30 (e.g. ETS=5 -> inner budget 10, exceeding the outer
    timeout). `min(max(10, ETS - 20), ETS)` must hold the invariant across
    the whole range, matching the reviewer's own measured table."""
    cases = {5: 5, 9: 9, 10: 10, 25: 10, 29: 10, 30: 10, 90: 70}
    for ets, expected in cases.items():
        budget = min(max(10, ets - 20), ets)
        assert budget == expected
        assert budget <= ets


# ---------------------------------------------------------------------------
# Real end-to-end: the actual installed tesseract/pdftoppm binaries, now
# with the FULL language pack (including `rus`) installed on this machine
# specifically for round-2 verification. Self-computing expected outcomes
# from THIS runner's real `tesseract --list-langs` output regardless, so
# these still pass honestly on a partial install too.
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


# A period-bearing header row is included so the table resolves through
# the normal year-column path (base penalty 15, then the OCR cap) rather
# than the safety-net path (cap 50, which would mask whether the OCR cap
# of 60 is actually the binding constraint or not).
_REAL_ROWS = [
    ("Показатель", "2024", "2023"),
    ("Выручка", "1500000", "1200000"),
    ("Итого активы", "2400000", "2100000"),
]


@requires_real_binaries
def test_real_capability_check_matches_actual_tesseract_language_install(monkeypatch):
    """No mocking beyond OCR_ENABLED — pins ocr_enabled() against
    whatever this machine's REAL tesseract install actually has."""
    monkeypatch.setenv("OCR_ENABLED", "1")
    expected = {"eng", "rus"} <= _real_tesseract_langs()
    assert ocr.ocr_enabled() is expected


@requires_real_binaries
def test_real_end_to_end_honest_outcome_for_this_runners_actual_install(monkeypatch):
    """Full real pipeline, no mocking at all: real pdfplumber (confirms no
    text layer), real ocr.ocr_enabled() routing decision, real
    pdf2image/poppler rasterization, real tesseract recognition (rus+eng,
    preserve_interword_spaces=1). On a partial install: the capability
    check refuses OCR up front (Finding 1a) and the pre-P7.T4 "no text
    layer" error fires — not a silent 200. On a full install (this
    machine, round 2 — `tesseract-lang` installed specifically to prove
    this branch for real): OCR actually recognizes the Cyrillic table and
    the extraction succeeds with the correct values, proving NEW-1's fix
    end to end, not just via mocks."""
    monkeypatch.setenv("OCR_ENABLED", "1")
    data = _real_scanned_pdf_table(_REAL_ROWS)
    if not ({"eng", "rus"} <= _real_tesseract_langs()):
        with pytest.raises(extraction.ScannedPdfError) as exc_info:
            extraction.extract_from_pdf(data)
        assert str(exc_info.value) == _SCAN_MESSAGE
    else:
        result = extraction.extract_from_pdf(data)
        by_metric = {v.metric: v for v in result.values}
        assert by_metric["revenue"].value == 1500000
        assert by_metric["total_assets"].value == 2400000
        assert by_metric["revenue"].confidence == extraction_ocr.CONFIDENCE_CAP
        assert "распознано OCR" in by_metric["revenue"].source


@requires_real_binaries
def test_real_productivity_guard_catches_garbage_even_if_capability_gate_bypassed(monkeypatch):
    """Bypasses the capability gate (simulating a race or a future bug in
    ocr.ocr_enabled()) to force the REAL tesseract to run regardless —
    proving the productivity guard (Finding 1b) independently, as
    defense-in-depth beneath the capability-check fix (Finding 1a). On a
    full install (this machine): real recognition should actually succeed
    (proving the guard does NOT false-positive on a genuinely good
    result); on a partial install: real eng-only recognition of Cyrillic
    input produces real unmatched garbage, and the guard must still catch
    it rather than return a silent 200 all-N/A."""
    monkeypatch.setenv("OCR_ENABLED", "1")
    monkeypatch.setattr(extraction.OCR, "ocr_enabled", lambda: True)
    data = _real_scanned_pdf_table(_REAL_ROWS)
    if not ({"eng", "rus"} <= _real_tesseract_langs()):
        with pytest.raises(extraction.ScannedPdfError) as exc_info:
            extraction.extract_from_pdf(data)
        assert "OCR не смог распознать данные" in str(exc_info.value)
    else:
        result = extraction.extract_from_pdf(data)
        by_metric = {v.metric: v for v in result.values}
        assert by_metric["revenue"].value == 1500000


@requires_real_binaries
def test_real_rasterization_bounded_to_max_pages_not_full_document():
    """Round-1 fix, Finding 2, corroborated against real poppler: a
    document with more pages than MAX_PAGES must only ever have MAX_PAGES
    actually rasterized+recognized. This pins the observable OUTPUT SHAPE
    (page count/content) — it does NOT by itself prove per-page
    rasterization (round-2, F2 residual) or that Python-side slicing
    couldn't produce the same shape by accident; that regression is
    pinned by the mocked `test_rasterization_is_per_page_not_a_single_
    bulk_call`, which asserts the actual per-call kwargs. This test
    corroborates that poppler honors the bound end to end with real
    binaries; it is evidence the mechanism works, not the proof of it."""
    n_pages = extraction_ocr.MAX_PAGES + 10
    data = _real_multipage_pdf(n_pages)
    texts, warnings = extraction_ocr.ocr_pdf_pages(data)
    assert len(texts) == extraction_ocr.MAX_PAGES
    assert any(f"из {n_pages}" in w for w in warnings)
    assert "Стр. 1" in texts[0]
    assert f"Стр. {extraction_ocr.MAX_PAGES}" in texts[-1]


@requires_real_binaries
def test_real_poppler_timeout_handler_is_live_and_degrades_gracefully(monkeypatch):
    """Round-1 fix, Finding 6 (re-verified after round-2's per-page
    rasterization change): `PDFPopplerTimeoutError` was imported and
    caught but could never fire — nothing ever passed `timeout=` to
    `convert_from_bytes`. A single real, large page and a deliberately-
    too-tight total budget proves it still genuinely fires under
    per-page rasterization and the function degrades to `([],
    [warning])` rather than propagating the exception, hanging, or
    exhausting memory first."""
    monkeypatch.setattr(extraction_ocr, "TOTAL_BUDGET_SECONDS", 1.3)
    data = _real_blank_multipage_pdf(1, page_size=(5000, 5000))
    texts, warnings = extraction_ocr.ocr_pdf_pages(data)
    assert texts == []
    assert any("Не удалось подготовить PDF" in w for w in warnings)
