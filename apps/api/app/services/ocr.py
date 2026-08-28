"""OCR capability gating for scanned PDFs (P7.T4).

OCR is offered only when ALL of these hold: the operator turned it on
(env `OCR_ENABLED=1`), the two CLI binaries it shells out to — `tesseract`
(recognition) and `pdftoppm` (poppler, PDF→image rasterization via the
`pdf2image` package) — are actually present on PATH, AND `tesseract` has
the language data this product needs (`rus`+`eng`) actually installed.

That last check (round-1 fix, Finding 1) matters on its own: `tesseract-
ocr` and `tesseract-ocr-rus` are separate apt packages, and a partial
install (binary present, `rus.traineddata` absent) does NOT fail loud —
tesseract asked for `-l rus+eng` with `rus` missing prints a warning to
stderr and exits 0, silently recognizing with `eng` only. For an RU-first
product that means every Cyrillic label comes back as Latin lookalikes
("Bbipyuka" for "Выручка") that match nothing — worse than OCR being off
at all (see extraction.py's own productivity guard, added in the same
fix, for the other half of this: even with a full install, this module
alone can't catch a genuinely bad recognition — only "the install is
usable at all"). An operator can also set `OCR_ENABLED=1` before
installing the (optional, apt-layer) binaries; this module must report
`False` in that case too rather than letting a scanned PDF route into a
guaranteed-crash or guaranteed-garbage OCR attempt (see extraction.py's
`extract_from_pdf`).

The `pytesseract`/`pdf2image` Python packages are NOT imported here, and
not required by the default runtime install — they are imported lazily,
only inside the extraction worker function that actually runs OCR, so a
deployment that never turns OCR on never needs them on disk. The language
check below shells out to the `tesseract` CLI directly instead (`tesseract
--list-langs`), which needs neither package. See requirements-dev.txt (pip
packages, for tests) and the Dockerfile / docs/founder-todo.md (the apt
packages + `pip install` needed to actually run OCR in production) for the
full install story.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import threading

REQUIRED_BINARIES = ("tesseract", "pdftoppm")
REQUIRED_LANGS = ("eng", "rus")

# Binary/language presence is a filesystem PATH search plus one `tesseract
# --list-langs` subprocess call — cheap but not free, and stable for the
# lifetime of the process (a redeploy is the only way the installed
# binaries/language data change), so it is resolved once, lazily, on first
# call rather than at import time (a bare `import app.services.ocr` must
# not touch the filesystem or spawn a process) or repeated on every
# `/api/health` poll. `OCR_ENABLED` itself is deliberately NOT cached here
# — read fresh on every call, mirroring `vault.vault_enabled()` — so a
# test's `monkeypatch.setenv`/`delenv` takes effect immediately without
# needing to also reset a cache.
_capability_present: bool | None = None
_capability_lock = threading.Lock()


def _env_bool(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes", "on")


def _tesseract_langs(tesseract_path: str) -> set[str]:
    """Language codes tesseract reports as actually installed, via
    `tesseract --list-langs` — the only reliable way to ask (tessdata's
    location is configurable via `TESSDATA_PREFIX`, so guessing a fixed
    filesystem path for `rus.traineddata` would be fragile). Returns an
    empty set on ANY failure (the binary vanishing, a non-zero exit, a
    hang, unparseable output) — callers treat "unknown" the same as "not
    installed," never crash the capability check over it."""
    try:
        proc = subprocess.run(
            [tesseract_path, "--list-langs"], capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        return set()
    # tesseract prints one header line ("List of available languages ...")
    # then one language code per remaining line (5.x); tolerate trailing
    # blank lines either way.
    return {line.strip() for line in proc.stdout.splitlines()[1:] if line.strip()}


def _check_capability() -> bool:
    global _capability_present
    if _capability_present is not None:
        return _capability_present
    with _capability_lock:
        if _capability_present is not None:
            return _capability_present
        paths = {b: shutil.which(b) for b in REQUIRED_BINARIES}
        binaries_ok = all(paths.values())
        langs_ok = binaries_ok and set(REQUIRED_LANGS) <= _tesseract_langs(paths["tesseract"])
        _capability_present = binaries_ok and langs_ok
        return _capability_present


def reset_binary_cache() -> None:
    """Test-only escape hatch: clears the memoized capability result so a
    test can monkeypatch `shutil.which`/`_tesseract_langs` and see it take
    effect without depending on process/import order. Not called anywhere
    in application code."""
    global _capability_present
    with _capability_lock:
        _capability_present = None


def ocr_enabled() -> bool:
    """Whether OCR is actually usable right now. Read by `GET /api/health`
    (reported as `ocr_enabled`, additive) and by `extraction.py`'s
    scanned-PDF routing — both call sites must agree, so this is the
    single source of truth for both."""
    if not _env_bool("OCR_ENABLED"):
        return False
    return _check_capability()
