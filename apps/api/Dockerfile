# syntax=docker/dockerfile:1

# ---- builder: resolve the pinned runtime dependency set into a venv ----
FROM python:3.12-slim AS builder

WORKDIR /build

# build-essential + libffi-dev: most transitive deps (cryptography via
# pdfminer-six, pydantic-core, etc.) publish manylinux wheels that need no
# compiler, but this is a safety net for whatever platform actually runs
# the build. It never reaches the runtime stage below.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# requirements.lock only (not requirements.txt — nothing below reads it,
# and copying it in too would needlessly bust this layer's cache on a
# comment-only requirements.txt edit): the fully-pinned, runtime-only lock
# (see README.md "Dependency locking"). pytest/httpx/moto
# (requirements-dev.lock) never enter the image; that's the point of the
# split.
COPY requirements.lock ./
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir -r requirements.lock

# ---- OCR (P7.T4, OPTIONAL, off by default) ----
# pytesseract/pdf2image are deliberately NOT in requirements.lock (see
# app/services/extraction.py's lazy imports and requirements-dev.txt's own
# comment on why) — an operator who wants scanned-PDF OCR uncomments this
# line (pinning versions to match requirements-dev.lock) in addition to the
# runtime-stage apt layer below, then sets OCR_ENABLED=1 in the API env.
# Both layers must be present together — OCR_ENABLED=1 alone is not enough
# (see app/services/ocr.py: env AND both binaries AND the rus+eng
# traineddata, which the runtime-stage tesseract-ocr-rus package below
# provides, are all required).
# RUN /opt/venv/bin/pip install --no-cache-dir pytesseract==0.3.13 pdf2image==1.17.0

# ---- runtime: slim image, non-root, only what's needed to serve ----
FROM python:3.12-slim AS runtime

# Non-root user the app runs as (defense in depth — nothing here needs
# root: no privileged ports, no runtime package installs).
RUN groupadd --system finhealth \
    && useradd --system --gid finhealth --home-dir /app --no-create-home finhealth

# ---- OCR (P7.T4, OPTIONAL, off by default) ----
# tesseract-ocr (+ its rus language pack) and poppler-utils (pdftoppm, via
# the pip pdf2image layer above) are what app/services/ocr.py's
# ocr_enabled() checks for on PATH. Commented out to keep the default image
# lean — uncomment together with the builder-stage pip install above, then
# set OCR_ENABLED=1 in the API env, to turn scanned-PDF OCR on. See
# docs/founder-todo.md's OCR entry for the full checklist.
# RUN apt-get update \
#     && apt-get install -y --no-install-recommends \
#        tesseract-ocr tesseract-ocr-rus poppler-utils \
#     && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Only what app/storage.py's alembic bootstrap and the app itself read at
# runtime — not scripts/ (dev/build-time tooling, e.g. build_benchmarks.py)
# or demo/ (fixtures for scripts/regen_demo.py), which .dockerignore
# excludes from the build context entirely.
COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini ./

# SQLite (default DB_PATH) and the local-disk vault fallback
# (app/services/vault.py's DEFAULT_VAULT_DIR) both write under /app at
# runtime, so ownership must cover the whole tree, not just app/.
RUN chown -R finhealth:finhealth /app
USER finhealth

EXPOSE 8000

# python -c urllib rather than curl: keeps this stage's package surface at
# zero — curl would need its own `apt-get install` layer in the stage that
# actually ships, adding image weight and one more package to patch/scan.
# python is already present and paid for, so this costs nothing extra.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2)" || exit 1

# Exec form (not shell form) is required here, not just style: it makes
# uvicorn PID 1 directly instead of a wrapping `/bin/sh -c`, so SIGTERM
# from `docker stop`/a platform redeploy reaches uvicorn's own signal
# handler instead of being swallowed by a shell that never forwards it.
# That matters beyond graceful HTTP shutdown: app/main.py's extraction pool
# (README.md "Deployment note") runs in spawn-context multiprocessing
# children, and Python's multiprocessing registers its own atexit cleanup
# to reap those children on interpreter exit — which only fires if uvicorn
# actually receives and acts on the signal. No separate init (tini/
# dumb-init) is layered on top of that: ProcessPoolExecutor already reaps
# its own workers via its internal management thread rather than relying
# on PID-1 double-reaping, so an init's only remaining job here would be
# zombie reaping for a process that doesn't orphan zombies in the first
# place.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
