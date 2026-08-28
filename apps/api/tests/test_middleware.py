"""app/middleware.py — RequestIDMiddleware (P7.T2): id generated when
absent, propagated/echoed when the caller sends one, one summary line per
request, elevated to WARNING past the slow-request threshold, and
contextvar isolation across concurrent requests (the actual reason this
lives on a contextvar rather than, say, a module-level global)."""
from __future__ import annotations

import asyncio
import logging
import re
import uuid

from fastapi.testclient import TestClient

from app import middleware
from app.main import app
from app.middleware import REQUEST_ID_HEADER, RequestIDMiddleware
from app.request_context import get_request_id

client = TestClient(app)

_HEX32 = re.compile(r"^[0-9a-f]{32}$")


def test_generates_a_request_id_when_none_is_sent():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    request_id = resp.headers.get("x-request-id")
    assert request_id is not None
    # uuid4().hex — 32 lowercase hex chars, no dashes.
    assert _HEX32.match(request_id), request_id
    # Genuinely random, not a fixed/reused value.
    assert uuid.UUID(hex=request_id).version == 4


def test_propagates_and_echoes_a_caller_supplied_request_id():
    resp = client.get("/api/health", headers={"X-Request-ID": "caller-supplied-id"})
    assert resp.status_code == 200
    assert resp.headers["x-request-id"] == "caller-supplied-id"


def test_blank_incoming_request_id_is_treated_as_absent():
    """A proxy that sends an empty/whitespace header must not result in
    every log line for this request being stamped with "" — that's
    strictly less traceable than just generating a real id."""
    resp = client.get("/api/health", headers={"X-Request-ID": "   "})
    assert resp.status_code == 200
    request_id = resp.headers["x-request-id"]
    assert request_id.strip() == request_id and request_id != ""
    assert _HEX32.match(request_id)


def test_id_is_stamped_onto_a_log_line_from_an_existing_call_site(caplog):
    """No app log call site was rewritten for this feature — the id
    reaches app/main.py's pre-existing `log.info("upload accepted ...")`
    purely through the contextvar + root-logger filter."""
    with caplog.at_level(logging.INFO):
        resp = client.post(
            "/api/upload",
            files={"file": ("r.csv", b"Show;2024\nA;1\n", "text/csv")},
            headers={"X-Request-ID": "trace-me"},
        )
    assert resp.status_code == 200
    upload_record = next(r for r in caplog.records if r.name == "finhealth"
                         and "upload accepted" in r.getMessage())
    assert upload_record.request_id == "trace-me"


def test_request_summary_line_carries_the_documented_fields(caplog):
    with caplog.at_level(logging.INFO, logger="finhealth.request"):
        resp = client.get("/api/health", headers={"X-Request-ID": "summary-line-id"})
    assert resp.status_code == 200
    record = next(r for r in caplog.records if r.name == "finhealth.request")
    assert record.levelno == logging.INFO
    assert record.request_id == "summary-line-id"
    assert record.method == "GET"
    assert record.path == "/api/health"
    assert record.status == 200
    assert isinstance(record.duration_ms, float)
    assert record.duration_ms >= 0


def test_slow_request_logs_at_warning(monkeypatch, caplog):
    """Simulates elapsed time rather than sleeping >5s in a test: the
    middleware's own `monotonic` reference (bound at import, not the
    shared `time` module) is monkeypatched for the duration of this one
    request only."""
    ticks = iter([100.0, 106.0])  # 6s elapsed > SLOW_REQUEST_MS
    monkeypatch.setattr(middleware, "monotonic", lambda: next(ticks))
    with caplog.at_level(logging.INFO, logger="finhealth.request"):
        resp = client.get("/api/health")
    assert resp.status_code == 200
    record = next(r for r in caplog.records if r.name == "finhealth.request")
    assert record.levelno == logging.WARNING
    assert record.getMessage() == "slow request"
    assert record.duration_ms == 6000.0


def test_fast_request_logs_at_info(monkeypatch, caplog):
    ticks = iter([100.0, 100.5])  # 500ms elapsed, well under the threshold
    monkeypatch.setattr(middleware, "monotonic", lambda: next(ticks))
    with caplog.at_level(logging.INFO, logger="finhealth.request"):
        resp = client.get("/api/health")
    assert resp.status_code == 200
    record = next(r for r in caplog.records if r.name == "finhealth.request")
    assert record.levelno == logging.INFO
    assert record.getMessage() == "request"


# ---------------------------------------------------------------------
# Contextvar isolation under concurrent requests.
#
# TestClient's transport runs one call at a time, which would never
# actually exercise overlap even if the contextvar were leaking — so this
# drives the middleware directly over raw ASGI, with two requests
# in flight on the same event loop via asyncio.gather and an artificial
# await between each request's two `get_request_id()` reads to force
# interleaving.
# ---------------------------------------------------------------------

def _http_scope(path: str) -> dict:
    return {
        "type": "http",
        "method": "GET",
        "path": path,
        "headers": [],
        "query_string": b"",
    }


async def _once_receive() -> dict:
    return {"type": "http.request", "body": b"", "more_body": False}


async def _run_request(path: str) -> tuple[str | None, str | None, int | None]:
    """Sends one request through `app_under_test`, capturing the
    contextvar's value both BEFORE and AFTER an `asyncio.sleep` inside the
    handler (to give a concurrently-running request a chance to interleave)
    plus the response's echoed status."""
    seen: list[str | None] = []
    status_holder: dict[str, int | None] = {"status": None}

    async def downstream(scope, receive, send):
        seen.append(get_request_id())
        await asyncio.sleep(0.02)
        seen.append(get_request_id())
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"", "more_body": False})

    wrapped = RequestIDMiddleware(downstream)

    async def send(message):
        if message["type"] == "http.response.start":
            status_holder["status"] = message["status"]

    await wrapped(_http_scope(path), _once_receive, send)
    return seen[0], seen[1], status_holder["status"]


def test_contextvar_does_not_leak_between_concurrent_requests():
    """No pytest-asyncio marker needed: `asyncio.run` drives the coroutine
    to completion synchronously, same as any other test in this suite —
    the concurrency being tested is INSIDE that one `asyncio.run` call,
    via `asyncio.gather` of two requests sharing the same event loop."""
    async def scenario():
        return await asyncio.gather(_run_request("/a"), _run_request("/b"))

    (before_a, after_a, status_a), (before_b, after_b, status_b) = asyncio.run(scenario())

    assert status_a == 200 and status_b == 200
    assert before_a == after_a  # request A never observed a foreign id mid-flight
    assert before_b == after_b
    assert before_a != before_b  # two independently generated ids, not a shared default
    assert before_a is not None and before_b is not None
