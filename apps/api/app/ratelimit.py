"""In-memory per-IP token bucket rate limiter.

Deliberately simple: one dict guarded by a lock, living in this process's
memory. That's enough for the current single-instance deployment; it would
need a shared store (e.g. Redis) to work correctly behind multiple API
instances — not needed yet, so not built.

Off by default (`RATE_LIMIT_PER_MINUTE` unset or `0`), so it never affects
an environment that hasn't opted in, including the test suite: only tests
that explicitly monkeypatch the limit on exercise the 429 path.

Applied via `Depends(rate_limit)` on the four endpoints that do real
per-request work — upload, extract, analyze, narrative — not on cheap GET
readers like /api/health or /api/industries.
"""
from __future__ import annotations

import os
import threading
import time

from fastapi import HTTPException, Request

RATE_LIMIT_PER_MINUTE = int(os.environ.get("RATE_LIMIT_PER_MINUTE", "0"))

_lock = threading.Lock()
# client IP -> (tokens remaining, last-refill timestamp in monotonic seconds)
_buckets: dict[str, tuple[float, float]] = {}


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _consume(ip: str, limit_per_minute: int, now: float) -> bool:
    """Token bucket: capacity == limit_per_minute, refilling continuously at
    limit_per_minute tokens per 60s of wall time. Returns True (and consumes
    one token) if the caller is currently under the limit."""
    rate_per_second = limit_per_minute / 60.0
    with _lock:
        tokens, last = _buckets.get(ip, (float(limit_per_minute), now))
        tokens = min(float(limit_per_minute), tokens + (now - last) * rate_per_second)
        if tokens < 1.0:
            _buckets[ip] = (tokens, now)
            return False
        _buckets[ip] = (tokens - 1.0, now)
        return True


def rate_limit(request: Request) -> None:
    """FastAPI dependency. No-op when RATE_LIMIT_PER_MINUTE <= 0 (the
    default). Otherwise raises 429 once the calling IP's bucket is empty,
    using the same {code, message} error envelope as the rest of the API
    (see app/auth.py)."""
    limit = RATE_LIMIT_PER_MINUTE
    if limit <= 0:
        return
    if not _consume(_client_ip(request), limit, time.monotonic()):
        raise HTTPException(status_code=429, detail={
            "code": "rate_limited",
            "message": "Слишком много запросов. Попробуйте позже.",
        })
