"""GET /api/my/documents + DELETE /api/my/documents/{id} (P5.T7): the
document-vault counterpart to test_my_analyses.py — same require_user gate,
same ownership-scoped 404-never-403 idiom, exercised directly against
app.services.vault (not through upload/extract — see test_retain.py for the
end-to-end retain flow) so the endpoint contract is tested independently of
how a document got into the vault.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
from fastapi.testclient import TestClient

from app.main import app
from app.services import vault

client = TestClient(app)
TEST_SECRET = "test-only-secret-do-not-use-in-prod"


def _token(sub: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": sub, "iss": "tonus-web", "aud": "tonus-api",
              "iat": now, "exp": now + timedelta(hours=1)}
    return jwt.encode(payload, TEST_SECRET, algorithm="HS256")


def _auth(sub: str) -> dict:
    return {"Authorization": f"Bearer {_token(sub)}"}


def _seed(doc_id: str, user_id: str, data: bytes = b"data", kind: str = "csv",
          filename: str = "report.csv"):
    vault.get_vault().put(doc_id, data, kind, user_id, filename=filename)


# --------------------------------- auth gate --------------------------------

def test_list_requires_auth(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    resp = client.get("/api/my/documents")
    assert resp.status_code == 401
    assert resp.json()["detail"] == {"code": "auth_required", "message": "Требуется вход в систему."}


def test_delete_requires_auth(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    resp = client.delete("/api/my/documents/whatever")
    assert resp.status_code == 401
    assert resp.json()["detail"] == {"code": "auth_required", "message": "Требуется вход в систему."}


# ------------------------------ ownership matrix -----------------------------

def test_list_returns_only_own_documents(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    _seed("d1", "user-a")
    _seed("d2", "user-a")
    _seed("b1", "user-b")

    resp = client.get("/api/my/documents", headers=_auth("user-a"))
    assert resp.status_code == 200, resp.text
    ids = {row["doc_id"] for row in resp.json()["documents"]}
    assert ids == {"d1", "d2"}


def test_delete_own_document_succeeds(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    _seed("owned", "user-a")

    resp = client.delete("/api/my/documents/owned", headers=_auth("user-a"))
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"deleted": "owned"}
    assert vault.get_vault().get("owned", "user-a") is None


def test_cannot_delete_another_users_document(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    _seed("b-owned", "user-b")

    resp = client.delete("/api/my/documents/b-owned", headers=_auth("user-a"))
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Документ не найден."
    # B's document survives untouched.
    assert vault.get_vault().get("b-owned", "user-b") is not None


def test_delete_nonexistent_document_is_404(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    resp = client.delete("/api/my/documents/does-not-exist", headers=_auth("user-a"))
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Документ не найден."


def test_delete_is_idempotent_via_the_endpoint(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    _seed("d1", "user-a")

    first = client.delete("/api/my/documents/d1", headers=_auth("user-a"))
    assert first.status_code == 200
    second = client.delete("/api/my/documents/d1", headers=_auth("user-a"))
    assert second.status_code == 404  # already gone — never a 500


# ---------------------------------- projection --------------------------------

def test_projection_fields(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    _seed("p1", "user-a", data=b"1234567890", kind="pdf", filename="Баланс.pdf")

    resp = client.get("/api/my/documents", headers=_auth("user-a"))
    assert resp.status_code == 200, resp.text
    row = resp.json()["documents"][0]
    assert row["doc_id"] == "p1"
    assert row["filename"] == "Баланс.pdf"
    assert row["kind"] == "pdf"
    assert row["size_bytes"] == 10
    assert row["created_at"]


def test_list_empty_for_a_user_with_no_documents(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    resp = client.get("/api/my/documents", headers=_auth("user-fresh"))
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"documents": []}


def test_list_orders_newest_first(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    _seed("old", "user-a")
    _seed("new", "user-a")

    resp = client.get("/api/my/documents", headers=_auth("user-a"))
    rows = resp.json()["documents"]
    assert {row["doc_id"] for row in rows} == {"old", "new"}
    created_ats = [row["created_at"] for row in rows]
    assert created_ats == sorted(created_ats, reverse=True)


# ------------------------- available regardless of VAULT_ENABLED ------------

def test_list_and_delete_work_even_when_vault_disabled(monkeypatch):
    """A user must always be able to see/delete their own already-retained
    documents, even if a founder later turns VAULT_ENABLED off for new
    uploads — see app/services/vault.py's module docstring for why these
    two endpoints don't check vault_enabled()."""
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    monkeypatch.delenv("VAULT_ENABLED", raising=False)
    _seed("d1", "user-a")

    resp = client.get("/api/my/documents", headers=_auth("user-a"))
    assert resp.status_code == 200
    assert len(resp.json()["documents"]) == 1

    deleted = client.delete("/api/my/documents/d1", headers=_auth("user-a"))
    assert deleted.status_code == 200


# --------------------------- VaultBackendError handling ---------------------
# A real backend failure (R2 credentials, an outage) must never reach the
# caller as a raw 500 — list degrades quietly to "no documents" (a read of
# the user's own data, same posture as the VaultPathError branch above);
# delete surfaces an honest 503 rather than silently claiming "not found"
# or "deleted" for something that may still exist.

class _BrokenVault:
    def list_for_user(self, user_id):
        raise vault.VaultBackendError("simulated R2 outage")

    def delete(self, doc_id, user_id):
        raise vault.VaultBackendError("simulated R2 outage")


def test_list_degrades_to_empty_on_vault_backend_error(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    monkeypatch.setattr(vault, "get_vault", lambda: _BrokenVault())

    resp = client.get("/api/my/documents", headers=_auth("user-a"))
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"documents": []}


def test_delete_returns_503_on_vault_backend_error(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    monkeypatch.setattr(vault, "get_vault", lambda: _BrokenVault())

    resp = client.delete("/api/my/documents/d1", headers=_auth("user-a"))
    assert resp.status_code == 503, resp.text
    assert resp.json()["detail"]["code"] == "vault_unavailable"
