"""OCR mechanics for scanned PDFs (P7.T4) — rasterization + recognition,
factored out of extraction.py to keep that module under this repo's
500-line file cap (same split rationale as extraction_headers.py, P7.T3
F5). `pytesseract`/`pdf2image` are imported lazily, only inside
`ocr_pdf_pages` — never at module level — so a deployment that never turns
OCR on never needs either package installed (see app/services/ocr.py's
capability gate, which extraction.py checks before ever calling into this
module; this module has no opinion on whether OCR is "enabled" at all).

Dependency direction is one-way: extraction.py imports this module, never
the reverse — `ocr_pdf_pages` never raises `extraction.ScannedPdfError`
(this module doesn't import extraction.py to avoid a circular import); an
unrasterizable file or an unrecognizable page both simply come back as
fewer/emptier page texts, with the reason recorded in the returned
`warnings`. The caller decides what an empty result means — including
whether the recognized text was actually *useful* (round-1 fix, Finding 1:
this module's job stops at "here is what tesseract saw," not "was it
right"; see extraction.py's own productivity guard for the other half).
"""
from __future__ import annotations

import os
import time

MAX_PAGES = 15
PAGE_TIMEOUT_SECONDS = 20
# Round-1 fix (Finding 3): must never exceed EXTRACT_TIMEOUT_SECONDS
# itself, not just the pre-fix `max(10, ETS - 20)` (which inverted for any
# ETS < 30 — an operator who tightened EXTRACT_TIMEOUT_SECONDS below that
# got the pool's own SIGKILL and its generic "too complex" message instead
# of the OCR-specific, headroom-respecting degradation this budget exists
# to produce). The 10s floor stays for the normal range (it's harmless
# there, and avoids a near-zero budget for any ETS in ~10-29s), but the
# outer `min(..., ETS)` now always wins once ETS itself is tiny — if
# EXTRACT_TIMEOUT_SECONDS is tiny, the OCR budget is honestly tiny too,
# not floored past it. Read independently from the same env var
# app/main.py's EXTRACT_TIMEOUT_SECONDS uses (this module cannot import
# main.py without a circular import, and main.py imports extraction.py,
# which imports this module).
_EXTRACT_TIMEOUT_SECONDS = int(os.environ.get("EXTRACT_TIMEOUT_SECONDS", "90"))
TOTAL_BUDGET_SECONDS = min(max(10, _EXTRACT_TIMEOUT_SECONDS - 20), _EXTRACT_TIMEOUT_SECONDS)
CONFIDENCE_CAP = 60.0
WARNING = ("Текст извлечён через оптическое распознавание (OCR) — точность ниже, чем "
          "при извлечении из PDF с текстовым слоем. Сверьте значения со сканом.")


def lines_to_matrix(text: str) -> list[list[str]]:
    """Line-based fallback: "Label ....  1 234  5 678" -> [label, *values]
    (splits on runs of 2+ spaces). extraction.py's own text-layer fallback
    (a real PDF page with no detected tables) and an OCR-recognized page
    both call this exact function — OCR output must run through the SAME
    extraction pipeline as every other source, not a second implementation
    that could silently drift from it."""
    matrix: list[list[str]] = []
    for line in text.splitlines():
        parts = [p for p in line.replace(" ", " ").rsplit("  ") if p.strip()]
        if len(parts) >= 2:
            matrix.append([parts[0].strip(), *[p.strip() for p in parts[1:]]])
    return matrix


def _total_page_count(data: bytes, budget: float) -> int | None:
    """Best-effort page count via poppler's `pdfinfo` (metadata only, not a
    rasterization) — used ONLY to word the "N of M pages" truncation
    warning accurately once rasterization itself is bounded to MAX_PAGES
    upstream (round-1 fix, Finding 2: `convert_from_bytes`'s own returned
    list can no longer be compared against MAX_PAGES to detect truncation,
    since it never returns more than MAX_PAGES images in the first place).
    Returns None on ANY failure — the caller degrades to skipping the
    warning's page count, never to failing the whole OCR attempt over
    something this purely informational."""
    from pdf2image import pdfinfo_from_bytes

    try:
        info = pdfinfo_from_bytes(data, timeout=max(1, int(budget)))
        return int(info["Pages"])
    except Exception:
        return None


def ocr_pdf_pages(data: bytes) -> tuple[list[str], list[str]]:
    """Rasterizes up to MAX_PAGES pages (poppler's `pdftoppm`, via
    `pdf2image`) and runs tesseract (rus+eng, via `pytesseract`) over each
    page image. Returns `(per_page_texts, warnings)` — never raises: a
    single slow/unreadable page degrades to `""` with a warning rather than
    blanking the whole document, and a document-level rasterization
    failure returns `([], [warning])` rather than propagating the
    underlying exception.

    Round-1 fix (Finding 2): `convert_from_bytes` previously rasterized
    EVERY page of the source document into memory before MAX_PAGES ever
    got a chance to slice the result — measured at ~36KB of decoded pixels
    per page, so an ordinary 15MB scan could carry enough pages to exhaust
    a container's memory well before any of this function's own bounds
    had a chance to apply. `first_page=1, last_page=MAX_PAGES` now bounds
    the rasterization call itself (poppler only rasterizes the requested
    range), and the single wall-clock budget below covers rasterization
    AND recognition together, not recognition alone — the `timeout=`
    passed to `convert_from_bytes` is what finally makes the
    already-imported `PDFPopplerTimeoutError` handler reachable (it could
    never fire before, since nothing passed a timeout at all)."""
    import pytesseract
    from pdf2image import convert_from_bytes
    from pdf2image.exceptions import (
        PDFInfoNotInstalledError,
        PDFPageCountError,
        PDFPopplerTimeoutError,
        PDFSyntaxError,
        PopplerNotInstalledError,
    )

    warnings: list[str] = []
    start = time.monotonic()  # covers rasterization time too, not just recognition

    total_pages = _total_page_count(data, TOTAL_BUDGET_SECONDS - (time.monotonic() - start))
    if total_pages is not None and total_pages > MAX_PAGES:
        warnings.append(
            f"OCR ограничен первыми {MAX_PAGES} стр. из {total_pages} "
            "(скан слишком велик для полного распознавания за отведённое время)."
        )

    remaining = TOTAL_BUDGET_SECONDS - (time.monotonic() - start)
    if remaining <= 1:
        warnings.append("OCR остановлен по общему лимиту времени: распознано 0 стр.")
        return [], warnings

    try:
        images = convert_from_bytes(
            data, dpi=200, first_page=1, last_page=MAX_PAGES, timeout=int(remaining))
    except (PDFInfoNotInstalledError, PopplerNotInstalledError, PDFPageCountError,
           PDFSyntaxError, PDFPopplerTimeoutError):
        warnings.append("Не удалось подготовить PDF для OCR-распознавания.")
        return [], warnings

    texts: list[str] = []
    for i, image in enumerate(images, start=1):
        remaining = TOTAL_BUDGET_SECONDS - (time.monotonic() - start)
        if remaining <= 1:
            warnings.append(
                f"OCR остановлен по общему лимиту времени: распознано {i - 1} "
                f"из {len(images)} стр."
            )
            break
        try:
            text = pytesseract.image_to_string(
                image, lang="rus+eng", timeout=min(PAGE_TIMEOUT_SECONDS, remaining))
        except (RuntimeError, OSError):
            # RuntimeError: pytesseract's own per-call timeout (or a
            # TesseractError — a RuntimeError subclass — from a bad exit
            # code). OSError: TesseractNotFoundError, the binary vanishing
            # between ocr.ocr_enabled()'s check and this call — a real but
            # narrow race, not something to crash the whole extraction over.
            warnings.append(f"Не удалось распознать стр. {i}: ошибка OCR.")
            text = ""
        texts.append(text)
    return texts, warnings
