"""GET /api/my/analyses + DELETE /api/my/analyses/{id} (P5.T4): the one
auth-gated history surface. Both endpoints require a valid signed-in user
(401 anonymous, via auth.require_user); the list is a summary projection
scoped to the caller; delete is ownership-checked with a 404 that never
distinguishes "doesn't exist" from "belongs to someone else."
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app import entitlements, storage
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


def _seed(analysis_id, user_id, created_at="2026-08-27T00:00:00Z",
          industry_name="Производство", overall_score=72.5,
          health_label="Хорошее состояние"):
    storage.save_analysis(analysis_id, created_at, {
        "analysis_id": analysis_id,
        "industry_name": industry_name,
        "overall_score": overall_score,
        "health_label": health_label,
    }, user_id=user_id)


def _seed_corrupt(analysis_id, user_id, created_at="2026-08-27T00:00:00Z"):
    """Bypasses save_analysis (which always json.dumps a valid dict) to
    plant a row whose `payload` column isn't parseable JSON at all —
    simulates on-disk corruption, a partial write, or a future schema
    migration gone wrong."""
    engine = storage.get_engine()
    with engine.begin() as conn:
        conn.execute(delete(storage.analyses).where(storage.analyses.c.id == analysis_id))
        conn.execute(storage.analyses.insert().values(
            id=analysis_id, created_at=created_at, payload="{not valid json", user_id=user_id))


# --------------------------------- auth gate --------------------------------

def test_list_requires_auth(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    resp = client.get("/api/my/analyses")
    assert resp.status_code == 401
    assert resp.json()["detail"] == {"code": "auth_required", "message": "Требуется вход в систему."}


def test_delete_requires_auth(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    resp = client.delete("/api/my/analyses/whatever")
    assert resp.status_code == 401
    assert resp.json()["detail"] == {"code": "auth_required", "message": "Требуется вход в систему."}


# ------------------------------ ownership matrix -----------------------------

def test_list_returns_only_own_analyses(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    _seed("a1", "user-a")
    _seed("a2", "user-a")
    _seed("b1", "user-b")

    resp = client.get("/api/my/analyses", headers=_auth("user-a"))
    assert resp.status_code == 200, resp.text
    ids = {row["analysis_id"] for row in resp.json()["analyses"]}
    assert ids == {"a1", "a2"}


def test_delete_own_analysis_succeeds(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    _seed("owned", "user-a")

    resp = client.delete("/api/my/analyses/owned", headers=_auth("user-a"))
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"deleted": "owned"}
    assert storage.get_analysis("owned") is None


def test_cannot_delete_another_users_analysis(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    _seed("b-owned", "user-b")

    resp = client.delete("/api/my/analyses/b-owned", headers=_auth("user-a"))
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Анализ не найден."
    # B's row survives untouched — A's failed attempt had no side effect.
    assert storage.get_analysis("b-owned") is not None


def test_delete_nonexistent_analysis_is_404(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    resp = client.delete("/api/my/analyses/does-not-exist", headers=_auth("user-a"))
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Анализ не найден."


def test_cannot_delete_anonymous_row(monkeypatch):
    """A row saved without a user_id (anonymous POST /api/analyze) has no
    owner at all — a signed-in user must not be able to claim it via
    delete either."""
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    storage.save_analysis("anon1", "2026-08-27T00:00:00Z", {
        "industry_name": "X", "overall_score": None, "health_label": "Y"})

    resp = client.delete("/api/my/analyses/anon1", headers=_auth("user-a"))
    assert resp.status_code == 404
    assert storage.get_analysis("anon1") is not None


# ---------------------------------- projection --------------------------------

def test_projection_fields(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    _seed("p1", "user-a", created_at="2026-08-20T12:00:00Z",
          industry_name="Розница", overall_score=63.4,
          health_label="Удовлетворительное состояние")

    resp = client.get("/api/my/analyses", headers=_auth("user-a"))
    assert resp.status_code == 200, resp.text
    row = resp.json()["analyses"][0]
    assert row == {
        "analysis_id": "p1",
        "created_at": "2026-08-20T12:00:00Z",
        "industry_name": "Розница",
        "overall_score": 63.4,
        "health_label": "Удовлетворительное состояние",
    }


def test_projection_includes_null_overall_score(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    _seed("null-score", "user-a", overall_score=None,
          health_label="Недостаточно данных для оценки")

    resp = client.get("/api/my/analyses", headers=_auth("user-a"))
    row = next(r for r in resp.json()["analyses"] if r["analysis_id"] == "null-score")
    assert row["overall_score"] is None
    assert row["health_label"] == "Недостаточно данных для оценки"


def test_list_skips_a_row_with_corrupt_payload_instead_of_500ing(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    _seed("good1", "user-a", created_at="2026-08-27T00:00:00Z")
    _seed_corrupt("corrupt1", "user-a", created_at="2026-08-27T01:00:00Z")
    _seed("good2", "user-a", created_at="2026-08-27T02:00:00Z")

    resp = client.get("/api/my/analyses", headers=_auth("user-a"))
    assert resp.status_code == 200, resp.text
    ids = {row["analysis_id"] for row in resp.json()["analyses"]}
    assert ids == {"good1", "good2"}


# ----------------------------------- order/limit -------------------------------

def test_list_orders_newest_first(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    _seed("old", "user-a", created_at="2026-08-01T00:00:00Z")
    _seed("new", "user-a", created_at="2026-08-27T00:00:00Z")
    _seed("mid", "user-a", created_at="2026-08-15T00:00:00Z")

    resp = client.get("/api/my/analyses", headers=_auth("user-a"))
    ids = [row["analysis_id"] for row in resp.json()["analyses"]]
    assert ids == ["new", "mid", "old"]


def test_list_caps_at_50(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    for i in range(55):
        _seed(f"a{i:02d}", "user-a", created_at=f"2026-08-27T00:{i:02d}:00Z")

    resp = client.get("/api/my/analyses", headers=_auth("user-a"))
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["analyses"]) == 50


# ------------------------------------ plan (P5.T5) -----------------------------

def test_list_response_carries_plan_default_free(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    _seed("p-free", "user-a")

    resp = client.get("/api/my/analyses", headers=_auth("user-a"))
    assert resp.status_code == 200, resp.text
    assert resp.json()["plan"] == "free"


def test_list_response_carries_plan_pro(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    _seed("p-pro", "user-pro")
    entitlements.get_or_create("user-pro")
    engine = storage.get_engine()
    from sqlalchemy import update
    with engine.begin() as conn:
        conn.execute(
            update(entitlements.entitlements)
            .where(entitlements.entitlements.c.user_id == "user-pro")
            .values(plan="pro")
        )

    resp = client.get("/api/my/analyses", headers=_auth("user-pro"))
    assert resp.status_code == 200, resp.text
    assert resp.json()["plan"] == "pro"


def test_list_response_carries_plan_even_with_no_analyses(monkeypatch):
    """get_or_create on read: a signed-in user with zero saved analyses
    still gets a plan back (an empty-but-valid entitlements row), not a
    missing key."""
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)

    resp = client.get("/api/my/analyses", headers=_auth("user-fresh"))
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"plan": "free", "analyses": []}
