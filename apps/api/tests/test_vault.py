"""Document vault (P5.T7): LocalDiskVault against a real tmp_path, R2Vault
against moto's stubbed S3 — both exercised through the exact same `VaultStore`
contract so the two backends are provably interchangeable. Also covers
path-traversal rejection and get_vault()/vault_enabled() backend selection.
"""
from __future__ import annotations

from pathlib import Path

import boto3
import pytest
from moto import mock_aws

from app.services import vault
from app.services.vault import LocalDiskVault, R2Vault, VaultBackendError, VaultPathError


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


@pytest.mark.parametrize("bad_kind", ["../escape", "csv/../../etc", "a/b", ".."])
def test_put_rejects_unsafe_kind(store, bad_kind):
    """`kind` is the other half of every path/key this module builds
    (`f"{doc_id}.{kind}"`) — validated the same as user_id/doc_id, per the
    module's own "validated anyway, not trusted by provenance" stance."""
    with pytest.raises(VaultPathError):
        store.put("doc1", b"data", bad_kind, "user-a")


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


# --------------------------------------------------------------------------
# get_vault() caching (Finding 4): the same config must not rebuild a
# fresh boto3 client (or a fresh LocalDiskVault) on every call.
# --------------------------------------------------------------------------

def test_get_vault_returns_the_same_local_instance_across_calls(monkeypatch, tmp_path):
    monkeypatch.setattr(vault, "DEFAULT_VAULT_DIR", tmp_path / "vault")
    first = vault.get_vault()
    second = vault.get_vault()
    assert first is second


def test_get_vault_returns_a_fresh_instance_when_the_local_dir_changes(monkeypatch, tmp_path):
    monkeypatch.setattr(vault, "DEFAULT_VAULT_DIR", tmp_path / "a")
    first = vault.get_vault()
    monkeypatch.setattr(vault, "DEFAULT_VAULT_DIR", tmp_path / "b")
    second = vault.get_vault()
    assert first is not second


def test_get_vault_returns_the_same_r2_instance_and_client_across_calls(monkeypatch):
    monkeypatch.setenv("R2_BUCKET", "b")
    monkeypatch.setenv("R2_ACCOUNT_ID", "acct")
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "key")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "secret")
    first = vault.get_vault()
    second = vault.get_vault()
    assert first is second
    assert first._client is second._client  # the expensive part never rebuilds


def test_get_vault_returns_a_fresh_r2_instance_when_credentials_change(monkeypatch):
    monkeypatch.setenv("R2_BUCKET", "b")
    monkeypatch.setenv("R2_ACCOUNT_ID", "acct")
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "key-one")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "secret")
    first = vault.get_vault()
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "key-two")
    second = vault.get_vault()
    assert first is not second


# --------------------------------------------------------------------------
# R2Vault: a non-404 ClientError becomes VaultBackendError, never a raw
# botocore exception (Finding 3's root cause, one layer down).
# --------------------------------------------------------------------------

class _FailingS3Client:
    """A stand-in for a boto3 S3 client that always fails with a real
    (non-404) service error — simulates bad credentials, a missing bucket,
    or an outage without needing a live R2 account."""

    def __init__(self, code: str = "AccessDenied"):
        from botocore.exceptions import ClientError
        self._error = ClientError(
            {"Error": {"Code": code, "Message": "nope"}}, "GetObject")

    def get_object(self, **kwargs):
        raise self._error

    def put_object(self, **kwargs):
        raise self._error

    def delete_object(self, **kwargs):
        raise self._error

    def get_paginator(self, name):
        error = self._error

        class _Paginator:
            def paginate(self, **kwargs):
                raise error

        return _Paginator()


def _r2_with_failing_client() -> R2Vault:
    store = R2Vault(bucket="b", endpoint_url="https://example.test",
                    access_key_id="k", secret_access_key="s")
    store._client = _FailingS3Client()
    return store


def test_r2_get_raises_vault_backend_error_on_non_404_client_error():
    store = _r2_with_failing_client()
    with pytest.raises(VaultBackendError):
        store.get("doc1", "user-a")


def test_r2_put_raises_vault_backend_error_on_non_404_client_error():
    store = _r2_with_failing_client()
    with pytest.raises(VaultBackendError):
        store.put("doc1", b"data", "csv", "user-a")


def test_r2_delete_raises_vault_backend_error_when_lookup_fails():
    store = _r2_with_failing_client()
    with pytest.raises(VaultBackendError):
        store.delete("doc1", "user-a")


def test_r2_list_for_user_raises_vault_backend_error_on_non_404_client_error():
    store = _r2_with_failing_client()
    with pytest.raises(VaultBackendError):
        store.list_for_user("user-a")


def test_r2_get_returns_none_on_genuine_404_not_vault_backend_error():
    """The existing not-found path must still be silent — only a REAL
    backend error becomes VaultBackendError."""
    store = R2Vault(bucket="b", endpoint_url="https://example.test",
                    access_key_id="k", secret_access_key="s")
    store._client = _FailingS3Client(code="NoSuchKey")
    assert store.get("doc1", "user-a") is None


# --------------------------------------------------------------------------
# R2Vault: connection-class failures (BotoCoreError, NOT ClientError) must
# translate the same way (close-wave F1). ClientError means "the request
# reached S3/R2 and it sent back a real error response" (bad credentials,
# missing bucket, throttling); BotoCoreError is the sibling branch for
# everything that means the request never got a response at all — an
# actual R2 outage (the exact scenario T7's original finding named) raises
# EndpointConnectionError, a BotoCoreError subclass, not a ClientError.
# --------------------------------------------------------------------------

class _ConnectionFailingS3Client:
    """A stand-in for a boto3 S3 client that can't reach the endpoint at
    all — simulates an R2 outage or a network partition, distinct from
    _FailingS3Client's "reached the service, got an error response"."""

    def __init__(self):
        from botocore.exceptions import EndpointConnectionError
        self._error = EndpointConnectionError(endpoint_url="https://example.test")

    def get_object(self, **kwargs):
        raise self._error

    def put_object(self, **kwargs):
        raise self._error

    def delete_object(self, **kwargs):
        raise self._error

    def get_paginator(self, name):
        error = self._error

        class _Paginator:
            def paginate(self, **kwargs):
                raise error

        return _Paginator()


def _r2_with_connection_failure() -> R2Vault:
    store = R2Vault(bucket="b", endpoint_url="https://example.test",
                    access_key_id="k", secret_access_key="s")
    store._client = _ConnectionFailingS3Client()
    return store


def test_r2_get_raises_vault_backend_error_on_endpoint_connection_error():
    store = _r2_with_connection_failure()
    with pytest.raises(VaultBackendError):
        store.get("doc1", "user-a")


def test_r2_put_raises_vault_backend_error_on_endpoint_connection_error():
    store = _r2_with_connection_failure()
    with pytest.raises(VaultBackendError):
        store.put("doc1", b"data", "csv", "user-a")


def test_r2_delete_raises_vault_backend_error_on_endpoint_connection_error():
    # _read_meta (a get_object call) fails first — the exact same
    # connection failure a real outage would hit before any delete_object
    # is even attempted.
    store = _r2_with_connection_failure()
    with pytest.raises(VaultBackendError):
        store.delete("doc1", "user-a")


def test_r2_list_for_user_raises_vault_backend_error_on_endpoint_connection_error():
    store = _r2_with_connection_failure()
    with pytest.raises(VaultBackendError):
        store.list_for_user("user-a")


# --------------------------------------------------------------------------
# R2Vault.get: a connection death WHILE STREAMING THE BODY — after the
# initial get_object call already succeeded — must also translate to
# VaultBackendError, not a raw botocore exception (P6.T5 review, parked
# Info: resp["Body"].read() previously sat outside the ClientError/
# BotoCoreError translation both _FailingS3Client and
# _ConnectionFailingS3Client above exercise only at the get_object() call
# itself, never at the body read one step later — the exact gap a real
# mid-download R2 outage would hit, and the one this download endpoint
# depends on landing in a 503, not a raw 500).
# --------------------------------------------------------------------------

class _MidStreamFailingBody:
    """Stands in for a botocore StreamingBody whose connection dies WHILE
    `.read()` is in flight — the metadata fetch and the initial
    `get_object()` call for the data object both already succeeded; only
    the actual byte transfer fails."""

    def read(self):
        from botocore.exceptions import EndpointConnectionError
        raise EndpointConnectionError(endpoint_url="https://example.test")


class _MidStreamFailingS3Client:
    """get_object() always succeeds and returns a real, readable Body for
    the small JSON metadata sidecar; the DATA object's Body raises on
    read() instead — isolating the failure to exactly the `.read()` this
    test targets, not the request that opens the stream."""

    def get_object(self, Bucket, Key):
        import json
        from io import BytesIO
        if Key.endswith(".meta.json"):
            payload = json.dumps({
                "doc_id": "doc1", "user_id": "user-a", "kind": "csv",
                "filename": "f.csv", "size_bytes": 4,
                "created_at": "2026-01-01T00:00:00+00:00",
            }).encode("utf-8")
            return {"Body": BytesIO(payload)}
        return {"Body": _MidStreamFailingBody()}


def test_r2_get_raises_vault_backend_error_when_body_read_fails_mid_stream():
    store = R2Vault(bucket="b", endpoint_url="https://example.test",
                    access_key_id="k", secret_access_key="s")
    store._client = _MidStreamFailingS3Client()
    with pytest.raises(VaultBackendError):
        store.get("doc1", "user-a")


# --------------------------------------------------------------------------
# R2Vault._read_meta: a connection death WHILE READING THE SIDECAR ITSELF
# (P6.T5 review round 1, Finding 1) — _read_meta's own Body.read() sat
# outside the ClientError/BotoCoreError translation, so every one of its
# callers (get(), delete(), list_for_user() — once per object) could 500
# instead of degrading to the 503 envelope the download/delete endpoints
# depend on. Distinct from the block above, which failed the DATA object's
# body read; this fails the METADATA sidecar's read, which all three
# methods hit FIRST — before any of them gets far enough to touch a data
# object at all.
# --------------------------------------------------------------------------

class _MidStreamFailingMetaS3Client:
    """get_object() always succeeds at the request level, for every key —
    but the returned Body always raises on read(). Isolates the failure to
    exactly _read_meta's own read, since every caller reaches it before
    (or, for get()/delete(), instead of) any data-object request."""

    def get_object(self, Bucket, Key):
        return {"Body": _MidStreamFailingBody()}

    def get_paginator(self, name):
        class _Paginator:
            def paginate(self, **kwargs):
                # One meta key on the page — enough for list_for_user to
                # reach _read_meta("doc1") and hit the failing Body.read().
                return [{"Contents": [{"Key": "user-a/doc1.meta.json"}]}]

        return _Paginator()


def _r2_with_meta_read_failure() -> R2Vault:
    store = R2Vault(bucket="b", endpoint_url="https://example.test",
                    access_key_id="k", secret_access_key="s")
    store._client = _MidStreamFailingMetaS3Client()
    return store


def test_r2_get_raises_vault_backend_error_when_meta_body_read_fails_mid_stream():
    store = _r2_with_meta_read_failure()
    with pytest.raises(VaultBackendError):
        store.get("doc1", "user-a")


def test_r2_delete_raises_vault_backend_error_when_meta_body_read_fails_mid_stream():
    store = _r2_with_meta_read_failure()
    with pytest.raises(VaultBackendError):
        store.delete("doc1", "user-a")


def test_r2_list_for_user_raises_vault_backend_error_when_meta_body_read_fails_mid_stream():
    store = _r2_with_meta_read_failure()
    with pytest.raises(VaultBackendError):
        store.list_for_user("user-a")


# --------------------------------------------------------------------------
# LocalDiskVault.delete: a genuine OSError (not "already gone") also
# becomes VaultBackendError, matching R2Vault's posture.
# --------------------------------------------------------------------------

def test_local_vault_delete_raises_vault_backend_error_on_os_error(tmp_path, monkeypatch):
    store = LocalDiskVault(base_dir=tmp_path / "vault")
    store.put("doc1", b"data", "csv", "user-a")

    def _raise_permission_error(self, missing_ok=False):
        raise PermissionError("simulated read-only filesystem")

    monkeypatch.setattr(Path, "unlink", _raise_permission_error)
    with pytest.raises(VaultBackendError):
        store.delete("doc1", "user-a")


# --------------------------------------------------------------------------
# LocalDiskVault.get(): same OSError split as delete() (P6.T5 review round
# 1, S2). By the time get() reads the data file, _read_meta has already
# succeeded — the document is known to exist — so a genuine OSError there
# (PermissionError, a read-only filesystem, a full disk) must not report
# "not found" for something just confirmed present; it becomes
# VaultBackendError, same as delete(). FileNotFoundError specifically (a
# torn write / partial delete leaving the sidecar but not the data file)
# is the one case that legitimately still means "not found."
# --------------------------------------------------------------------------

def test_local_vault_get_returns_none_when_data_file_is_missing_but_meta_exists(tmp_path):
    store = LocalDiskVault(base_dir=tmp_path / "vault")
    store.put("doc1", b"data", "csv", "user-a")
    (tmp_path / "vault" / "user-a" / "doc1.csv").unlink()  # sidecar survives, data file doesn't

    assert store.get("doc1", "user-a") is None


def test_local_vault_get_raises_vault_backend_error_on_os_error(tmp_path, monkeypatch):
    store = LocalDiskVault(base_dir=tmp_path / "vault")
    store.put("doc1", b"data", "csv", "user-a")

    def _raise_permission_error(self):
        raise PermissionError("simulated read-only filesystem")

    monkeypatch.setattr(Path, "read_bytes", _raise_permission_error)
    with pytest.raises(VaultBackendError):
        store.get("doc1", "user-a")


# --------------------------------------------------------------------------
# LocalDiskVault: UnicodeDecodeError parity with R2Vault's _read_meta.
# --------------------------------------------------------------------------

def test_local_vault_read_meta_survives_invalid_utf8_sidecar(tmp_path):
    store = LocalDiskVault(base_dir=tmp_path / "vault")
    store.put("doc1", b"data", "csv", "user-a")
    meta_path = tmp_path / "vault" / "user-a" / "doc1.meta.json"
    meta_path.write_bytes(b"\xff\xfe not valid utf-8 json")

    assert store.get("doc1", "user-a") is None
    assert store.list_for_user("user-a") == []
    assert store.delete("doc1", "user-a") is False
