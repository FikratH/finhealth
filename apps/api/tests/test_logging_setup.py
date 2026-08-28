"""app/logging_setup.py — the two formatters directly (no dependence on
the global root logger's state), plus `configure_logging()`'s LOG_FORMAT
switch and its uvicorn-logger wiring. The latter mutates process-global
logging state, so every test that calls `configure_logging()` restores it
via `_saved_logging_state` — `app.main` already called it once at import
time (module-level), and leaving that mutated after a test would risk
breaking `caplog`-based assertions in tests/test_middleware.py depending
on run order."""
from __future__ import annotations

import logging

import pytest

from app.logging_setup import JsonFormatter, TextFormatter, configure_logging


def _record(msg="hello", *, level=logging.INFO, exc_info=None, **extra) -> logging.LogRecord:
    record = logging.LogRecord(
        name="finhealth.test", level=level, pathname="x.py", lineno=1,
        msg=msg, args=(), exc_info=exc_info,
    )
    for key, value in extra.items():
        setattr(record, key, value)
    return record


class TestJsonFormatter:
    def test_required_fields_present(self):
        record = _record("upload accepted", request_id="rid-1", path="/api/upload",
                         method="POST", status=200, duration_ms=12.3)
        import json
        payload = json.loads(JsonFormatter().format(record))
        assert payload["level"] == "INFO"
        assert payload["logger"] == "finhealth.test"
        assert payload["msg"] == "upload accepted"
        assert payload["request_id"] == "rid-1"
        assert payload["path"] == "/api/upload"
        assert payload["method"] == "POST"
        assert payload["status"] == 200
        assert payload["duration_ms"] == 12.3
        assert "ts" in payload

    def test_request_fields_omitted_when_absent(self):
        """A log line outside a request (e.g. a service module's own
        `log.warning(...)`, or app startup) has no path/method/status/
        duration_ms — they must be OMITTED, not present as null, to keep
        those lines lean."""
        import json
        record = _record("vault backend error", request_id="rid-2")
        payload = json.loads(JsonFormatter().format(record))
        assert payload["request_id"] == "rid-2"
        for field in ("path", "method", "status", "duration_ms"):
            assert field not in payload

    def test_request_id_defaults_to_dash_without_the_filter(self):
        """Formatter-level fallback: a record that never passed through
        RequestIDLogFilter (e.g. this test's own manually-built records)
        still formats cleanly."""
        import json
        payload = json.loads(JsonFormatter().format(_record("no filter applied")))
        assert payload["request_id"] == "-"

    def test_cyrillic_message_is_not_escaped(self):
        """`ensure_ascii=False` — a JSON log viewer handles UTF-8 natively;
        \\uXXXX-escaping RU text (this app's error messages are routinely
        Cyrillic) would only make production logs harder to read."""
        record = _record("Файл больше 15 МБ.", request_id="rid-3")
        raw = JsonFormatter().format(record)
        assert "Файл больше 15 МБ." in raw
        assert "\\u" not in raw

    def test_exception_info_included(self):
        import json
        try:
            raise ValueError("boom")
        except ValueError:
            import sys
            record = _record("extraction failed", request_id="rid-4", exc_info=sys.exc_info())
        payload = json.loads(JsonFormatter().format(record))
        assert "ValueError: boom" in payload["exc_info"]


class TestTextFormatter:
    def test_human_readable_line_carries_the_same_fields(self):
        record = _record("request", request_id="rid-5", path="/api/health",
                         method="GET", status=200, duration_ms=4.2)
        line = TextFormatter().format(record)
        assert "[rid-5]" in line
        assert "finhealth.test" in line
        assert "request" in line
        assert "path=/api/health" in line
        assert "method=GET" in line
        assert "status=200" in line
        assert "duration_ms=4.2" in line

    def test_no_trailing_extras_when_request_fields_absent(self):
        record = _record("startup", request_id="-")
        line = TextFormatter().format(record)
        assert "path=" not in line and "duration_ms=" not in line


@pytest.fixture
def _saved_logging_state():
    root = logging.getLogger()
    uv_error = logging.getLogger("uvicorn.error")
    uv_access = logging.getLogger("uvicorn.access")
    saved = {
        "root_handlers": list(root.handlers), "root_level": root.level,
        "uv_error_handlers": list(uv_error.handlers), "uv_error_propagate": uv_error.propagate,
        "uv_access_handlers": list(uv_access.handlers), "uv_access_propagate": uv_access.propagate,
    }
    yield
    root.handlers = saved["root_handlers"]
    root.level = saved["root_level"]
    uv_error.handlers = saved["uv_error_handlers"]
    uv_error.propagate = saved["uv_error_propagate"]
    uv_access.handlers = saved["uv_access_handlers"]
    uv_access.propagate = saved["uv_access_propagate"]


def test_configure_logging_selects_json_formatter(monkeypatch, _saved_logging_state):
    monkeypatch.setenv("LOG_FORMAT", "json")
    configure_logging()
    handler = logging.getLogger().handlers[0]
    assert isinstance(handler.formatter, JsonFormatter)


def test_configure_logging_defaults_to_text_formatter(monkeypatch, _saved_logging_state):
    monkeypatch.delenv("LOG_FORMAT", raising=False)
    configure_logging()
    handler = logging.getLogger().handlers[0]
    assert isinstance(handler.formatter, TextFormatter)


def test_configure_logging_is_case_insensitive(monkeypatch, _saved_logging_state):
    monkeypatch.setenv("LOG_FORMAT", "JSON")
    configure_logging()
    assert isinstance(logging.getLogger().handlers[0].formatter, JsonFormatter)


def test_uvicorn_access_log_is_disabled(monkeypatch, _saved_logging_state):
    monkeypatch.delenv("LOG_FORMAT", raising=False)
    configure_logging()
    access = logging.getLogger("uvicorn.access")
    assert access.handlers == []
    assert access.propagate is False


def test_uvicorn_error_log_propagates_to_the_shared_handler(monkeypatch, _saved_logging_state):
    monkeypatch.delenv("LOG_FORMAT", raising=False)
    configure_logging()
    error_logger = logging.getLogger("uvicorn.error")
    assert error_logger.handlers == []
    assert error_logger.propagate is True
