"""Structured logging (P7.T2): one formatter for every logger in the
process — this app's own (`finhealth`, `finhealth.auth`, `finhealth.vault`,
`finhealth.storage`, `finhealth.my`, `finhealth.request`) and uvicorn's —
so a log line always carries the same fields (`ts, level, logger, msg,
request_id, path, method, status, duration_ms`) no matter which module
logged it, without rewriting any of those modules' own `log.info(...)`
call sites. `path`/`method`/`status`/`duration_ms` are populated only on
the one line `app.middleware.RequestIDMiddleware` logs per request (via
`extra=`); every other line just omits them.

`LOG_FORMAT=json` → one JSON object per line, what Railway (or any other
log viewer that parses JSON) gets in production. `LOG_FORMAT=text`
(default, unset) → a human-readable line, for local dev. Neither
formatter is the third-party `python-json-logger` package or similar —
the shape needed here (nine fixed fields, RU-safe unicode) is small enough
that hand-rolling it keeps the dependency surface at zero.

`configure_logging()` runs once, at import time, from `app/main.py` —
see that module's comment on why this must (and does) run AFTER, and
therefore override, uvicorn's own `Config.__init__`-time
`configure_logging()` call: uvicorn resolves its `Config` object (which
applies ITS default logging config) before it ever imports the
"app.main:app" string, so by the time this module's top-level code runs,
uvicorn has already finished setting up logging its own way — reconfiguring
here is what makes this app's formatter win, not a race.
"""
from __future__ import annotations

import json
import logging
import os

from .request_context import RequestIDLogFilter

# Populated via `extra=` only by the request-id middleware's one summary
# line per request (app/middleware.py); absent (omitted, not null) on
# every other log line, e.g. startup messages or a service module's own
# `log.warning(...)` call outside the request-logging line itself.
_REQUEST_FIELDS = ("path", "method", "status", "duration_ms")


def _format_ts(formatter: logging.Formatter, record: logging.LogRecord) -> str:
    """ISO-8601 with millisecond precision and a timezone offset (P7.T2
    round 1, L5): `formatTime(record, "...%z")` alone has no sub-second
    component, so two lines logged within the same second — normal at this
    app's INFO-level request-summary throughput — are unorderable in a log
    viewer, undermining the "trace one user's report" use case
    docs/founder-todo.md's Railway note sells. `%z` has to be formatted
    separately and spliced in AFTER the milliseconds (`record.msecs`,
    already computed by the stdlib at record-creation time) — one
    `strftime` call can't place free text between seconds and an offset
    without also matching literal `.` characters as directive text."""
    base = formatter.formatTime(record, "%Y-%m-%dT%H:%M:%S")
    offset = formatter.formatTime(record, "%z")
    return f"{base}.{int(record.msecs):03d}{offset}"


class JsonFormatter(logging.Formatter):
    """One JSON object per line. `ensure_ascii=False` — this app's log
    messages are routinely Cyrillic (RU error text embedded in %-args,
    filenames, etc.) and a JSON log viewer handles UTF-8 natively; escaping
    every Cyrillic character to \\uXXXX would only make production logs
    harder to read for zero benefit."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "ts": _format_ts(self, record),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
        }
        for field in _REQUEST_FIELDS:
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


class TextFormatter(logging.Formatter):
    """Human-readable line for local dev — same underlying fields as
    JsonFormatter, rendered as `TS LEVEL logger [request_id]: msg
    field=value ...` instead of a JSON object."""

    def format(self, record: logging.LogRecord) -> str:
        request_id = getattr(record, "request_id", "-")
        extras = " ".join(
            f"{field}={getattr(record, field)}" for field in _REQUEST_FIELDS
            if getattr(record, field, None) is not None
        )
        # Space-separated, no timezone offset (unlike JsonFormatter's `ts` —
        # see `_format_ts`): this is the local-dev-only rendering, read by
        # a human on the one machine that produced it, not parsed by a log
        # viewer ordering lines across a fleet — the extra precision/offset
        # `_format_ts` exists for (P7.T2 round 1, L5) has no reader here.
        line = (f"{self.formatTime(record, '%Y-%m-%d %H:%M:%S')} {record.levelname} "
                f"{record.name} [{request_id}]: {record.getMessage()}")
        if extras:
            line += f" {extras}"
        if record.exc_info:
            line += "\n" + self.formatException(record.exc_info)
        return line


def _formatter_for(log_format: str) -> logging.Formatter:
    return JsonFormatter() if log_format.strip().lower() == "json" else TextFormatter()


def configure_logging() -> None:
    """Replaces the root logger's handlers with a single stream handler
    carrying the shared formatter + `RequestIDLogFilter`, and either routes
    uvicorn's own loggers through it (`uvicorn.error`, by letting it
    propagate) or disables them (`uvicorn.access`, outright — see below).
    Idempotent: safe to call more than once (a fresh handler list is built
    each time, not appended to)."""
    formatter = _formatter_for(os.environ.get("LOG_FORMAT", "text"))

    handler = logging.StreamHandler()
    handler.setFormatter(formatter)
    handler.addFilter(RequestIDLogFilter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)

    # uvicorn.error carries startup/shutdown/worker-crash lines — no
    # handler of its own, so it propagates up to the root handler above
    # and comes out in the same shape as every other line in the process,
    # rather than uvicorn's own (differently-shaped) default formatter.
    uvicorn_error = logging.getLogger("uvicorn.error")
    uvicorn_error.handlers = []
    uvicorn_error.propagate = True

    # uvicorn.access is disabled outright, not reformatted: the request-id
    # middleware (app/middleware.py) already logs one line per request —
    # method, path, status, duration_ms, request_id — through this SAME
    # formatter. Leaving uvicorn's own access log on would double-log
    # every request in two different shapes.
    uvicorn_access = logging.getLogger("uvicorn.access")
    uvicorn_access.handlers = []
    uvicorn_access.propagate = False
