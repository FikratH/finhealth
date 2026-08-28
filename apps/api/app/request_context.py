"""Request-scoped id (P7.T2): the current request's `request_id`, readable
from any log call anywhere in the request path via a `contextvars.ContextVar`
+ a `logging.Filter`, without threading it through every function signature
one by one.

Set once, at the top of the ASGI stack, by `app.middleware.RequestIDMiddleware`
(the outermost middleware — see main.py's wiring comment) and read by
`RequestIDLogFilter` below, which is attached to the root logger's handler
in `app.logging_setup`. Because Python's logging propagates records up to
the root logger by default, this single filter stamps `request_id` onto
EVERY record that reaches that handler — this module's own callers
(`finhealth`, `finhealth.auth`, `finhealth.vault`, `finhealth.storage`,
`finhealth.my`, uvicorn's own loggers, ...) never need to pass `extra=` or
know this contextvar exists.

Contextvars propagate through `await`s within the same asyncio Task, and
`starlette.concurrency.run_in_threadpool` (what FastAPI uses to run `def`
— not `async def` — path operation functions, e.g. `POST /api/extract`
and `POST /api/analysis/{id}/narrative`) explicitly copies the calling
context into the worker thread it runs the sync function in (anyio's
`to_thread.run_sync` — verified directly against this repo's pinned anyio,
not assumed), so log calls inside those sync handlers pick up the request
id too, without any change to those functions.

Scope: only this process's event loop. The extraction ProcessPool worker
(`app/services/extraction.py`, submitted from `app/main.py`) runs in a
SEPARATE OS process — a contextvar set here does not, and cannot, cross
that boundary. The worker itself does not log today (see main.py's
`extract()` docstring); this stays true after P7.T2. The log calls made
in the PARENT process around `pool.submit()`/`future.result()` — success,
timeout, broken-pool, and generic-failure branches — are the traceable
ones, and they run inside the request's own context.
"""
from __future__ import annotations

import contextvars
import logging

_request_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "request_id", default=None)


def get_request_id() -> str | None:
    """The current request's id, or None outside any request (startup,
    shutdown, a background thread never given the context)."""
    return _request_id.get()


def set_request_id(value: str) -> contextvars.Token:
    """Publishes `value` on the contextvar for the remainder of the current
    context. Returns a Token — pass it to `reset_request_id` when the
    request ends so the contextvar doesn't leak its value into whatever
    reuses this context afterward (relevant because a thread pool worker's
    OS thread is reused across requests, though request-scoped Tasks
    themselves are not)."""
    return _request_id.set(value)


def reset_request_id(token: contextvars.Token) -> None:
    _request_id.reset(token)


class RequestIDLogFilter(logging.Filter):
    """Attached to the shared handler in `app.logging_setup.configure_logging`.
    A filter, not a `LogRecordFactory`, on purpose: filters run on every
    handler call regardless of which logger created the record or which
    module's `getLogger()` call it came from, without replacing
    `logging.getLogRecordFactory()` process-wide (which would affect
    records this app never sees, e.g. from other libraries' own handlers)."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id() or "-"
        return True
