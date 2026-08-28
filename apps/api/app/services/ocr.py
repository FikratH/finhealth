"""OCR capability gating for scanned PDFs (P7.T4).

OCR is offered only when BOTH conditions hold: the operator turned it on
(env `OCR_ENABLED=1`) AND the two CLI binaries it shells out to —
`tesseract` (recognition) and `pdftoppm` (poppler, PDF→image rasterization
via the `pdf2image` package) — are actually present on PATH. An operator
can set `OCR_ENABLED=1` before installing the (optional, apt-layer)
binaries; this module must report `False` in that case rather than letting
a scanned PDF route into a guaranteed-crash OCR attempt (see
`extraction.py`'s `extract_from_pdf`).

The Python packages themselves (`pytesseract`, `pdf2image`) are NOT
imported here, and not required by the default runtime install — they are
imported lazily, only inside the extraction worker function that actually
runs OCR, so a deployment that never turns OCR on never needs them on disk.
See requirements-dev.txt (pip packages, for tests) and the Dockerfile /
docs/founder-todo.md (the apt packages + `pip install` needed to actually
run OCR in production) for the full install story.
"""
from __future__ import annotations

import os
import shutil
import threading

REQUIRED_BINARIES = ("tesseract", "pdftoppm")

# Binary presence (`shutil.which`) is a filesystem PATH search — cheap but
# not free, and stable for the lifetime of the process (a redeploy is the
# only way the installed binaries change), so it is resolved once, lazily,
# on first call rather than at import time (a bare `import
# app.services.ocr` must not touch the filesystem) or repeated on every
# `/api/health` poll. `OCR_ENABLED` itself is deliberately NOT cached here —
# read fresh on every call, mirroring `vault.vault_enabled()` — so a test's
# `monkeypatch.setenv`/`delenv` takes effect immediately without needing to
# also reset a cache.
_binaries_present: bool | None = None
_binaries_lock = threading.Lock()


def _env_bool(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes", "on")


def _check_binaries() -> bool:
    global _binaries_present
    if _binaries_present is not None:
        return _binaries_present
    with _binaries_lock:
        if _binaries_present is not None:
            return _binaries_present
        _binaries_present = all(shutil.which(b) for b in REQUIRED_BINARIES)
        return _binaries_present


def reset_binary_cache() -> None:
    """Test-only escape hatch: clears the memoized `shutil.which` result so
    a test can monkeypatch `shutil.which`/PATH and see it take effect
    without depending on process/import order. Not called anywhere in
    application code."""
    global _binaries_present
    with _binaries_lock:
        _binaries_present = None


def ocr_enabled() -> bool:
    """Whether OCR is actually usable right now. Read by `GET /api/health`
    (reported as `ocr_enabled`, additive) and by
    `extraction.py`'s scanned-PDF routing — both call sites must agree, so
    this is the single source of truth for both."""
    if not _env_bool("OCR_ENABLED"):
        return False
    return _check_binaries()
