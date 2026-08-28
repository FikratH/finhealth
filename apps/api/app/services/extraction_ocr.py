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


# Round-2 fix, NEW-1: tesseract's DEFAULT mode collapses inter-column
# whitespace to a single space — a real, perfectly-recognized statement
# line comes back as e.g. "Revenue 1500000 1200000", and lines_to_matrix
# (which requires 2+ spaces to split columns at all) parses ZERO rows from
# it. `preserve_interword_spaces=1` keeps the real gaps between columns
# (measured: the same page goes from 0 rows to the correct 2). Without
# this, the OCR path could recognize a page perfectly and still extract
# nothing — round-1's productivity guard is what surfaced this (it was
# equally broken in round 0, just hidden behind the missing-language bug).
_TESSERACT_CONFIG = "-c preserve_interword_spaces=1"


def ocr_pdf_pages(data: bytes) -> tuple[list[str], list[str]]:
    """Rasterizes up to MAX_PAGES pages ONE AT A TIME (poppler's
    `pdftoppm`, via `pdf2image`) and runs tesseract (rus+eng, via
    `pytesseract`) over each page image. Returns `(per_page_texts,
    warnings)` — never raises: a single slow/unreadable page degrades to
    `""` with a warning rather than blanking the whole document, and a
    rasterization failure on the very first page returns `([], [warning])`
    the same way a whole-document failure always has.

    Round-1 fix (Finding 2) bounded rasterization to MAX_PAGES via
    `first_page`/`last_page`, but still rasterized all of them into memory
    in ONE `convert_from_bytes` call — round-2 residual fix (F2 residual):
    on a small/constrained container (Railway's default is 512MB) even 15
    pages at once can exceed available memory. Rasterizing `first_page=i,
    last_page=i` inside the loop keeps peak memory at ONE decoded page,
    the same wall-clock budget still covers rasterization AND recognition
    together (both count against `start`), and the `timeout=` passed to
    each per-page `convert_from_bytes` call is what keeps the
    `PDFPopplerTimeoutError` handler reachable."""
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
    page_count = min(total_pages, MAX_PAGES) if total_pages is not None else MAX_PAGES
    if total_pages is not None and total_pages > MAX_PAGES:
        warnings.append(
            f"OCR ограничен первыми {MAX_PAGES} стр. из {total_pages} "
            "(скан слишком велик для полного распознавания за отведённое время)."
        )

    texts: list[str] = []
    for i in range(1, page_count + 1):
        remaining = TOTAL_BUDGET_SECONDS - (time.monotonic() - start)
        if remaining <= 1:
            warnings.append(
                f"OCR остановлен по общему лимиту времени: распознано {len(texts)} "
                f"из {page_count} стр."
            )
            break
        try:
            page_images = convert_from_bytes(
                data, dpi=200, first_page=i, last_page=i, timeout=int(remaining))
        except (PDFInfoNotInstalledError, PopplerNotInstalledError, PDFPageCountError,
               PDFSyntaxError, PDFPopplerTimeoutError):
            if not texts:
                warnings.append("Не удалось подготовить PDF для OCR-распознавания.")
            else:
                warnings.append(
                    f"OCR остановлен: не удалось растеризовать стр. {i} "
                    f"(распознано {len(texts)} стр.)."
                )
            break
        if not page_images:
            break  # past the real last page (total_pages was unknown/stale)

        remaining = TOTAL_BUDGET_SECONDS - (time.monotonic() - start)
        if remaining <= 1:
            warnings.append(
                f"OCR остановлен по общему лимиту времени: распознано {len(texts)} "
                f"из {page_count} стр."
            )
            break
        try:
            text = pytesseract.image_to_string(
                page_images[0], lang="rus+eng", config=_TESSERACT_CONFIG,
                timeout=min(PAGE_TIMEOUT_SECONDS, remaining))
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
