"""Request-id ASGI middleware (P7.T2). Pure ASGI (not
`starlette.middleware.base.BaseHTTPMiddleware`, which fully buffers the
response and is known to interact badly with streaming responses like
`GET /api/my/documents/{id}/download` — see that endpoint's own docstring
on why it's wrapped in `StreamingResponse`), so a response can still stream
while this middleware only ever touches its `start`/`body` messages to
inject one header.

Wiring (see app/main.py): this is the OUTERMOST middleware — added last,
which in Starlette's `add_middleware` (each call prepends to
`user_middleware`, then the stack is built by wrapping in `reversed()`
order — verified against this repo's pinned Starlette, not assumed) means
it wraps everything else, including CORSMiddleware and
`app.body_limit.BodySizeLimitMiddleware`. That placement is deliberate: a
CORS preflight response and a 413 from the body-size cap both still need a
request id on their way out and their own logged line — an id that only
appeared on successful, routed requests would be missing on exactly the
requests most worth tracing (a misbehaving or hostile client).
"""
from __future__ import annotations

import logging
import uuid
# Bound by name, not `import time` + `time.monotonic()`: lets a test
# monkeypatch just this module's own `monotonic` reference (simulating
# elapsed time for the slow-request threshold) instead of the shared
# `time` module used process-wide — see tests/test_middleware.py.
from time import monotonic

from starlette.datastructures import Headers
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .request_context import reset_request_id, set_request_id

log = logging.getLogger("finhealth.request")

REQUEST_ID_HEADER = "x-request-id"
_RESPONSE_HEADER_BYTES = b"x-request-id"

# A request logged at WARNING instead of INFO past this threshold — lets a
# founder grep production logs for "slow request" (or filter on
# level=WARNING logger=finhealth.request) without knowing a numeric
# threshold to compare duration_ms against by hand.
SLOW_REQUEST_MS = 5_000


def _new_request_id() -> str:
    # uuid4, not uuid1/time-based: unguessable and needs no coordination
    # across processes/workers — two concurrent requests can never collide
    # on id even without a shared counter. `.hex` (32 lowercase hex chars,
    # no dashes) rather than the canonical dashed form: shorter, still
    # globally unique, and matches this codebase's existing id style
    # (`uuid.uuid4().hex` — see app/main.py's vault retain path, doc_id).
    return uuid.uuid4().hex


class RequestIDMiddleware:
    """Accepts an inbound `X-Request-ID` (from a trusted proxy in front of
    this service) or generates one, publishes it on the `request_id`
    contextvar for the lifetime of this request (every log call anywhere
    in the request path picks it up — see app/request_context.py), echoes
    it back as a response header, and logs ONE summary line per request in
    place of uvicorn's own access log (disabled — see app/logging_setup.py):
    `method, path, status, duration_ms, request_id`."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = Headers(scope=scope).get(REQUEST_ID_HEADER)
        # An incoming id that's present but blank/whitespace-only is
        # treated the same as absent — a proxy that sends an empty header
        # must not result in every log line for this request being
        # stamped with "" instead of a real, traceable id.
        request_id = incoming.strip() if incoming and incoming.strip() else _new_request_id()

        token = set_request_id(request_id)
        status_box: dict[str, int | None] = {"status": None}

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                status_box["status"] = message["status"]
                # Starlette Headers are immutable views; build a new list
                # rather than mutating scope/message headers in place.
                headers = list(message.get("headers", []))
                headers.append((_RESPONSE_HEADER_BYTES, request_id.encode("latin-1")))
                message = {**message, "headers": headers}
            await send(message)

        start = monotonic()
        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            duration_ms = round((monotonic() - start) * 1000, 1)
            slow = duration_ms > SLOW_REQUEST_MS
            log.log(
                logging.WARNING if slow else logging.INFO,
                "slow request" if slow else "request",
                extra={
                    "method": scope.get("method", ""),
                    "path": scope.get("path", ""),
                    "status": status_box["status"],
                    "duration_ms": duration_ms,
                },
            )
            reset_request_id(token)
