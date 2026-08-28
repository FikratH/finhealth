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
`warnings`. The caller decides what an empty result means.
"""
from __future__ import annotations

import os
import time

MAX_PAGES = 15
PAGE_TIMEOUT_SECONDS = 20
# Leaves headroom under the ProcessPoolExecutor's own outer kill-on-timeout
# (app/main.py's EXTRACT_TIMEOUT_SECONDS, read independently here — this
# module cannot import main.py without a circular import, and main.py
# imports extraction.py, which imports this module) for the initial
# pdfplumber pass, the rest of the pipeline, and pool scheduling overhead.
# A slow OCR must degrade to a clear, worker-raised error (see
# extraction.py's extract_from_pdf) well before the pool reaches for
# SIGKILL, which would surface as an opaque "extraction timed out" 422 with
# no OCR-specific detail.
TOTAL_BUDGET_SECONDS = max(10, int(os.environ.get("EXTRACT_TIMEOUT_SECONDS", "90")) - 20)
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
        parts = [p for p in line.replace("\u00a0", " ").rsplit("  ") if p.strip()]
        if len(parts) >= 2:
            matrix.append([parts[0].strip(), *[p.strip() for p in parts[1:]]])
    return matrix


def ocr_pdf_pages(data: bytes) -> tuple[list[str], list[str]]:
    """Rasterizes each page (poppler's `pdftoppm`, via `pdf2image`) and
    runs tesseract (rus+eng, via `pytesseract`) over each page image.
    Bounded by MAX_PAGES / PAGE_TIMEOUT_SECONDS / TOTAL_BUDGET_SECONDS so a
    hostile or merely huge scanned PDF degrades to a clear warning instead
    of silently running past the pool's own kill-on-timeout. Returns
    `(per_page_texts, warnings)` — never raises: a single slow/unreadable
    page degrades to `""` with a warning rather than blanking the whole
    document, and a document-level rasterization failure returns `([],
    [warning])` rather than propagating the underlying exception."""
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
    try:
        images = convert_from_bytes(data, dpi=200)
    except (PDFInfoNotInstalledError, PopplerNotInstalledError, PDFPageCountError,
           PDFSyntaxError, PDFPopplerTimeoutError):
        warnings.append("Не удалось подготовить PDF для OCR-распознавания.")
        return [], warnings

    if len(images) > MAX_PAGES:
        warnings.append(
            f"OCR ограничен первыми {MAX_PAGES} стр. из {len(images)} "
            "(скан слишком велик для полного распознавания за отведённое время)."
        )
        images = images[:MAX_PAGES]

    texts: list[str] = []
    start = time.monotonic()
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
