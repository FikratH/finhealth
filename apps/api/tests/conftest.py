"""Test isolation: every test runs against a throwaway DB and upload dir."""
import pytest


@pytest.fixture(autouse=True)
def _isolated_storage(tmp_path, monkeypatch):
    from app import storage
    from app.services import vault
    monkeypatch.setattr(storage, "DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setattr(storage, "UPLOAD_DIR", tmp_path / "uploads")
    # get_vault()'s local-disk fallback reads this at call time (see its own
    # comment) specifically so this monkeypatch works — without it, any
    # test exercising the default vault backend would write into the real
    # apps/api/.data/vault on the developer's/CI's disk.
    monkeypatch.setattr(vault, "DEFAULT_VAULT_DIR", tmp_path / "vault")
    # A developer's exported DATABASE_URL would otherwise win over DB_PATH
    # (see storage.database_url()) and break this isolation.
    monkeypatch.delenv("DATABASE_URL", raising=False)
    # Same concern for auth: a developer's exported AUTH_JWT_SECRET must not
    # leak into tests that assume auth is off by default.
    monkeypatch.delenv("AUTH_JWT_SECRET", raising=False)
    # And for the vault feature flag / R2 credentials: a developer's env
    # must not make an unrelated test suddenly see retain=1 as available or
    # route to a real R2 bucket.
    monkeypatch.delenv("VAULT_ENABLED", raising=False)
    for _r2_var in ("R2_BUCKET", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"):
        monkeypatch.delenv(_r2_var, raising=False)
    yield
