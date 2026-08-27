"""Document vault (P5.T7): LocalDiskVault against a real tmp_path, R2Vault
against moto's stubbed S3 — both exercised through the exact same `VaultStore`
contract so the two backends are provably interchangeable. Also covers
path-traversal rejection and get_vault()/vault_enabled() backend selection.
"""
from __future__ import annotations

import boto3
import pytest
from moto import mock_aws

from app.services import vault
from app.services.vault import LocalDiskVault, R2Vault, VaultPathError


# --------------------------------------------------------------------------
# Shared contract, parametrized over both backends
# --------------------------------------------------------------------------

@pytest.fixture
def local_vault(tmp_path):
    return LocalDiskVault(base_dir=tmp_path / "vault")


@pytest.fixture
def r2_vault():
    with mock_aws():
        # moto's `mock_aws()` decorator intercepts botocore requests by
        # recognizing standard AWS endpoint hostnames — it does NOT
        # intercept an arbitrary custom `endpoint_url` like R2's real
        # `https://<account>.r2.cloudflarestorage.com` (exercising that
        # would need moto's separate, much heavier `ThreadedMotoServer`
        # HTTP-server mode, not worth the dependency weight for a
        # UNTESTED-LIVE backend). So: construct R2Vault exactly as
        # production does (endpoint_url and all — proves that code path
        # builds without error), then swap in a client built against the
        # default AWS endpoint, which moto DOES intercept. Every other
        # line of R2Vault (key construction, JSON body handling,
        # pagination, ClientError→None translation) runs unmodified either
        # way — only the transport differs.
        store = R2Vault(
            bucket="tonus-vault-test",
            endpoint_url="https://test-account.r2.cloudflarestorage.com",
            access_key_id="test-key", secret_access_key="test-secret",
        )
        store._client = boto3.client("s3", region_name="us-east-1")
        store._client.create_bucket(Bucket="tonus-vault-test")
        yield store


@pytest.fixture(params=["local", "r2"])
def store(request, local_vault, r2_vault):
    return local_vault if request.param == "local" else r2_vault


def test_put_then_get_round_trips_bytes_and_metadata(store):
    doc = store.put("doc1", b"hello world", "csv", "user-a", filename="Баланс.csv")
    assert doc.doc_id == "doc1"
    assert doc.user_id == "user-a"
    assert doc.kind == "csv"
    assert doc.filename == "Баланс.csv"  # Cyrillic filename survives
    assert doc.size_bytes == len(b"hello world")
    assert doc.created_at  # non-empty ISO timestamp

    result = store.get("doc1", "user-a")
    assert result is not None
    data, meta = result
    assert data == b"hello world"
    assert meta == doc


def test_get_missing_doc_returns_none(store):
    assert store.get("does-not-exist", "user-a") is None


def test_get_wrong_user_returns_none(store):
    store.put("doc1", b"data", "pdf", "user-a")
    assert store.get("doc1", "user-b") is None


def test_delete_is_idempotent(store):
    store.put("doc1", b"data", "pdf", "user-a")
    assert store.delete("doc1", "user-a") is True
    assert store.delete("doc1", "user-a") is False  # already gone — no crash
    assert store.get("doc1", "user-a") is None


def test_delete_wrong_user_does_not_remove_owner_copy(store):
    store.put("doc1", b"data", "pdf", "user-a")
    assert store.delete("doc1", "user-b") is False
    assert store.get("doc1", "user-a") is not None


def test_list_for_user_scoped_and_newest_first(store):
    doc1 = store.put("doc1", b"a", "csv", "user-a", filename="one.csv")
    doc2 = store.put("doc2", b"b", "csv", "user-a", filename="two.csv")
    store.put("other", b"c", "csv", "user-b", filename="other.csv")

    docs = store.list_for_user("user-a")
    assert {d.doc_id for d in docs} == {"doc1", "doc2"}
    assert all(d.user_id == "user-a" for d in docs)
    # newest first by created_at
    assert docs[0].created_at >= docs[1].created_at
    del doc1, doc2  # silence unused (kept for readability of intent above)


def test_list_for_user_empty_when_no_documents(store):
    assert store.list_for_user("nobody-yet") == []


def test_no_cross_user_leakage_via_list(store):
    store.put("shared-name", b"a-data", "csv", "user-a")
    store.put("shared-name", b"b-data", "csv", "user-b")

    a_docs = store.list_for_user("user-a")
    b_docs = store.list_for_user("user-b")
    assert len(a_docs) == 1 and len(b_docs) == 1
    a_data, _ = store.get("shared-name", "user-a")
    b_data, _ = store.get("shared-name", "user-b")
    assert a_data == b"a-data"
    assert b_data == b"b-data"


# --------------------------------------------------------------------------
# Path-traversal safety (both backends validate identically via
# vault._require_safe — exercised directly here rather than per-backend,
# since the validation itself is backend-agnostic).
# --------------------------------------------------------------------------

@pytest.mark.parametrize("bad_user_id", ["../escape", "a/b", "..", ".", "", "a b", "user;id"])
def test_put_rejects_unsafe_user_id(store, bad_user_id):
    with pytest.raises(VaultPathError):
        store.put("doc1", b"data", "csv", bad_user_id)


@pytest.mark.parametrize("bad_doc_id", ["../escape", "a/b", "..", "."])
def test_put_rejects_unsafe_doc_id(store, bad_doc_id):
    with pytest.raises(VaultPathError):
        store.put(bad_doc_id, b"data", "csv", "user-a")


def test_get_rejects_unsafe_ids(store):
    with pytest.raises(VaultPathError):
        store.get("../escape", "user-a")
    with pytest.raises(VaultPathError):
        store.get("doc1", "../escape")


def test_delete_rejects_unsafe_ids(store):
    with pytest.raises(VaultPathError):
        store.delete("../escape", "user-a")


def test_list_rejects_unsafe_user_id(store):
    with pytest.raises(VaultPathError):
        store.list_for_user("../escape")


def test_local_vault_put_does_not_escape_base_dir(tmp_path):
    """Concrete proof for the local backend: even if validation were
    somehow bypassed, nothing under base_dir's parent gets touched. Here we
    confirm the *valid* path stays correctly scoped under base_dir/user_id."""
    base = tmp_path / "vault"
    store = LocalDiskVault(base_dir=base)
    store.put("doc1", b"data", "csv", "user-a")
    written = list(base.rglob("*"))
    assert all(str(base) in str(p) for p in written)
    assert (base / "user-a" / "doc1.csv").exists()
    assert (base / "user-a" / "doc1.meta.json").exists()


# --------------------------------------------------------------------------
# get_vault() / vault_enabled() selection
# --------------------------------------------------------------------------

def test_vault_enabled_false_by_default(monkeypatch):
    monkeypatch.delenv("VAULT_ENABLED", raising=False)
    assert vault.vault_enabled() is False


@pytest.mark.parametrize("value", ["1", "true", "True", "yes", "on"])
def test_vault_enabled_true_variants(monkeypatch, value):
    monkeypatch.setenv("VAULT_ENABLED", value)
    assert vault.vault_enabled() is True


def test_vault_enabled_false_variants(monkeypatch):
    monkeypatch.setenv("VAULT_ENABLED", "0")
    assert vault.vault_enabled() is False


def test_get_vault_defaults_to_local_disk(monkeypatch):
    for name in ("R2_BUCKET", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"):
        monkeypatch.delenv(name, raising=False)
    assert isinstance(vault.get_vault(), LocalDiskVault)


def test_get_vault_falls_back_to_local_when_r2_partially_configured(monkeypatch):
    monkeypatch.setenv("R2_BUCKET", "b")
    monkeypatch.setenv("R2_ACCOUNT_ID", "acct")
    monkeypatch.delenv("R2_ACCESS_KEY_ID", raising=False)
    monkeypatch.delenv("R2_SECRET_ACCESS_KEY", raising=False)
    assert isinstance(vault.get_vault(), LocalDiskVault)


def test_get_vault_selects_r2_when_fully_configured(monkeypatch):
    monkeypatch.setenv("R2_BUCKET", "b")
    monkeypatch.setenv("R2_ACCOUNT_ID", "acct")
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "key")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "secret")
    store = vault.get_vault()
    assert isinstance(store, R2Vault)
