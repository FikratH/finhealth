"""Request body-size cap (P7.T2, folded from the plan's self-review: "cap
rides T2 — the middleware seam, one setting"). Pure ASGI middleware, not a
FastAPI dependency: a dependency only runs after Starlette has already
started routing (and, for multipart, after `UploadFile` has begun reading
the body) — too late to guarantee the cap applies BEFORE any body bytes
are read into memory. This sits below `app.middleware.RequestIDMiddleware`
so an oversize rejection still gets a request id (see that module's
wiring comment) and above CORS/the router.

Two paths, per the plan:
- `Content-Length` present: checked against the cap immediately, before
  `receive()` is ever called — an oversize request is rejected without
  reading a single body byte.
- `Content-Length` absent (chunked, or a client that omits it): there is
  nothing to check up front, so this wraps `receive()` and counts bytes as
  `http.request` messages arrive, capping the stream as it's consumed
  rather than after buffering it whole.

Independent of `POST /api/upload`'s own 15MB document-size check
(app/main.py) — deliberately: that check is a per-request-work-item rule
("your financial statement must be under 15MB") which reads a good error
message onto a specific field, MAX_BODY_BYTES is a lower-level
memory-safety rule around EVERY route's raw request body ("nothing this
server accepts is allowed to be arbitrarily large") and defaults strictly
above it (16MB vs. 15MB) so upload's own check is what a legitimately-just-
over-the-doc-cap file normally hits first.
"""
from __future__ import annotations

import json
import os

from starlette.datastructures import Headers
from starlette.types import ASGIApp, Message, Receive, Scope, Send

MAX_BODY_BYTES = int(os.environ.get("MAX_BODY_BYTES", str(16 * 1024 * 1024)))


class _BodyTooLarge(Exception):
    """Raised from inside the wrapped `receive()` once the streamed total
    exceeds the cap; caught only by this middleware's own `__call__` —
    never expected to reach FastAPI's exception handling."""


def _too_large_detail(max_bytes: int) -> dict[str, str]:
    return {
        "code": "payload_too_large",
        "message": f"Тело запроса больше {max_bytes // (1024 * 1024)} МБ.",
    }


async def _send_413(send: Send, max_bytes: int) -> None:
    body = json.dumps({"detail": _too_large_detail(max_bytes)}).encode("utf-8")
    await send({
        "type": "http.response.start",
        "status": 413,
        "headers": [(b"content-type", b"application/json")],
    })
    await send({"type": "http.response.body", "body": body, "more_body": False})


class BodySizeLimitMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int = MAX_BODY_BYTES) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        content_length = Headers(scope=scope).get("content-length")
        if content_length is not None:
            try:
                declared = int(content_length)
            except ValueError:
                declared = None  # malformed header: fall through to the streaming cap below
            if declared is not None and declared > self.max_bytes:
                await _send_413(send, self.max_bytes)
                return

        response_started = False

        async def send_wrapper(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        total = 0

        async def receive_wrapper() -> Message:
            nonlocal total
            message = await receive()
            if message["type"] == "http.request":
                total += len(message.get("body", b""))
                if total > self.max_bytes:
                    raise _BodyTooLarge()
            return message

        try:
            await self.app(scope, receive_wrapper, send_wrapper)
        except _BodyTooLarge:
            # A downstream body reader (multipart parser, json body, ...)
            # was mid-read when the cap tripped and never got the rest of
            # the stream — it cannot have started a response yet in that
            # case, so this is always reachable UNLESS the handler somehow
            # started responding before finishing its own body read (not a
            # pattern this API uses anywhere today). If it ever did, the
            # connection is left to the ASGI server to close rather than
            # sending a second, invalid http.response.start.
            if not response_started:
                await _send_413(send, self.max_bytes)
            else:
                raise
