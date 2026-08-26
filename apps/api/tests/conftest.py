"""Test isolation: every test runs against a throwaway DB and upload dir."""
import pytest


@pytest.fixture(autouse=True)
def _isolated_storage(tmp_path, monkeypatch):
    from app import storage
    monkeypatch.setattr(storage, "DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setattr(storage, "UPLOAD_DIR", tmp_path / "uploads")
    yield
