"""Optional JWT auth — Bearer token verification, never a hard requirement.

The API and the web app (apps/web, Better Auth) share one HS256 secret
(`AUTH_JWT_SECRET`) and one claims contract: `iss="tonus-web"`,
`aud="tonus-api"`, `sub` = user id, `exp` required and validated. This
module only *reads* that contract; it never issues tokens.

`get_current_user_id` is the optional-auth primitive: anonymous requests
must keep working unchanged, so it NEVER raises — a missing header, a
missing/misconfigured secret, or any validation failure (expired, garbage,
wrong issuer/audience) all collapse to the same "no user" result. Endpoints
that actually require a signed-in user use `require_user`, which is the
only place a 401 is raised, with a stable machine-readable code so the
frontend and future endpoints (P5.T4 history, T5 entitlements) can rely on
it without leaking *why* auth failed (no secret configured vs. bad token
are indistinguishable from the caller's side, by design).
"""
from __future__ import annotations

import logging
import os

import jwt
from fastapi import HTTPException, Request

log = logging.getLogger("finhealth.auth")

JWT_ALGORITHM = "HS256"
JWT_ISSUER = "tonus-web"
JWT_AUDIENCE = "tonus-api"


def get_current_user_id(request: Request) -> str | None:
    """Returns the authenticated user's id (the JWT `sub` claim), or None
    for every anonymous/invalid case. Never raises."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    token = auth_header[len("Bearer "):].strip()
    if not token:
        return None

    secret = os.environ.get("AUTH_JWT_SECRET")
    if not secret:
        # Auth features are off entirely when the secret isn't configured —
        # every request is anonymous, never a crash (Global Constraint).
        return None

    try:
        claims = jwt.decode(
            token, secret, algorithms=[JWT_ALGORITHM],
            issuer=JWT_ISSUER, audience=JWT_AUDIENCE,
            # PyJWT only validates exp/sub when the claim is present; without
            # `require`, a token minted without an exp claim would be
            # accepted forever, contradicting the "exp is always validated"
            # claims contract.
            options={"require": ["exp", "sub"]},
        )
    except jwt.PyJWTError as e:
        log.debug("jwt rejected: %s", e)
        return None

    sub = claims.get("sub")
    if not isinstance(sub, str) or not sub:
        log.debug("jwt accepted but sub claim missing/invalid")
        return None
    return sub


def require_user(request: Request) -> str:
    """FastAPI dependency for endpoints that need a signed-in user. Raises
    401 with a stable {code, message} body when no valid user is present —
    used by future endpoints (P5.T4+); POST /api/analyze stays optional and
    calls get_current_user_id directly instead."""
    user_id = get_current_user_id(request)
    if user_id is None:
        raise HTTPException(status_code=401, detail={
            "code": "auth_required",
            "message": "Требуется вход в систему.",
        })
    return user_id
