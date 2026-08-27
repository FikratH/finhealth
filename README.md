# Tonus AI (working title; repo: finhealth)

Financial-health diagnostics: upload a financial statement, verify the
extracted numbers, receive an auditable 0–100 diagnosis with industry
benchmarks and prioritized recommendations.

- `apps/api` — FastAPI analysis engine (deterministic; no LLM in the numbers)
- `apps/web` — Next.js 15 frontend (Phase 3)
- `docs/spec` — product spec · `docs/roadmap.md` — phases · `docs/audit` — backend audit

## Develop

API: `cd apps/api && python3.12 -m venv .venv && .venv/bin/pip install -r requirements-dev.lock && .venv/bin/uvicorn app.main:app --reload --port 8000`
(see `apps/api/README.md` for the dependency-locking workflow — `requirements-dev.lock` is the dev/CI superset installed above so the same venv can also run the tests below; `requirements.lock` is the runtime-only lock that actually ships in `apps/api/Dockerfile`; both are generated from their matching loose `requirements*.txt` source)
Tests: `cd apps/api && .venv/bin/python -m pytest tests -q`
