"""In-memory per-IP token bucket rate limiter.

Deliberately simple: one dict guarded by a lock, living in this process's
memory. That's enough for the current single-instance deployment; it would
need a shared store (e.g. Redis) to work correctly behind multiple API
instances — not needed yet, so not built.

Off by default (`RATE_LIMIT_PER_MINUTE` unset or `0`), so it never affects
an environment that hasn't opted in, including the test suite: only tests
that explicitly monkeypatch the limit on exercise the 429 path.

Applied via `Depends(rate_limit)` on eight routes: the four that do real
per-request work (upload, extract, analyze, narrative), `/api/waitlist`
(P6.T6 — anonymous-allowed, so it's exactly the shape this limiter exists
for), plus, as of P6.T5, all three `/api/my/documents...` routes (list,
delete, download) — not on cheap GET readers like /api/health or
/api/industries in general.
`GET /api/my/documents` reads that way in isolation (one local query), but
its actual cost is R2Vault's when a document vault backend is configured:
`list_for_user` issues a paginated `list_objects_v2` plus one `get_object`
per retained document, so it's rate-limited for the same reason
upload/extract/analyze are — an unauthenticated-rate flood turns into N
round trips against a metered third-party service, not because it's
expensive locally. `/api/my/analyses...` (a single indexed local query,
no third-party amplification) is deliberately NOT included — see
app/routers/my.py's module docstring and docs/api-contract-v1.md's
Rate limiting section for the same call recorded there.
"""
from __future__ import annotations

import math
import os
import threading
import time

from fastapi import HTTPException, Request

RATE_LIMIT_PER_MINUTE = int(os.environ.get("RATE_LIMIT_PER_MINUTE", "0"))

_lock = threading.Lock()
# client IP -> (tokens remaining, last-refill timestamp in monotonic seconds)
_buckets: dict[str, tuple[float, float]] = {}

# Amortized cleanup, not a sweep on every call (that would make each
# request O(n) in the number of distinct IPs seen recently — the exact
# cost this limiter exists to keep off the hot path). Every _SWEEP_EVERY
# calls to _consume(), drop any bucket untouched for over a minute: after
# that long it would already be back at (or past) full capacity, so
# dropping the entry is behaviorally identical to keeping it — the next
# request from that IP is treated as fresh either way (see the `.get(ip,
# ...)` default below). Bounds `_buckets` to recently-active IPs instead
# of growing for as long as the process lives.
_SWEEP_EVERY = 256
_calls_since_sweep = 0


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _sweep_stale_buckets_locked(now: float) -> None:
    """Evict buckets untouched for over a minute. Caller must hold `_lock`."""
    stale = [ip for ip, (_, last) in _buckets.items() if now - last > 60.0]
    for ip in stale:
        del _buckets[ip]


def _consume(ip: str, limit_per_minute: int, now: float) -> tuple[bool, int]:
    """Token bucket: capacity == limit_per_minute, refilling continuously at
    limit_per_minute tokens per 60s of wall time.

    Returns `(allowed, retry_after_seconds)`. `allowed` is True (and one
    token is consumed) if the caller is currently under the limit.
    `retry_after_seconds` is the ceiling of how many seconds until at
    least one token will be available again — 0 when `allowed` is True."""
    global _calls_since_sweep
    rate_per_second = limit_per_minute / 60.0
    with _lock:
        tokens, last = _buckets.get(ip, (float(limit_per_minute), now))
        tokens = min(float(limit_per_minute), tokens + (now - last) * rate_per_second)
        allowed = tokens >= 1.0
        retry_after = 0
        if allowed:
            tokens -= 1.0
        else:
            retry_after = (math.ceil((1.0 - tokens) / rate_per_second)
                           if rate_per_second > 0 else 60)
        _buckets[ip] = (tokens, now)

        _calls_since_sweep += 1
        if _calls_since_sweep >= _SWEEP_EVERY:
            _calls_since_sweep = 0
            _sweep_stale_buckets_locked(now)

        return allowed, retry_after


def rate_limit(request: Request) -> None:
    """FastAPI dependency. No-op when RATE_LIMIT_PER_MINUTE <= 0 (the
    default). Otherwise raises 429 once the calling IP's bucket is empty,
    using the same {code, message} error envelope as the rest of the API
    (see app/auth.py), plus a Retry-After header."""
    limit = RATE_LIMIT_PER_MINUTE
    if limit <= 0:
        return
    allowed, retry_after = _consume(_client_ip(request), limit, time.monotonic())
    if not allowed:
        raise HTTPException(status_code=429, headers={"Retry-After": str(retry_after)},
                            detail={
                                "code": "rate_limited",
                                "message": "Слишком много запросов. Попробуйте позже.",
                            })
