"""Document vault (P5.T7) — opt-in retention of the user's own uploaded
financial statement, keyed to their account.

Two backends behind one interface (`VaultStore`, a `Protocol`):
`LocalDiskVault` writes to `apps/api/.data/vault/` (gitignored) and is what
runs whenever R2 isn't configured — the working default in dev, and a
functional (if non-durable-across-redeploys) fallback in any environment
that hasn't set up Cloudflare R2 yet. `R2Vault` speaks the S3 API (boto3)
against R2's S3-compatible endpoint and is coded + unit-tested against a
stubbed/moto client, but UNTESTED-LIVE — no real R2 account exists yet (see
docs/founder-todo.md's R2 entry).

Backend selection (`get_vault()`) is purely about which storage medium is
available: R2Vault whenever all four `R2_*` env vars are set, LocalDiskVault
otherwise. Whether the *feature* is offered at all — main.py's
`POST /api/upload` accepting `retain=1` — is a separate switch,
`vault_enabled()` (env `VAULT_ENABLED=1`), checked only on that one write
path. Reading and deleting a user's own already-retained documents
(`GET`/`DELETE /api/my/documents...`) is deliberately NOT gated by
`VAULT_ENABLED`: a user must always be able to see and remove their own
retained data even if a founder later flips the feature off for new
uploads — see main.py's endpoints for where this split is applied.

Both backends store one small JSON sidecar per document alongside the raw
bytes (`{doc_id}.meta.json`) holding the metadata the storage medium
doesn't give for free (original filename, retention timestamp) — a
deliberately parallel structure across both backends so they're easy to
reason about side by side, and so `list_for_user` never needs a per-object
metadata round trip beyond reading that one small file/object.

Path-traversal safety: every `user_id`/`doc_id` this module receives is
validated by `_require_safe` before it touches a filesystem path or S3 key
— `user_id` originates from a cryptographically verified JWT `sub` claim
and `doc_id` is always server-generated (`uuid4().hex`, see main.py), but
both are validated anyway rather than trusted by provenance alone (defense
in depth: a future caller passing an unvalidated id must fail closed, not
silently walk outside the per-user directory/prefix).
"""
from __future__ import annotations

import json
import logging
import os
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Protocol

log = logging.getLogger("finhealth.vault")

_API_ROOT = Path(__file__).resolve().parent.parent.parent  # apps/api
DEFAULT_VAULT_DIR = _API_ROOT / ".data" / "vault"

_META_SUFFIX = ".meta.json"


class VaultPathError(ValueError):
    """A `user_id`/`doc_id` failed path-safety validation. Always treat as
    "not found" at the HTTP boundary — never let the raw exception surface,
    and never distinguish it from a genuine miss (see main.py's handlers)."""


def _safe_component(value: str) -> bool:
    """True iff `value` is safe to use as one filesystem path segment or one
    S3 key segment: non-empty, no path separators, no `.`/`..` traversal,
    restricted to the character set real ids actually use (alphanumerics,
    `-`, `_`) — deliberately narrower than "everything but `/`", since
    nothing legitimate needs punctuation here (uuid4().hex and typical auth
    provider user ids are both already within this set)."""
    if not value or value in (".", ".."):
        return False
    return all(c.isalnum() or c in "-_" for c in value)


def _require_safe(user_id: str, doc_id: Optional[str] = None) -> None:
    if not _safe_component(user_id):
        raise VaultPathError("unsafe user_id")
    if doc_id is not None and not _safe_component(doc_id):
        raise VaultPathError("unsafe doc_id")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class VaultDocument:
    """Metadata for one retained document. Never carries the raw bytes —
    `VaultStore.get()` returns those separately."""
    doc_id: str
    user_id: str
    kind: str            # pdf | xlsx | xls | csv — see main._detect_kind
    filename: str
    size_bytes: int
    created_at: str       # ISO 8601, UTC


class VaultStore(Protocol):
    def put(self, doc_id: str, data: bytes, kind: str, user_id: str,
            filename: str = "") -> VaultDocument: ...

    def get(self, doc_id: str, user_id: str) -> Optional[tuple[bytes, VaultDocument]]: ...

    def delete(self, doc_id: str, user_id: str) -> bool: ...

    def list_for_user(self, user_id: str) -> list[VaultDocument]: ...


class LocalDiskVault:
    """Default vault backend: one subdirectory per user under `base_dir`,
    two files per retained document — `{doc_id}.{kind}` (raw bytes) and
    `{doc_id}.meta.json` (the `VaultDocument`, as JSON). Directory scoping
    (`base_dir/user_id/...`) plus `_require_safe` together are what keep one
    user's `list_for_user`/`get`/`delete` from ever touching another user's
    files — every method validates before building a path."""

    def __init__(self, base_dir: Path = DEFAULT_VAULT_DIR):
        self.base_dir = base_dir

    def _user_dir(self, user_id: str, *, create: bool = False) -> Path:
        _require_safe(user_id)
        d = self.base_dir / user_id
        if create:
            d.mkdir(parents=True, exist_ok=True)
        return d

    def _read_meta(self, user_dir: Path, doc_id: str) -> Optional[VaultDocument]:
        meta_path = user_dir / f"{doc_id}{_META_SUFFIX}"
        try:
            raw = json.loads(meta_path.read_text(encoding="utf-8"))
            return VaultDocument(**raw)
        except (OSError, json.JSONDecodeError, TypeError):
            return None

    def put(self, doc_id: str, data: bytes, kind: str, user_id: str,
            filename: str = "") -> VaultDocument:
        _require_safe(user_id, doc_id)
        user_dir = self._user_dir(user_id, create=True)
        (user_dir / f"{doc_id}.{kind}").write_bytes(data)
        doc = VaultDocument(doc_id=doc_id, user_id=user_id, kind=kind,
                            filename=filename, size_bytes=len(data),
                            created_at=_now_iso())
        (user_dir / f"{doc_id}{_META_SUFFIX}").write_text(
            json.dumps(asdict(doc), ensure_ascii=False), encoding="utf-8")
        return doc

    def get(self, doc_id: str, user_id: str) -> Optional[tuple[bytes, VaultDocument]]:
        _require_safe(user_id, doc_id)
        user_dir = self._user_dir(user_id)
        doc = self._read_meta(user_dir, doc_id)
        if doc is None:
            return None
        try:
            return (user_dir / f"{doc_id}.{doc.kind}").read_bytes(), doc
        except OSError:
            return None

    def delete(self, doc_id: str, user_id: str) -> bool:
        """Idempotent: a doc_id that isn't (or is no longer) present simply
        returns False rather than raising — calling this twice in a row is
        always safe, the second call just reports "nothing to do"."""
        _require_safe(user_id, doc_id)
        user_dir = self._user_dir(user_id)
        doc = self._read_meta(user_dir, doc_id)
        if doc is None:
            return False
        (user_dir / f"{doc_id}.{doc.kind}").unlink(missing_ok=True)
        (user_dir / f"{doc_id}{_META_SUFFIX}").unlink(missing_ok=True)
        return True

    def list_for_user(self, user_id: str) -> list[VaultDocument]:
        user_dir = self._user_dir(user_id)
        if not user_dir.is_dir():
            return []
        docs = []
        for meta_path in user_dir.glob(f"*{_META_SUFFIX}"):
            doc_id = meta_path.name[: -len(_META_SUFFIX)]
            doc = self._read_meta(user_dir, doc_id)
            if doc is not None:
                docs.append(doc)
        docs.sort(key=lambda d: d.created_at, reverse=True)
        return docs


class R2Vault:
    """boto3 S3-compatible backend for Cloudflare R2. Coded + unit-tested
    against moto's stubbed S3 (tests/test_vault.py); UNTESTED-LIVE — no real
    R2 account/credentials exist yet (see docs/founder-todo.md). Mirrors
    LocalDiskVault's on-disk shape as an S3 key layout: `{user_id}/{doc_id}.
    {kind}` for the raw bytes, `{user_id}/{doc_id}.meta.json` for the
    `VaultDocument` metadata — deliberately the same two-object-per-document
    structure, so filenames (which may be Cyrillic — RSBU statements
    routinely are) go into the JSON body rather than S3 object Metadata
    headers, sidestepping any HTTP-header ASCII/encoding concerns entirely.
    """

    def __init__(self, bucket: str, endpoint_url: str, access_key_id: str,
                secret_access_key: str, region_name: str = "auto"):
        import boto3  # imported lazily: only when R2Vault is actually selected
        self._bucket = bucket
        self._client = boto3.client(
            "s3", endpoint_url=endpoint_url,
            aws_access_key_id=access_key_id, aws_secret_access_key=secret_access_key,
            region_name=region_name,
        )

    def _data_key(self, user_id: str, doc_id: str, kind: str) -> str:
        _require_safe(user_id, doc_id)
        return f"{user_id}/{doc_id}.{kind}"

    def _meta_key(self, user_id: str, doc_id: str) -> str:
        _require_safe(user_id, doc_id)
        return f"{user_id}/{doc_id}{_META_SUFFIX}"

    def _get_object_or_none(self, key: str):
        from botocore.exceptions import ClientError
        try:
            return self._client.get_object(Bucket=self._bucket, Key=key)
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code")
            if code in ("NoSuchKey", "404"):
                return None
            raise

    def _read_meta(self, user_id: str, doc_id: str) -> Optional[VaultDocument]:
        resp = self._get_object_or_none(self._meta_key(user_id, doc_id))
        if resp is None:
            return None
        try:
            raw = json.loads(resp["Body"].read().decode("utf-8"))
            return VaultDocument(**raw)
        except (json.JSONDecodeError, TypeError, UnicodeDecodeError):
            return None

    def put(self, doc_id: str, data: bytes, kind: str, user_id: str,
            filename: str = "") -> VaultDocument:
        doc = VaultDocument(doc_id=doc_id, user_id=user_id, kind=kind,
                            filename=filename, size_bytes=len(data),
                            created_at=_now_iso())
        self._client.put_object(
            Bucket=self._bucket, Key=self._data_key(user_id, doc_id, kind), Body=data)
        self._client.put_object(
            Bucket=self._bucket, Key=self._meta_key(user_id, doc_id),
            Body=json.dumps(asdict(doc), ensure_ascii=False).encode("utf-8"),
            ContentType="application/json")
        return doc

    def get(self, doc_id: str, user_id: str) -> Optional[tuple[bytes, VaultDocument]]:
        doc = self._read_meta(user_id, doc_id)
        if doc is None:
            return None
        resp = self._get_object_or_none(self._data_key(user_id, doc_id, doc.kind))
        if resp is None:
            return None
        return resp["Body"].read(), doc

    def delete(self, doc_id: str, user_id: str) -> bool:
        doc = self._read_meta(user_id, doc_id)
        if doc is None:
            return False
        self._client.delete_object(Bucket=self._bucket, Key=self._data_key(user_id, doc_id, doc.kind))
        self._client.delete_object(Bucket=self._bucket, Key=self._meta_key(user_id, doc_id))
        return True

    def list_for_user(self, user_id: str) -> list[VaultDocument]:
        _require_safe(user_id)
        docs = []
        prefix = f"{user_id}/"
        paginator = self._client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self._bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                if not key.endswith(_META_SUFFIX):
                    continue
                doc_id = key[len(prefix): -len(_META_SUFFIX)]
                doc = self._read_meta(user_id, doc_id)
                if doc is not None:
                    docs.append(doc)
        docs.sort(key=lambda d: d.created_at, reverse=True)
        return docs


def _env_bool(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes", "on")


def vault_enabled() -> bool:
    """Whether `POST /api/upload`'s `retain=1` is offered at all (env
    `VAULT_ENABLED`, default off). Independent of `get_vault()`'s backend
    choice — LocalDiskVault works with no configuration, so this flag is
    purely about whether the product offers retention today, not about
    backend readiness. NOT checked by the read/delete endpoints — see the
    module docstring."""
    return _env_bool("VAULT_ENABLED")


def get_vault() -> VaultStore:
    """Selects the active backend: `R2Vault` when all four `R2_*` env vars
    are present, `LocalDiskVault` otherwise. A partially-configured
    environment (e.g. `R2_BUCKET` set but not the credentials) falls back to
    `LocalDiskVault` rather than constructing a client that would fail on
    first use — R2Vault is UNTESTED-LIVE, so failing soft here matters more
    than failing loud."""
    bucket = os.environ.get("R2_BUCKET")
    account_id = os.environ.get("R2_ACCOUNT_ID")
    access_key = os.environ.get("R2_ACCESS_KEY_ID")
    secret_key = os.environ.get("R2_SECRET_ACCESS_KEY")
    if bucket and account_id and access_key and secret_key:
        return R2Vault(
            bucket=bucket,
            endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
            access_key_id=access_key, secret_access_key=secret_key,
        )
    # `base_dir=DEFAULT_VAULT_DIR` is a call-time lookup of the module
    # global, not `LocalDiskVault()`'s own bind-at-import-time default —
    # deliberately, so tests can `monkeypatch.setattr(vault,
    # "DEFAULT_VAULT_DIR", tmp_path)` and have it actually take effect here
    # (a bare `LocalDiskVault()` would keep resolving to the original path
    # baked into the class's default argument at module-import time).
    return LocalDiskVault(base_dir=DEFAULT_VAULT_DIR)
