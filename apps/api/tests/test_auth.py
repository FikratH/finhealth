"""Optional JWT auth (apps/api/app/auth.py): HS256 verification that never
raises for POST /api/analyze (anonymous stays anonymous, not a 500), plus
require_user's 401 contract for future auth-gated endpoints (P5.T4+).

tests/conftest.py's autouse fixture deletes AUTH_JWT_SECRET before every
test, so "secret absent" is the default and each test here opts into a
secret explicitly via monkeypatch.setenv.
"""
from __future__ import annotations

import copy
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import select
from starlette.requests import Request

from app import auth, storage
from app.main import app

client = TestClient(app)
DEMO = Path(__file__).resolve().parent.parent / "demo" / "demo_company.csv"

TEST_SECRET = "test-only-secret-do-not-use-in-prod"


def _token(secret=TEST_SECRET, sub="user-1", iss="tonus-web", aud="tonus-api",
          exp_delta=timedelta(hours=1), **extra_claims):
    now = datetime.now(timezone.utc)
    payload = {"sub": sub, "iss": iss, "aud": aud, "iat": now, "exp": now + exp_delta}
    payload.update(extra_claims)
    return jwt.encode(payload, secret, algorithm="HS256")


def _request(header_value: str | None) -> Request:
    headers = [(b"authorization", header_value.encode())] if header_value else []
    return Request({"type": "http", "headers": headers})


# --------------------------- get_current_user_id (unit) --------------------

def test_no_header_is_anonymous(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    assert auth.get_current_user_id(_request(None)) is None


def test_non_bearer_header_is_anonymous(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    assert auth.get_current_user_id(_request("Basic abc123")) is None


def test_valid_token_returns_sub(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    token = _token(sub="user-42")
    assert auth.get_current_user_id(_request(f"Bearer {token}")) == "user-42"


def test_expired_token_is_anonymous(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    token = _token(exp_delta=timedelta(seconds=-10))
    assert auth.get_current_user_id(_request(f"Bearer {token}")) is None


def test_garbage_token_is_anonymous(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    assert auth.get_current_user_id(_request("Bearer not-a-jwt-at-all")) is None


def test_wrong_audience_is_anonymous(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    token = _token(aud="some-other-api")
    assert auth.get_current_user_id(_request(f"Bearer {token}")) is None


def test_wrong_issuer_is_anonymous(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    token = _token(iss="some-other-web")
    assert auth.get_current_user_id(_request(f"Bearer {token}")) is None


def test_wrong_secret_is_anonymous(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    token = _token(secret="a-completely-different-secret-of-sufficient-length")
    assert auth.get_current_user_id(_request(f"Bearer {token}")) is None


def test_secret_absent_is_always_anonymous(monkeypatch):
    monkeypatch.delenv("AUTH_JWT_SECRET", raising=False)
    token = _token()  # well-formed, but the API has no secret to check it against
    assert auth.get_current_user_id(_request(f"Bearer {token}")) is None


def test_missing_sub_claim_is_anonymous(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {"iss": "tonus-web", "aud": "tonus-api", "iat": now, "exp": now + timedelta(hours=1)},
        TEST_SECRET, algorithm="HS256")
    assert auth.get_current_user_id(_request(f"Bearer {token}")) is None


# --------------------------------- require_user (unit) ---------------------

def test_require_user_401_when_anonymous(monkeypatch):
    monkeypatch.delenv("AUTH_JWT_SECRET", raising=False)
    with pytest.raises(HTTPException) as exc_info:
        auth.require_user(_request(None))
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == {"code": "auth_required", "message": "Требуется вход в систему."}


def test_require_user_returns_sub_when_valid(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    token = _token(sub="user-7")
    assert auth.require_user(_request(f"Bearer {token}")) == "user-7"


# ------------------------- POST /api/analyze (integration) -----------------

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


def _stored_user_id(analysis_id: str):
    engine = storage.get_engine()
    with engine.connect() as conn:
        row = conn.execute(
            select(storage.analyses.c.user_id).where(storage.analyses.c.id == analysis_id)
        ).fetchone()
    return row.user_id


def test_analyze_with_valid_token_stores_user_id(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    ex = _upload_and_extract()
    token = _token(sub="user-owner-1")
    resp = client.post("/api/analyze", json=_analysis_request(ex),
                       headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200, resp.text
    assert _stored_user_id(resp.json()["analysis_id"]) == "user-owner-1"


def test_analyze_without_token_stores_null_user_id(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    ex = _upload_and_extract()
    resp = client.post("/api/analyze", json=_analysis_request(ex))
    assert resp.status_code == 200, resp.text
    assert _stored_user_id(resp.json()["analysis_id"]) is None


@pytest.mark.parametrize("bad_header_name,make_header", [
    ("expired", lambda: f"Bearer {_token(exp_delta=timedelta(seconds=-10))}"),
    ("garbage", lambda: "Bearer not-a-jwt-at-all"),
    ("wrong_aud", lambda: f"Bearer {_token(aud='some-other-api')}"),
    ("wrong_iss", lambda: f"Bearer {_token(iss='some-other-web')}"),
])
def test_analyze_with_invalid_token_is_anonymous_not_500(monkeypatch, bad_header_name, make_header):
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_SECRET)
    ex = _upload_and_extract()
    resp = client.post("/api/analyze", json=_analysis_request(ex),
                       headers={"Authorization": make_header()})
    assert resp.status_code == 200, resp.text
    assert _stored_user_id(resp.json()["analysis_id"]) is None


def test_analyze_secret_absent_is_always_anonymous(monkeypatch):
    monkeypatch.delenv("AUTH_JWT_SECRET", raising=False)
    ex = _upload_and_extract()
    token = _token()  # would be accepted if the API had a secret configured
    resp = client.post("/api/analyze", json=_analysis_request(ex),
                       headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200, resp.text
    assert _stored_user_id(resp.json()["analysis_id"]) is None
