"""Extraction process pool: kill-on-timeout (Task 6a).

Normal extraction going through the pool is already exercised by every
test in test_api.py / test_upload.py that hits POST /api/extract (the pool
is a drop-in replacement for the old thread pool). The regression that
matters here is specific to the process-pool swap: a hung worker must be
killed, not leaked, and the pool must still serve the *next* request
afterwards — under the old ThreadPoolExecutor pattern a timed-out future
permanently leaked one worker thread.
"""
import concurrent.futures
import threading
import time
from pathlib import Path

import pytest
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


@pytest.fixture
def _leave_a_working_pool_behind():
    """The tests below deliberately kill workers and swap `main._extract_pool`
    — sometimes leaving the pool a test started with already `.kill()`-ed
    and `.shutdown()`-ed. Whatever state a test leaves things in, always
    construct a fresh, healthy pool for it to hand off to the next test
    (and the rest of the suite). Restoring the *original* pool object via
    monkeypatch would be wrong here: by the end of these tests that
    original pool has already been shut down, and a later test doing a
    real extraction against a shutdown pool gets a bare RuntimeError."""
    yield
    main._extract_pool = concurrent.futures.ProcessPoolExecutor(
        max_workers=main.EXTRACT_POOL_WORKERS, mp_context=main._MP_CONTEXT)


def test_timeout_kills_worker_and_pool_recovers_capacity(monkeypatch, _leave_a_working_pool_behind):
    """Exhausts the pool's *entire* worker capacity — EXTRACT_POOL_WORKERS
    concurrent hangs, not just one — before checking recovery. A single
    hang wouldn't discriminate: with 2 workers, one stuck worker still
    leaves a second, untouched one free, so a follow-up request would
    succeed via that spare capacity even under the old thread-leak
    pattern (which never killed or recreated anything). Occupying every
    worker at once means the follow-up can only succeed if the stuck
    workers were actually killed and the pool actually recreated."""
    monkeypatch.setattr(main, "EXTRACT_TIMEOUT_SECONDS", 2)
    original_extract = extraction.extract
    monkeypatch.setattr(extraction, "extract", _hang_forever)

    pool_before = main._extract_pool
    n_workers = main.EXTRACT_POOL_WORKERS
    upload_ids = [_upload_demo() for _ in range(n_workers)]

    results: list = [None] * n_workers

    def _call(i: int) -> None:
        results[i] = client.post("/api/extract", json={"upload_id": upload_ids[i]})

    threads = [threading.Thread(target=_call, args=(i,)) for i in range(n_workers)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    assert all(r is not None for r in results), "a request thread never completed"
    assert [r.status_code for r in results] == [422] * n_workers

    # The core claim: the pool was actually swapped, not just "happened to
    # have room." If this were False, the follow-up request below passing
    # would prove nothing (see docstring).
    assert main._extract_pool is not pool_before

    monkeypatch.setattr(extraction, "extract", original_extract)
    upload_id_followup = _upload_demo()
    resp = client.post("/api/extract", json={"upload_id": upload_id_followup})
    assert resp.status_code == 200, resp.text
    assert resp.json()["values"]


def test_recreate_extract_pool_is_idempotent_per_broken_pool(_leave_a_working_pool_behind):
    """Two requests can time out concurrently against the same broken pool;
    `_pool_lock` must ensure only the first actually kills workers and
    swaps in a replacement — the second, still holding a reference to the
    now-stale pool, is a no-op. Exercised directly (rather than via two
    real concurrent HTTP calls) for a deterministic, non-flaky check of the
    identity guard itself."""
    pool = main._extract_pool

    main._recreate_extract_pool(pool)
    recreated = main._extract_pool
    assert recreated is not pool

    main._recreate_extract_pool(pool)  # second "concurrent" caller, stale reference
    assert main._extract_pool is recreated  # unchanged: no-op, not a second recreate
