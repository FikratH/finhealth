# FinHealth API (apps/api)

FastAPI backend. See `docs/api-contract-v1.md` (repo root) for the frozen
endpoint contract, and `.env.example` for configuration.

## Development

```bash
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.lock
.venv/bin/python -m pytest tests -q
```

`.python-version` pins `3.12` — match it locally; CI (`.github/workflows/ci.yml`)
runs the same version.

## Dependency locking

`requirements.txt` is the human-edited source of direct dependencies
(loose, unpinned bounds). `requirements.lock` is the fully-pinned,
committed lock resolved from it — CI and `pip install` above both install
from the lock, never straight from `requirements.txt`, so every install is
reproducible instead of "whatever the resolver picks today".

The lock is generated with [uv](https://docs.astral.sh/uv/) (`uv pip
compile`); if `uv` isn't available, [pip-tools](https://pypi.org/project/pip-tools/)'s
`pip-compile` is an equivalent, format-compatible alternative.

**Regenerating the lock** (after changing `requirements.txt`):

```bash
# uv (preferred — install once with: pip install uv)
uv pip compile requirements.txt -o requirements.lock --universal --python-version 3.12

# or, without uv:
pip install pip-tools
pip-compile requirements.txt --output-file requirements.lock
```

`--universal` resolves a single lock valid across platforms (Linux CI,
macOS/Windows dev machines) rather than pinning to whichever OS ran the
compile — that's why the lock carries environment markers (e.g. `;
sys_platform != 'win32'`) on some entries instead of a flat version list.
`--python-version 3.12` matches `.python-version` and the CI pin; bump all
three together if the project's Python version ever changes.

After regenerating, run the full test suite against the new lock before
committing it:

```bash
python3.12 -m venv /tmp/lockcheck && /tmp/lockcheck/bin/pip install -r requirements.lock
/tmp/lockcheck/bin/python -m pytest tests -q
```

Commit `requirements.lock` alongside the `requirements.txt` change in the
same PR.
