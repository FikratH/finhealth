"""Extraction process pool: kill-on-timeout (Task 6a).

Normal extraction going through the pool is already exercised by every
test in test_api.py / test_upload.py that hits POST /api/extract (the pool
is a drop-in replacement for the old thread pool). The regression that
matters here is specific to the process-pool swap: a hung worker must be
killed, not leaked, and the pool must still serve the *next* request
afterwards — under the old ThreadPoolExecutor pattern a timed-out future
permanently leaked one worker thread.
"""
import time
from pathlib import Path

from fastapi.testclient import TestClient

from app import main
from app.services import extraction

client = TestClient(app=main.app)
DEMO = Path(__file__).resolve().parent.parent / "demo" / "demo_company.csv"


def _hang_forever(data: bytes, kind: str):
    """Module-level (picklable) stand-in for extraction.extract that never
    returns within any sane timeout. Runs in a spawned worker process, so it
    cannot share state with the test process — it only needs to hang."""
    time.sleep(3600)


def _upload_demo() -> str:
    with open(DEMO, "rb") as f:
        up = client.post("/api/upload", files={"file": ("demo_company.csv", f, "text/csv")})
    assert up.status_code == 200, up.text
    return up.json()["upload_id"]


def test_timeout_kills_worker_and_pool_still_serves_next_request(monkeypatch):
    # Restore whatever pool is live right now once the test ends, regardless
    # of how many times the timeout path below swaps `main._extract_pool` —
    # keeps this test from leaking a replacement pool into the rest of the
    # session.
    monkeypatch.setattr(main, "_extract_pool", main._extract_pool)
    monkeypatch.setattr(main, "EXTRACT_TIMEOUT_SECONDS", 2)
    original_extract = extraction.extract

    upload_id = _upload_demo()
    monkeypatch.setattr(extraction, "extract", _hang_forever)
    t0 = time.monotonic()
    resp = client.post("/api/extract", json={"upload_id": upload_id})
    elapsed = time.monotonic() - t0
    assert resp.status_code == 422, resp.text
    # Bounded by the timeout, not by _hang_forever's 3600s sleep — proves we
    # didn't wait for the runaway worker, and gives headroom for spawn
    # overhead on a slow CI runner without masking a real hang.
    assert elapsed < 30, f"extract took {elapsed:.1f}s — worker was not killed promptly"

    # The pool must not be left broken/exhausted: restore the real
    # extractor and confirm a normal request right after the timeout still
    # succeeds, served by a freshly recreated pool.
    monkeypatch.setattr(extraction, "extract", original_extract)
    upload_id2 = _upload_demo()
    resp2 = client.post("/api/extract", json={"upload_id": upload_id2})
    assert resp2.status_code == 200, resp2.text
    assert resp2.json()["values"]


def test_recreate_extract_pool_is_idempotent_per_broken_pool(monkeypatch):
    """Two requests can time out concurrently against the same broken pool;
    `_pool_lock` must ensure only the first actually kills workers and
    swaps in a replacement — the second, still holding a reference to the
    now-stale pool, is a no-op. Exercised directly (rather than via two
    real concurrent HTTP calls) for a deterministic, non-flaky check of the
    identity guard itself."""
    monkeypatch.setattr(main, "_extract_pool", main._extract_pool)
    pool = main._extract_pool

    main._recreate_extract_pool(pool)
    recreated = main._extract_pool
    assert recreated is not pool

    main._recreate_extract_pool(pool)  # second "concurrent" caller, stale reference
    assert main._extract_pool is recreated  # unchanged: no-op, not a second recreate
