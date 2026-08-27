"""Opt-in document retention (P5.T7): POST /api/upload's `retain=1` form
field, honored by POST /api/extract on the success path only. The default
(retain absent) path must stay byte-identical to pre-T7 behavior — that's
the specific regression this file guards, alongside the vault/auth gating
and the "a failed extraction never retains" rule.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
from fastapi.testclient import TestClient

from app import storage
from app.main import app
from app.services import extraction, vault
from app.services.extraction import ScannedPdfError

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


def _upload_demo(data: dict | None = None, headers: dict | None = None):
    with open(DEMO, "rb") as f:
        return client.post(
            "/api/upload",
            files={"file": ("demo_company.csv", f, "text/csv")},
            data=data, headers=headers,
        )


def _raise_scanned_pdf_error(data: bytes, kind: str):
    """Module-level (picklable) stand-in for extraction.extract — runs in a
    spawned worker process (see tests/test_extract_pool.py's identical
    pattern), forcing POST /api/extract down its failure path so the
    retain-only-on-success rule can be proven, not just asserted."""
    raise ScannedPdfError("Похоже, это скан.")


# ------------------------------ retain=1 gating -----------------------------

def test_retain_without_auth_returns_401(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    monkeypatch.setenv("VAULT_ENABLED", "1")
    resp = _upload_demo(data={"retain": "1"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == {"code": "auth_required", "message": "Требуется вход в систему."}


def test_retain_without_vault_enabled_returns_503(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    resp = _upload_demo(data={"retain": "1"}, headers=_auth("user-a"))
    assert resp.status_code == 503
    assert resp.json()["detail"] == {
        "code": "vault_unavailable",
        "message": "Хранилище документов недоступно.",
    }


def test_retain_false_form_value_needs_neither_auth_nor_vault_flag():
    resp = _upload_demo(data={"retain": "0"})
    assert resp.status_code == 200


def test_retain_absent_needs_neither_auth_nor_vault_flag():
    resp = _upload_demo()
    assert resp.status_code == 200


# -------------------------------- success path -------------------------------

def test_retain_success_stores_in_vault_and_clears_ephemeral_upload(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    monkeypatch.setenv("VAULT_ENABLED", "1")

    up = _upload_demo(data={"retain": "1"}, headers=_auth("user-a"))
    assert up.status_code == 200, up.text
    upload_id = up.json()["upload_id"]

    # The ephemeral upload exists right after POST /api/upload, retain
    # sidecar and all — extract hasn't run yet.
    assert storage.read_upload(upload_id) is not None
    assert storage.read_upload_retain_meta(upload_id) == {
        "user_id": "user-a", "filename": "demo_company.csv"}

    ex = client.post("/api/extract", json={"upload_id": upload_id})
    assert ex.status_code == 200, ex.text

    # Ephemeral copy is gone either way (retain or not) — only the vault
    # keeps a persistent copy now.
    assert storage.read_upload(upload_id) is None

    docs = vault.get_vault().list_for_user("user-a")
    assert len(docs) == 1
    assert docs[0].filename == "demo_company.csv"
    assert docs[0].kind == "csv"
    data, meta = vault.get_vault().get(docs[0].doc_id, "user-a")
    assert data == DEMO.read_bytes()
    assert meta.user_id == "user-a"


def test_retain_success_visible_via_my_documents_endpoint(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    monkeypatch.setenv("VAULT_ENABLED", "1")

    up = _upload_demo(data={"retain": "1"}, headers=_auth("user-a"))
    upload_id = up.json()["upload_id"]
    client.post("/api/extract", json={"upload_id": upload_id})

    resp = client.get("/api/my/documents", headers=_auth("user-a"))
    assert resp.status_code == 200, resp.text
    docs = resp.json()["documents"]
    assert len(docs) == 1
    assert docs[0]["filename"] == "demo_company.csv"
    assert docs[0]["kind"] == "csv"
    assert docs[0]["size_bytes"] == DEMO.stat().st_size

    deleted = client.delete(f"/api/my/documents/{docs[0]['doc_id']}", headers=_auth("user-a"))
    assert deleted.status_code == 200, deleted.text
    assert deleted.json() == {"deleted": docs[0]["doc_id"]}

    resp2 = client.get("/api/my/documents", headers=_auth("user-a"))
    assert resp2.json()["documents"] == []


def test_retain_never_applies_on_a_failed_extraction(monkeypatch):
    """The success-only branch (main.extract's `else` clause) must never
    run when extraction raises — proven here by forcing a real failure
    (ScannedPdfError, in the spawned worker) with retain=1 + a signed-in
    user + VAULT_ENABLED=1 all present, then asserting the vault stays
    empty and the response is still the normal 422."""
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    monkeypatch.setenv("VAULT_ENABLED", "1")
    monkeypatch.setattr(extraction, "extract", _raise_scanned_pdf_error)

    up = _upload_demo(data={"retain": "1"}, headers=_auth("user-a"))
    upload_id = up.json()["upload_id"]

    ex = client.post("/api/extract", json={"upload_id": upload_id})
    assert ex.status_code == 422, ex.text

    assert vault.get_vault().list_for_user("user-a") == []
    # the exception path still deletes the ephemeral upload, same as ever
    assert storage.read_upload(upload_id) is None


def test_vault_put_failure_degrades_to_deleted_without_failing_extraction(monkeypatch):
    """Retention is opt-in and best-effort: a vault write failure on an
    otherwise-successful extraction must not turn a 200 into an error (see
    main.extract's own comment on this — "degrade to deleted-with-
    warning")."""
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    monkeypatch.setenv("VAULT_ENABLED", "1")

    class _BrokenVault:
        def put(self, *args, **kwargs):
            raise RuntimeError("disk full")

    monkeypatch.setattr(vault, "get_vault", lambda: _BrokenVault())

    up = _upload_demo(data={"retain": "1"}, headers=_auth("user-a"))
    upload_id = up.json()["upload_id"]

    ex = client.post("/api/extract", json={"upload_id": upload_id})
    assert ex.status_code == 200, ex.text  # extraction itself still succeeds
    assert storage.read_upload(upload_id) is None  # cleaned up as usual


# ------------------------- default-delete regression ------------------------

def test_retain_absent_default_delete_is_byte_identical_to_pre_t7(monkeypatch):
    """The exact regression the plan calls out: with retain never sent (not
    even "0"), upload -> extract must behave identically to every pre-T7
    test in test_api.py — 200, then a second extract on the same upload_id
    404s (the file really is gone), and nothing lands in any vault."""
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    monkeypatch.setenv("VAULT_ENABLED", "1")  # even with the feature ON

    up = _upload_demo(headers=_auth("user-a"))  # signed in, but no retain field at all
    assert up.status_code == 200, up.text
    upload_id = up.json()["upload_id"]
    assert storage.read_upload_retain_meta(upload_id) is None

    ex = client.post("/api/extract", json={"upload_id": upload_id})
    assert ex.status_code == 200, ex.text

    assert storage.read_upload(upload_id) is None
    second = client.post("/api/extract", json={"upload_id": upload_id})
    assert second.status_code == 404

    assert vault.get_vault().list_for_user("user-a") == []


def test_retain_absent_anonymous_default_delete_unchanged():
    """Same regression, fully anonymous (no auth header at all, VAULT_ENABLED
    unset) — the exact pre-T7 shape of the anonymous flow."""
    up = _upload_demo()
    assert up.status_code == 200, up.text
    upload_id = up.json()["upload_id"]

    ex = client.post("/api/extract", json={"upload_id": upload_id})
    assert ex.status_code == 200, ex.text
    assert storage.read_upload(upload_id) is None


def test_read_upload_retain_meta_survives_invalid_utf8_sidecar():
    """A corrupt (invalid-UTF-8) retain sidecar must degrade to "not
    retained," never raise — read_upload_retain_meta's own docstring
    promises "never raises," and UnicodeDecodeError is a sibling of
    json.JSONDecodeError (both ValueError), not covered by it."""
    upload_id = "a" * 32  # any well-formed (hex, 32-char) upload_id
    storage.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    meta_path = storage.UPLOAD_DIR / f"{upload_id}.retain.json"
    meta_path.write_bytes(b"\xff\xfe not valid utf-8")

    assert storage.read_upload_retain_meta(upload_id) is None
