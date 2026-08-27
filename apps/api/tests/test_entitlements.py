"""Entitlements substrate (P5.T5): migration chain, get_or_create /
increment_analyses counting, and the require_entitlement() verdict matrix.

Enforcement is OFF end to end here too — no test calls a paywalled
endpoint, because there isn't one yet (see app/entitlements.py's module
docstring). These tests only prove the schema and the helper logic that a
later task will wire up.
"""
from __future__ import annotations

import contextlib
import copy
import io
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
from fastapi.testclient import TestClient
from sqlalchemy import inspect, select, update

from app import entitlements, storage
from app.main import app

client = TestClient(app)
DEMO = Path(__file__).resolve().parent.parent / "demo" / "demo_company.csv"
TEST_SECRET = "test-only-secret-do-not-use-in-prod"


def _token(sub: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": sub, "iss": "tonus-web", "aud": "tonus-api",
              "iat": now, "exp": now + timedelta(hours=1)}
    return jwt.encode(payload, TEST_SECRET, algorithm="HS256")


def _auth(sub: str) -> dict:
    return {"Authorization": f"Bearer {_token(sub)}"}


def _upload_and_extract():
    with open(DEMO, "rb") as f:
        up = client.post("/api/upload", files={"file": ("demo_company.csv", f, "text/csv")})
    assert up.status_code == 200, up.text
    upload_id = up.json()["upload_id"]
    ex = client.post("/api/extract", json={"upload_id": upload_id})
    assert ex.status_code == 200, ex.text
    return ex.json()


def _analysis_request(ex, industry="manufacturing"):
    return {
        "upload_id": ex["upload_id"], "industry": industry,
        "currency": ex["currency"], "scale": ex["scale"],
        "latest_period": ex["latest_period"], "previous_period": ex["previous_period"],
        "audited": ex["audited"],
        "values": copy.deepcopy(ex["values"]),
        "previous_values": copy.deepcopy(ex["previous_values"]),
    }


# --------------------------------- migration ---------------------------------

def test_fresh_db_migration_creates_entitlements_table(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DB_PATH", str(tmp_path / "fresh.db"))

    engine = storage.get_engine()

    inspector = inspect(engine)
    assert inspector.has_table("entitlements")
    columns = {c["name"] for c in inspector.get_columns("entitlements")}
    assert columns == {
        "user_id", "plan", "status", "analyses_used",
        "provider", "provider_sub_id", "current_period_end",
    }
    pk = inspector.get_pk_constraint("entitlements")
    assert pk["constrained_columns"] == ["user_id"]


def test_migration_chain_0002_follows_0001():
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    cfg = Config(str(storage._ALEMBIC_INI))
    cfg.set_main_option("script_location", str(storage._ALEMBIC_DIR))
    script = ScriptDirectory.from_config(cfg)
    # Looks up 0002 by its own revision id, not via get_revision("head") —
    # P6.T6 added 0003_waitlist on top, so "head" no longer resolves to
    # 0002. This test's actual claim (0002 follows 0001) is unaffected by
    # later migrations landing above it, so it shouldn't need editing every
    # time one does.
    rev = script.get_revision("0002_entitlements")

    assert rev.down_revision == "0001_initial"


def test_alembic_upgrade_head_sql_compiles_for_postgresql_with_entitlements():
    """Offline `alembic upgrade head --sql` against the postgresql dialect
    must compile both migrations, including 0002's entitlements table
    (Postgres-readiness gate — mirrors test_storage.py's 0001 version, no
    real Postgres connection needed)."""
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


# ------------------------------ get_or_create --------------------------------

def test_get_or_create_returns_default_free_row():
    row = entitlements.get_or_create("user-1")
    assert row == {
        "user_id": "user-1",
        "plan": "free",
        "status": "active",
        "analyses_used": 0,
        "provider": None,
        "provider_sub_id": None,
        "current_period_end": None,
    }


def test_get_or_create_is_idempotent_and_returns_the_same_row_on_reuse():
    first = entitlements.get_or_create("user-1")
    entitlements.increment_analyses("user-1")
    second = entitlements.get_or_create("user-1")

    assert first["analyses_used"] == 0
    assert second["user_id"] == first["user_id"]
    assert second["analyses_used"] == 1


# ------------------------------ increment_analyses ----------------------------

def test_increment_analyses_accumulates():
    entitlements.get_or_create("user-1")
    entitlements.increment_analyses("user-1")
    entitlements.increment_analyses("user-1")
    entitlements.increment_analyses("user-1")

    assert entitlements.get_or_create("user-1")["analyses_used"] == 3


# ------------------------------ require_entitlement ---------------------------

def test_free_user_under_limit_is_allowed():
    entitlements.get_or_create("user-1")
    assert entitlements.require_entitlement("user-1", "analyze") == (True, None)


def test_free_user_one_below_limit_is_still_allowed():
    entitlements.get_or_create("user-1")
    entitlements.increment_analyses("user-1")  # 1 used, limit is 2

    assert entitlements.require_entitlement("user-1", "analyze") == (True, None)


def test_free_user_at_limit_is_denied():
    entitlements.get_or_create("user-1")
    entitlements.increment_analyses("user-1")
    entitlements.increment_analyses("user-1")  # 2 used == FREE_ANALYSES_LIMIT

    assert entitlements.require_entitlement("user-1", "analyze") == (False, "free_limit_reached")


def test_pro_user_always_allowed_even_over_limit():
    entitlements.get_or_create("user-1")
    engine = storage.get_engine()
    with engine.begin() as conn:
        conn.execute(
            update(entitlements.entitlements)
            .where(entitlements.entitlements.c.user_id == "user-1")
            .values(plan="pro", analyses_used=999)
        )

    assert entitlements.require_entitlement("user-1", "analyze") == (True, None)


def test_unknown_feature_is_permissive_by_default():
    entitlements.get_or_create("user-1")
    entitlements.increment_analyses("user-1")
    entitlements.increment_analyses("user-1")  # at the "analyze" limit

    assert entitlements.require_entitlement("user-1", "some_future_feature") == (True, None)


# ------------------------- POST /api/analyze integration ----------------------

def test_anonymous_analyze_creates_no_entitlements_row(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    ex = _upload_and_extract()
    resp = client.post("/api/analyze", json=_analysis_request(ex))
    assert resp.status_code == 200, resp.text

    engine = storage.get_engine()
    with engine.connect() as conn:
        count = conn.execute(select(entitlements.entitlements)).fetchall()
    assert count == []


def test_authenticated_analyze_counts_and_accumulates(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)

    for _ in range(3):
        ex = _upload_and_extract()
        resp = client.post("/api/analyze", json=_analysis_request(ex), headers=_auth("user-counter"))
        assert resp.status_code == 200, resp.text

    assert entitlements.get_or_create("user-counter")["analyses_used"] == 3


def test_increment_failure_does_not_fail_the_analyze_response(monkeypatch):
    """A best-effort bookkeeping failure must never turn an already-saved
    analysis into an error response — the analysis and its 200 stand on
    their own regardless of what happens to the entitlements row."""
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)

    def _boom(user_id: str) -> None:
        raise RuntimeError("simulated entitlements failure")

    monkeypatch.setattr(entitlements, "increment_analyses", _boom)

    ex = _upload_and_extract()
    resp = client.post("/api/analyze", json=_analysis_request(ex), headers=_auth("user-broken"))

    assert resp.status_code == 200, resp.text
    assert storage.get_analysis(resp.json()["analysis_id"]) is not None
