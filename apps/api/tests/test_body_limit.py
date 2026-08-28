"""app/body_limit.py — BodySizeLimitMiddleware (P7.T2, folded from the
plan's self-review). Unit-tests the middleware directly with a small
`max_bytes` (bytes, not megabytes) rather than allocating real multi-MB
payloads through the full app — precise at exact boundaries and fast.
One integration test at the bottom confirms it's actually wired into the
real app with the documented default and envelope shape.
"""
from __future__ import annotations

import asyncio
import json

from fastapi.testclient import TestClient

from app.body_limit import MAX_BODY_BYTES, BodySizeLimitMiddleware
from app.main import app

client = TestClient(app)


async def _echo_app(scope, receive, send):
    """Downstream app: drains the body (so the streaming-cap path actually
    gets exercised) and reports how many bytes it saw before either
    finishing normally or being interrupted by the cap."""
    total = 0
    while True:
        message = await receive()
        total += len(message.get("body", b""))
        if not message.get("more_body", False):
            break
    await send({"type": "http.response.start", "status": 200, "headers": []})
    await send({"type": "http.response.body", "body": str(total).encode(), "more_body": False})


def _scope(*, content_length: int | None) -> dict:
    headers = []
    if content_length is not None:
        headers.append((b"content-length", str(content_length).encode()))
    return {"type": "http", "method": "POST", "path": "/x", "headers": headers, "query_string": b""}


def _chunks(*bodies: bytes) -> "list[dict]":
    messages = [{"type": "http.request", "body": b, "more_body": True} for b in bodies]
    messages.append({"type": "http.request", "body": b"", "more_body": False})
    return messages


async def _drive(middleware, scope, receive_messages) -> tuple[int | None, bytes]:
    it = iter(receive_messages)

    async def receive():
        return next(it)

    sent: list[dict] = []

    async def send(message):
        sent.append(message)

    await middleware(scope, receive, send)
    status = next((m["status"] for m in sent if m["type"] == "http.response.start"), None)
    body = b"".join(m.get("body", b"") for m in sent if m["type"] == "http.response.body")
    return status, body


async def _run(max_bytes: int, *, content_length: int | None, bodies: tuple[bytes, ...]):
    mw = BodySizeLimitMiddleware(_echo_app, max_bytes=max_bytes)
    return await _drive(mw, _scope(content_length=content_length), _chunks(*bodies))


def test_over_limit_with_content_length_rejected_before_any_body_is_read():
    reached = []

    async def never_called_app(scope, receive, send):
        reached.append(True)
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"", "more_body": False})

    mw = BodySizeLimitMiddleware(never_called_app, max_bytes=10)
    status, body = asyncio.run(_drive(mw, _scope(content_length=11), _chunks(b"x" * 11)))
    assert status == 413
    assert reached == []  # the downstream app was never invoked
    assert json.loads(body) == {
        "detail": {"code": "payload_too_large", "message": "Тело запроса больше 0 МБ."}
    }


def test_under_limit_with_content_length_passes_through():
    status, body = asyncio.run(_run(max_bytes=10, content_length=5, bodies=(b"hello",)))
    assert status == 200
    assert body == b"5"


def test_at_exact_limit_with_content_length_is_allowed():
    """The cap itself is the max ALLOWED size, not an exclusive bound —
    matches MAX_FILE_SIZE_MB's own `size > MAX_FILE_SIZE` (strictly
    greater) check in app/main.py's upload handler."""
    status, body = asyncio.run(_run(max_bytes=10, content_length=10, bodies=(b"x" * 10,)))
    assert status == 200
    assert body == b"10"


def test_missing_content_length_streams_and_caps_as_chunks_arrive():
    """No Content-Length header at all (chunked transfer, or a client that
    omits it) — nothing to check up front, so the cap only trips once the
    running total of streamed chunks exceeds it."""
    status, body = asyncio.run(
        _run(max_bytes=10, content_length=None, bodies=(b"1234567890", b"more")))
    assert status == 413
    assert json.loads(body)["detail"]["code"] == "payload_too_large"


def test_missing_content_length_under_limit_passes_through():
    status, body = asyncio.run(
        _run(max_bytes=10, content_length=None, bodies=(b"abc", b"def")))
    assert status == 200
    assert body == b"6"


def test_malformed_content_length_falls_back_to_the_streaming_cap():
    """A header that isn't a valid integer must not crash the request —
    it's treated like "absent" and the streaming counter still enforces
    the cap."""
    async def _drive_malformed():
        mw = BodySizeLimitMiddleware(_echo_app, max_bytes=5)
        scope = {
            "type": "http", "method": "POST", "path": "/x", "query_string": b"",
            "headers": [(b"content-length", b"not-a-number")],
        }
        return await _drive(mw, scope, _chunks(b"toolong"))

    status, body = asyncio.run(_drive_malformed())
    assert status == 413


def test_non_http_scope_passes_through_untouched():
    calls = []

    async def lifespan_app(scope, receive, send):
        calls.append(scope["type"])

    mw = BodySizeLimitMiddleware(lifespan_app, max_bytes=1)
    asyncio.run(mw({"type": "lifespan"}, lambda: None, lambda m: None))
    assert calls == ["lifespan"]


# ---------------------------------------------------------------------
# Wired into the real app, with the documented default and envelope.
# ---------------------------------------------------------------------

def test_default_max_body_bytes_is_16mb_consistent_with_the_doc_cap():
    assert MAX_BODY_BYTES == 16 * 1024 * 1024


def test_ordinary_upload_under_the_cap_is_unaffected():
    resp = client.post("/api/upload", files={"file": ("r.csv", b"Show;2024\nA;1\n", "text/csv")})
    assert resp.status_code == 200


def test_middleware_is_wired_below_request_id_and_above_cors():
    names = [m.cls.__name__ for m in app.user_middleware]
    assert names.index("RequestIDMiddleware") < names.index("BodySizeLimitMiddleware") \
        < names.index("CORSMiddleware")


# ---------------------------------------------------------------------
# P7.T2 round 1, H1/H2: the streaming (no-Content-Length) cap path, driven
# through the REAL `app.main:app` — not the `_echo_app` stub every test
# above uses. That stub reads `receive()` in a bare loop with no exception
# handling, so `_BodyTooLarge` propagates to this middleware's own
# `except` cleanly no matter what type it is — a property of the stub, not
# of the app, and it is exactly what let the H1 regression through
# undetected: for a real FastAPI route, `_BodyTooLarge` is raised from
# INSIDE FastAPI's own body-parsing (`fastapi/routing.py`), and a
# plain-`Exception` version of it was silently caught there and rewritten
# into a bare-string 400 `{"detail": "There was an error parsing the
# body"}` — wrong status, broken `{code, message}` envelope — before ever
# reaching this middleware. Confirmed by hand that this exact test fails
# that way against the pre-fix `_BodyTooLarge(Exception)`: reverting
# app/body_limit.py's `_BodyTooLarge` to subclass plain `Exception` (its
# round-0 shape) turns this test's 413 assertion into `assert 400 == 413`,
# and the envelope assertion never even runs.
#
# Driven via a raw ASGI call directly against `app.main.app` (not
# `TestClient`): httpx's transport always computes and sends
# `Content-Length` for any body it can see the length of up front, so
# there is no way to make a real "no Content-Length" request through it —
# the omission has to be constructed at the ASGI-message level, exactly as
# a chunked-transfer-encoding client (curl -T -, or fetch() with a
# ReadableStream body) would arrive at this server.

def _multipart_body(big: bytes) -> bytes:
    boundary = b"----pytestboundary"
    return (b"--" + boundary + b"\r\n"
            b'Content-Disposition: form-data; name="file"; filename="big.csv"\r\n'
            b"Content-Type: text/csv\r\n\r\n" + big + b"\r\n--" + boundary + b"--\r\n")


async def _post_without_content_length(path: str, body: bytes) -> tuple[int, dict, bytes]:
    scope = {
        "type": "http", "method": "POST", "path": path, "query_string": b"",
        "client": ("127.0.0.1", 12345),
        # deliberately NO content-length header — the adversarial path.
        "headers": [(b"content-type", b"multipart/form-data; boundary=----pytestboundary")],
    }
    # Split into chunks (real chunked transfer never arrives as one
    # `http.request` message either) so the streaming counter, not a
    # single-message shortcut, is what's actually exercised.
    chunk_size = 65536
    messages = [
        {"type": "http.request", "body": body[i:i + chunk_size], "more_body": True}
        for i in range(0, len(body), chunk_size)
    ]
    messages.append({"type": "http.request", "body": b"", "more_body": False})
    it = iter(messages)

    async def receive():
        return next(it)

    sent: list[dict] = []

    async def send(message):
        sent.append(message)

    await app(scope, receive, send)
    start = next(m for m in sent if m["type"] == "http.response.start")
    status = start["status"]
    headers = {k.decode(): v.decode() for k, v in start["headers"]}
    resp_body = b"".join(m.get("body", b"") for m in sent if m["type"] == "http.response.body")
    return status, headers, resp_body


def test_oversize_chunked_upload_through_the_real_app_returns_413_with_the_envelope():
    """The one test H1/H2 asked for: an oversize body, no Content-Length,
    through the real, fully-wired app (routing, FastAPI body parsing,
    every middleware) — not a stub."""
    big = b"x" * (MAX_BODY_BYTES + 1000)
    status, headers, body = asyncio.run(
        _post_without_content_length("/api/upload", _multipart_body(big)))
    assert status == 413
    assert json.loads(body) == {
        "detail": {"code": "payload_too_large", "message": "Тело запроса больше 16 МБ."}
    }
    # The fix rides the normal HTTPException path, so it still gets a
    # request id like every other error response — worth pinning here too
    # since it's the same code path H1 was about.
    assert "x-request-id" in headers


def test_undersize_chunked_upload_through_the_real_app_is_unaffected():
    """Companion sanity check: the H1 fix must not turn a normal,
    under-the-cap streaming upload into an error."""
    small = b"Show;2024\nA;1\n"
    status, _headers, body = asyncio.run(
        _post_without_content_length("/api/upload", _multipart_body(small)))
    assert status == 200
    assert json.loads(body)["detected_kind"] == "csv"
