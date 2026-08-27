"""POST /api/waitlist (P6.T6): anonymous-allowed Pro waitlist signup, per
docs/payments-plan.md's pre-payments launch stance. Covers EmailStr
validation, idempotency on a duplicate (case-insensitive) email, the
optional-auth `user_id` attachment, and that the route is wired into the
shared rate limiter.
"""
from __future__ import annotations

import contextlib
import io
from datetime import datetime, timedelta, timezone

import jwt
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import ratelimit, storage, waitlist as waitlist_lib
from app.main import app

client = TestClient(app)
TEST_SECRET = "test-only-secret-do-not-use-in-prod"


def _token(sub: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": sub, "iss": "tonus-web", "aud": "tonus-api",
              "iat": now, "exp": now + timedelta(hours=1)}
    return jwt.encode(payload, TEST_SECRET, algorithm="HS256")


def _auth(sub: str) -> dict:
    return {"Authorization": f"Bearer {_token(sub)}"}


def _row(email: str):
    engine = storage.get_engine()
    with engine.connect() as conn:
        return conn.execute(
            select(waitlist_lib.waitlist).where(
                waitlist_lib.waitlist.c.email == email.strip().lower())
        ).fetchone()


def test_anonymous_join_succeeds_and_defaults_source():
    resp = client.post("/api/waitlist", json={"email": "founder@example.com"})
    assert resp.status_code == 200
    assert resp.json() == {"status": "joined"}

    row = _row("founder@example.com")
    assert row is not None
    assert row.user_id is None
    assert row.source == "pricing_page"


def test_explicit_source_is_recorded():
    resp = client.post(
        "/api/waitlist", json={"email": "sourced@example.com", "source": "upgrade_banner"})
    assert resp.status_code == 200
    assert _row("sourced@example.com").source == "upgrade_banner"


def test_duplicate_email_is_idempotent_and_returns_200():
    first = client.post("/api/waitlist", json={"email": "dupe@example.com"})
    assert first.status_code == 200
    assert first.json() == {"status": "joined"}

    second = client.post("/api/waitlist", json={"email": "dupe@example.com"})
    assert second.status_code == 200
    assert second.json() == {"status": "already_joined"}


def test_duplicate_detection_is_case_insensitive():
    first = client.post("/api/waitlist", json={"email": "MixedCase@Example.com"})
    assert first.json() == {"status": "joined"}

    second = client.post("/api/waitlist", json={"email": "mixedcase@example.com"})
    assert second.json() == {"status": "already_joined"}

    # Exactly one row, stored normalized (never the original casing).
    engine = storage.get_engine()
    with engine.connect() as conn:
        rows = conn.execute(
            select(waitlist_lib.waitlist).where(
                waitlist_lib.waitlist.c.email == "mixedcase@example.com")
        ).fetchall()
    assert len(rows) == 1


def test_malformed_email_rejected_with_422():
    resp = client.post("/api/waitlist", json={"email": "not-an-email"})
    assert resp.status_code == 422
    row = _row("not-an-email")
    assert row is None


def test_missing_email_rejected_with_422():
    resp = client.post("/api/waitlist", json={})
    assert resp.status_code == 422


def test_authenticated_join_attaches_user_id(monkeypatch):
    # conftest.py's autouse fixture deletes AUTH_JWT_SECRET before every
    # test (matching test_entitlements.py's/test_auth.py's own pattern) —
    # without setting it back here, get_current_user_id treats every
    # request as anonymous regardless of the Authorization header.
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    resp = client.post(
        "/api/waitlist", json={"email": "signed-in@example.com"}, headers=_auth("user-123"))
    assert resp.status_code == 200
    assert resp.json() == {"status": "joined"}
    assert _row("signed-in@example.com").user_id == "user-123"


def test_rate_limit_is_wired_on_the_waitlist_route():
    """Same introspection idiom as test_ratelimit.py's own
    test_rate_limit_wired_on_all_four_endpoints — checks the route table
    rather than actually exhausting a bucket (already covered generically
    by ratelimit.py's own unit tests)."""
    wired = False
    for route in app.routes:
        if getattr(route, "path", None) != "/api/waitlist":
            continue
        dependant = getattr(route, "dependant", None)
        calls = {dep.call for dep in dependant.dependencies} if dependant else set()
        wired = ratelimit.rate_limit in calls
    assert wired


def test_migration_chain_0003_follows_0002():
    """Mirrors test_entitlements.py's own 0002-follows-0001 guard: looks up
    0003 by its own revision id (not get_revision("head")), so this stays
    correct even after a future migration lands on top of it."""
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    cfg = Config(str(storage._ALEMBIC_INI))
    cfg.set_main_option("script_location", str(storage._ALEMBIC_DIR))
    script = ScriptDirectory.from_config(cfg)
    rev = script.get_revision("0003_waitlist")

    assert rev.down_revision == "0002_entitlements"


def test_alembic_upgrade_head_sql_compiles_for_postgresql_with_waitlist():
    """Offline `alembic upgrade head --sql` against the postgresql dialect
    must compile all three migrations, including 0003's waitlist table AND
    its unique email index (Postgres-readiness gate — mirrors
    test_entitlements.py's own 0002 version, no real Postgres connection
    needed). The unique index is asserted explicitly, not just the table:
    SQLite and Postgres spell a named unique index differently enough that
    a typo in op.create_index's dialect-agnostic call could compile fine
    against SQLite (exercised by every other test in this file) while
    silently failing against Postgres — this is the one check that would
    catch that."""
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(storage._ALEMBIC_INI))
    cfg.set_main_option("script_location", str(storage._ALEMBIC_DIR))
    cfg.set_main_option("sqlalchemy.url", "postgresql://user:pass@localhost/db")

    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        command.upgrade(cfg, "head", sql=True)
    output = buf.getvalue()

    assert "CREATE TABLE analyses" in output
    assert "CREATE TABLE entitlements" in output
    assert "CREATE TABLE waitlist" in output
    assert "CREATE UNIQUE INDEX ix_waitlist_email" in output


def test_fresh_db_migration_creates_waitlist_table(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DB_PATH", str(tmp_path / "fresh.db"))
    from sqlalchemy import inspect

    engine = storage.get_engine()
    inspector = inspect(engine)
    assert inspector.has_table("waitlist")
    columns = {c["name"] for c in inspector.get_columns("waitlist")}
    assert columns == {"id", "email", "user_id", "created_at", "source"}
    pk = inspector.get_pk_constraint("waitlist")
    assert pk["constrained_columns"] == ["id"]
    unique_email_indexes = [
        ix for ix in inspector.get_indexes("waitlist") if ix["unique"] and ix["column_names"] == ["email"]
    ]
    assert len(unique_email_indexes) == 1


def test_waitlist_route_actually_enforces_the_limit_once_enabled(monkeypatch):
    monkeypatch.setattr(ratelimit, "RATE_LIMIT_PER_MINUTE", 1)
    monkeypatch.setattr(ratelimit, "_buckets", {})

    assert client.post("/api/waitlist", json={"email": "a@example.com"}).status_code == 200
    resp = client.post("/api/waitlist", json={"email": "b@example.com"})
    assert resp.status_code == 429
    assert resp.json()["detail"]["code"] == "rate_limited"
