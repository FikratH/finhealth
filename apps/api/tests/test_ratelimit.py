"""Token-bucket rate limiter (Task 6b): off by default, 429 with the
standard {code, message} error envelope once a per-IP bucket is exhausted.
"""
import time

import pytest
from fastapi.testclient import TestClient

from app import ratelimit
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _reset_buckets(monkeypatch):
    # Fresh bucket state per test. TestClient always presents as the same
    # "testclient" host, so without this, state would leak between tests.
    monkeypatch.setattr(ratelimit, "_buckets", {})
    yield


def _upload(data: bytes = b"Show;2024\nA;1\n"):
    return client.post("/api/upload", files={"file": ("r.csv", data, "text/csv")})


def test_disabled_by_default_allows_many_requests():
    assert ratelimit.RATE_LIMIT_PER_MINUTE == 0
    for _ in range(5):
        assert _upload().status_code == 200


def test_limit_enforced_returns_429_with_standard_envelope(monkeypatch):
    monkeypatch.setattr(ratelimit, "RATE_LIMIT_PER_MINUTE", 2)
    assert _upload().status_code == 200
    assert _upload().status_code == 200
    resp = _upload()
    assert resp.status_code == 429
    assert resp.json()["detail"] == {
        "code": "rate_limited",
        "message": "Слишком много запросов. Попробуйте позже.",
    }


def test_bucket_refills_over_time(monkeypatch):
    monkeypatch.setattr(ratelimit, "RATE_LIMIT_PER_MINUTE", 1)
    assert _upload().status_code == 200
    assert _upload().status_code == 429
    # Simulate 60s having passed since the last refill, rather than
    # sleeping in the test: back-date the bucket's last-refill timestamp.
    ip = "testclient"
    tokens, _ = ratelimit._buckets[ip]
    ratelimit._buckets[ip] = (tokens, time.monotonic() - 60)
    assert _upload().status_code == 200


def test_different_ips_have_independent_buckets():
    # Unit-level: TestClient always reports the same client IP, so IP
    # isolation is exercised directly against the bucket function instead.
    now = time.monotonic()
    assert ratelimit._consume("1.1.1.1", 1, now) is True
    assert ratelimit._consume("1.1.1.1", 1, now) is False
    assert ratelimit._consume("2.2.2.2", 1, now) is True


def test_rate_limit_wired_on_all_four_endpoints():
    """Guards against a future refactor silently dropping the dependency
    from one of the four named endpoints (upload, extract, analyze,
    narrative) — introspects FastAPI's route table rather than round-
    tripping each endpoint, since analyze/narrative need a full valid
    payload to reach that far."""
    target_paths = {
        "/api/upload", "/api/extract", "/api/analyze",
        "/api/analysis/{analysis_id}/narrative",
    }
    wired = set()
    for route in app.routes:
        path = getattr(route, "path", None)
        if path not in target_paths:
            continue
        dependant = getattr(route, "dependant", None)
        calls = {dep.call for dep in dependant.dependencies} if dependant else set()
        if ratelimit.rate_limit in calls:
            wired.add(path)
    assert wired == target_paths


def test_extract_shares_the_same_bucket_as_upload(monkeypatch):
    """The limiter is per-IP, not per-endpoint: exhausting the bucket on
    upload must also block a same-IP extract call right after."""
    monkeypatch.setattr(ratelimit, "RATE_LIMIT_PER_MINUTE", 1)

    up = _upload()
    assert up.status_code == 200
    upload_id = up.json()["upload_id"]

    # The upload above already consumed this IP's only token this minute.
    resp = client.post("/api/extract", json={"upload_id": upload_id})
    assert resp.status_code == 429
    assert resp.json()["detail"]["code"] == "rate_limited"
