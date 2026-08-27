"""SQLAlchemy storage for analysis results + ephemeral upload storage.

Uploaded documents are written to a temporary directory under random UUID
names (never the user-supplied filename — path traversal is impossible) and
are deleted immediately after extraction or by TTL cleanup. Only analysis
results (already anonymized numbers) are persisted in the database.

Engine selection: DATABASE_URL env wins when set (Postgres in production);
otherwise a SQLite file at DB_PATH is used. DB_PATH stays a plain
module-level attribute — tests/conftest.py monkeypatches `storage.DB_PATH`
(and `storage.UPLOAD_DIR`) per test for isolation, and get_engine() re-reads
it on every call so the patched value takes effect without any other change.

Schema: owned by Alembic (apps/api/alembic/). On first use, if the
`analyses` table is missing, get_engine() runs `alembic upgrade head`
programmatically (dev/fresh-db convenience) — otherwise it trusts that
migrations have already been applied (the production path).
"""
from __future__ import annotations

import json
import os
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import Optional

from sqlalchemy import Column, Index, MetaData, Table, Text, create_engine, delete, event, inspect, select
from sqlalchemy.engine import Engine

DB_PATH = os.environ.get("FINHEALTH_DB", str(Path(__file__).resolve().parent.parent / "app.db"))
UPLOAD_DIR = Path(tempfile.gettempdir()) / "finhealth_uploads"
UPLOAD_TTL_SECONDS = 15 * 60

_API_ROOT = Path(__file__).resolve().parent.parent  # apps/api
_ALEMBIC_INI = _API_ROOT / "alembic.ini"
_ALEMBIC_DIR = _API_ROOT / "alembic"

metadata = MetaData()

analyses = Table(
    "analyses",
    metadata,
    Column("id", Text, primary_key=True),
    Column("created_at", Text, nullable=False),
    Column("payload", Text, nullable=False),
    Column("user_id", Text, nullable=True),
)
Index("ix_analyses_user_id", analyses.c.user_id)

# Keyed by resolved URL so a DB_PATH change (test isolation) creates a fresh
# engine instead of silently reusing one bound to a stale sqlite file.
_engine_cache: dict[str, Engine] = {}
# Guards the cache-miss path (create_engine + bootstrap) so two concurrent
# first-requests can't both race alembic upgrade head against the same
# fresh database.
_engine_lock = threading.Lock()


def database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    return f"sqlite:///{DB_PATH}"


def _configure_sqlite(engine: Engine) -> None:
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):  # noqa: ANN001
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()


def _bootstrap_schema(engine: Engine) -> None:
    """Create the schema via Alembic if it isn't there yet; otherwise trust
    that migrations have already been applied (production path)."""
    if inspect(engine).has_table("analyses"):
        return
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(_ALEMBIC_INI))
    cfg.set_main_option("script_location", str(_ALEMBIC_DIR))
    cfg.set_main_option("sqlalchemy.url", str(engine.url))
    command.upgrade(cfg, "head")


def get_engine() -> Engine:
    url = database_url()
    engine = _engine_cache.get(url)
    if engine is not None:
        return engine

    with _engine_lock:
        # Re-check inside the lock: another thread may have already built
        # (and bootstrapped) the engine for this URL while we were waiting
        # for it — without this, two concurrent first-requests both miss
        # the cache, both create_engine, and both race alembic upgrade
        # head's has_table check against the same fresh database.
        engine = _engine_cache.get(url)
        if engine is not None:
            return engine

        # A different DB_PATH/DATABASE_URL means a previous engine (if any)
        # is stale — dispose it so pooled connections/file handles don't leak.
        for stale in _engine_cache.values():
            stale.dispose()
        _engine_cache.clear()

        engine = create_engine(url, future=True)
        if engine.url.get_backend_name() == "sqlite":
            db_file = engine.url.database
            if db_file and db_file != ":memory:":
                Path(db_file).parent.mkdir(parents=True, exist_ok=True)
            _configure_sqlite(engine)
        _bootstrap_schema(engine)
        _engine_cache[url] = engine
        return engine


# --------------------------- uploads (ephemeral) ---------------------------
def save_upload(data: bytes, kind: str) -> str:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    upload_id = uuid.uuid4().hex
    path = UPLOAD_DIR / f"{upload_id}.{kind}"
    with open(path, "wb") as f:
        f.write(data)
    return upload_id


def read_upload(upload_id: str) -> Optional[tuple[bytes, str]]:
    # upload_id is validated as hex to exclude any path characters
    if not all(ch in "0123456789abcdef" for ch in upload_id) or len(upload_id) != 32:
        return None
    for path in UPLOAD_DIR.glob(f"{upload_id}.*"):
        kind = path.suffix.lstrip(".")
        with open(path, "rb") as f:
            return f.read(), kind
    return None


def delete_upload(upload_id: str) -> None:
    if not all(ch in "0123456789abcdef" for ch in upload_id) or len(upload_id) != 32:
        return
    for path in UPLOAD_DIR.glob(f"{upload_id}.*"):
        try:
            path.unlink()
        except OSError:
            pass


def cleanup_stale_uploads() -> None:
    if not UPLOAD_DIR.exists():
        return
    now = time.time()
    for path in UPLOAD_DIR.iterdir():
        try:
            if now - path.stat().st_mtime > UPLOAD_TTL_SECONDS:
                path.unlink()
        except OSError:
            pass


# --------------------------- analyses (persistent) -------------------------
def save_analysis(analysis_id: str, created_at: str, payload: dict, user_id: Optional[str] = None) -> None:
    engine = get_engine()
    payload_json = json.dumps(payload, ensure_ascii=False)
    with engine.begin() as conn:
        # Portable upsert (delete-then-insert in one transaction) — avoids
        # dialect-specific ON CONFLICT syntax while matching the old
        # INSERT OR REPLACE semantics.
        conn.execute(delete(analyses).where(analyses.c.id == analysis_id))
        conn.execute(analyses.insert().values(
            id=analysis_id, created_at=created_at, payload=payload_json, user_id=user_id))


def get_analysis(analysis_id: str) -> Optional[dict]:
    engine = get_engine()
    with engine.connect() as conn:
        row = conn.execute(
            select(analyses.c.payload).where(analyses.c.id == analysis_id)
        ).fetchone()
    return json.loads(row[0]) if row else None


def delete_analysis(analysis_id: str) -> bool:
    engine = get_engine()
    with engine.begin() as conn:
        result = conn.execute(delete(analyses).where(analyses.c.id == analysis_id))
    return result.rowcount > 0
