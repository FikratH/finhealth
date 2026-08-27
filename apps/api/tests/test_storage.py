"""Storage graduation to SQLAlchemy + Alembic: schema bootstrap, WAL,
Postgres-offline compile, and the user_id column landing additively.

tests/conftest.py's autouse `_isolated_storage` fixture already points
`storage.DB_PATH` at a fresh tmp_path for every test in the suite, so the
existing 160-test suite passing unchanged *is* the seam-preservation proof.
These tests exercise the new machinery directly.
"""
from __future__ import annotations

import contextlib
import io
import threading

from sqlalchemy import inspect, select

from app import storage


def test_fresh_db_alembic_upgrade_head_creates_schema(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DB_PATH", str(tmp_path / "fresh.db"))

    engine = storage.get_engine()

    inspector = inspect(engine)
    assert inspector.has_table("analyses")
    columns = {c["name"] for c in inspector.get_columns("analyses")}
    assert columns == {"id", "created_at", "payload", "user_id"}
    index_names = {idx["name"] for idx in inspector.get_indexes("analyses")}
    assert "ix_analyses_user_id" in index_names


def test_bootstrap_is_idempotent_and_trusts_existing_schema(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DB_PATH", str(tmp_path / "twice.db"))

    first = storage.get_engine()
    storage.save_analysis("a1", "2026-08-27T00:00:00Z", {"ok": True})
    second = storage.get_engine()  # same url -> cached, no re-bootstrap

    assert first is second
    assert storage.get_analysis("a1") == {"ok": True}


def test_concurrent_first_requests_bootstrap_exactly_once(tmp_path, monkeypatch):
    """Two threads calling get_engine() for the same brand-new URL at once
    must not race alembic upgrade head's has_table TOCTOU: exactly one
    engine gets built and cached, no exception, schema present."""
    monkeypatch.setattr(storage, "DB_PATH", str(tmp_path / "concurrent.db"))

    barrier = threading.Barrier(2)
    results: list[object] = []
    errors: list[BaseException] = []

    def worker() -> None:
        try:
            barrier.wait(timeout=5)
            results.append(storage.get_engine())
        except BaseException as exc:  # noqa: BLE001 - captured for the assert below
            errors.append(exc)

    threads = [threading.Thread(target=worker) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=5)

    assert not errors, errors
    assert len(results) == 2
    assert results[0] is results[1]  # same engine instance, not two racing builds
    assert len(storage._engine_cache) == 1
    assert inspect(results[0]).has_table("analyses")


def test_sqlite_engine_uses_wal(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DB_PATH", str(tmp_path / "wal.db"))

    engine = storage.get_engine()
    with engine.connect() as conn:
        mode = conn.exec_driver_sql("PRAGMA journal_mode").scalar()

    assert mode.lower() == "wal"


def test_alembic_upgrade_head_sql_compiles_for_postgresql():
    """Offline `alembic upgrade head --sql` against the postgresql dialect
    must compile the initial migration (Postgres-readiness gate)."""
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(storage._ALEMBIC_INI))
    cfg.set_main_option("script_location", str(storage._ALEMBIC_DIR))
    # No real Postgres needed: offline mode only compiles DDL text through
    # the dialect, it never opens a connection.
    cfg.set_main_option("sqlalchemy.url", "postgresql://user:pass@localhost/db")

    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        command.upgrade(cfg, "head", sql=True)
    output = buf.getvalue()

    assert "CREATE TABLE analyses" in output
    assert "ix_analyses_user_id" in output


def test_save_analysis_with_user_id_round_trips(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DB_PATH", str(tmp_path / "user.db"))

    storage.save_analysis("abc123", "2026-08-27T00:00:00Z", {"score": 42}, user_id="user-1")

    assert storage.get_analysis("abc123") == {"score": 42}
    engine = storage.get_engine()
    with engine.connect() as conn:
        row = conn.execute(select(storage.analyses.c.user_id).where(storage.analyses.c.id == "abc123")).fetchone()
    assert row.user_id == "user-1"


def test_save_analysis_without_user_id_defaults_null(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DB_PATH", str(tmp_path / "anon.db"))

    storage.save_analysis("anon1", "2026-08-27T00:00:00Z", {"score": 1})

    engine = storage.get_engine()
    with engine.connect() as conn:
        row = conn.execute(select(storage.analyses.c.user_id).where(storage.analyses.c.id == "anon1")).fetchone()
    assert row.user_id is None


def test_save_analysis_upsert_replaces_existing_row(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DB_PATH", str(tmp_path / "upsert.db"))

    storage.save_analysis("dup", "2026-08-27T00:00:00Z", {"v": 1}, user_id="user-1")
    storage.save_analysis("dup", "2026-08-27T01:00:00Z", {"v": 2}, user_id="user-2")

    engine = storage.get_engine()
    with engine.connect() as conn:
        rows = conn.execute(select(storage.analyses).where(storage.analyses.c.id == "dup")).fetchall()
    assert len(rows) == 1
    assert storage.get_analysis("dup") == {"v": 2}
