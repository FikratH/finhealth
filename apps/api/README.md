# FinHealth API (apps/api)

FastAPI backend. See `docs/api-contract-v1.md` (repo root) for the frozen
endpoint contract, and `.env.example` for configuration.

## Development

```bash
python3.12 -m venv .venv
.venv/bin/pip install -r requirements-dev.lock
.venv/bin/python -m pytest tests -q
```

`.python-version` pins `3.12` — match it locally; CI (`.github/workflows/ci.yml`)
runs the same version.

## Dependency locking

`requirements.txt` is the human-edited source of direct **runtime**
dependencies (loose, unpinned bounds) — this is what ships in the Docker
image (`Dockerfile`). `requirements-dev.txt` layers test-only deps
(`pytest`, `httpx`, `moto[s3]`) on top via `-r requirements.txt`; it's
never installed in the image, only in dev/CI. Each has a fully-pinned,
committed lock resolved from it — `requirements.lock` and
`requirements-dev.lock`. The Docker build and any "what actually ships"
question use `requirements.lock` only; dev setup and CI's test job use
`requirements-dev.lock` (which is a superset — installing it alone is
enough to both run and test the app). Nothing installs straight from the
loose `requirements*.txt` files, so every install is reproducible instead
of "whatever the resolver picks today".

The locks are generated with [uv](https://docs.astral.sh/uv/) (`uv pip
compile`); if `uv` isn't available, [pip-tools](https://pypi.org/project/pip-tools/)'s
`pip-compile` is an equivalent, format-compatible alternative.

**Regenerating the locks** (after changing `requirements.txt` and/or
`requirements-dev.txt` — regenerate both together, since
`requirements-dev.txt` includes `requirements.txt`):

```bash
# uv (preferred — install once with: pip install uv)
uv pip compile requirements.txt -o requirements.lock --universal --python-version 3.12
uv pip compile requirements-dev.txt -o requirements-dev.lock --universal --python-version 3.12

# or, without uv:
pip install pip-tools
pip-compile requirements.txt --output-file requirements.lock
pip-compile requirements-dev.txt --output-file requirements-dev.lock
```

`--universal` resolves a single lock valid across platforms (Linux CI,
macOS/Windows dev machines) rather than pinning to whichever OS ran the
compile — that's why the lock carries environment markers (e.g. `;
sys_platform != 'win32'`) on some entries instead of a flat version list.
`--python-version 3.12` matches `.python-version` and the CI pin; bump all
three together if the project's Python version ever changes.

After regenerating, run the full test suite against the new dev lock
before committing it:

```bash
python3.12 -m venv /tmp/lockcheck && /tmp/lockcheck/bin/pip install -r requirements-dev.lock
/tmp/lockcheck/bin/python -m pytest tests -q
```

It's also worth a quick sanity check that the runtime-only lock stays free
of test deps (this is what makes it into the Docker image):

```bash
python3.12 -m venv /tmp/lockcheck-runtime && /tmp/lockcheck-runtime/bin/pip install -r requirements.lock
/tmp/lockcheck-runtime/bin/python -c "import pytest" # expect ModuleNotFoundError
```

Commit both `requirements.lock` and `requirements-dev.lock` alongside the
`requirements*.txt` change in the same PR.

## Deployment note

Extraction runs in a spawn-context process pool: the parent process must be import-safe (guarded `__main__`). `uvicorn` and `pytest` entrypoints are fine; embedding the app in an unguarded script or REPL will break extraction with `BrokenProcessPool`.
