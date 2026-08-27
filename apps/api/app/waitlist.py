"""Pro waitlist substrate (P6.T6): pre-payments launch capture per
docs/payments-plan.md's "Pre-payments launch stance" — `POST /api/waitlist`
records an email (optionally attributed to a signed-in user, via the same
optional-auth primitive `/api/analyze` uses) so the founder can reach out
once Paddle billing lands (v1.1). No email is ever sent from here; export is
a manual query the founder runs by hand (see docs/founder-todo.md).

Table: registered on `storage.metadata` (not a private MetaData here), same
convention as app/entitlements.py, so alembic/env.py's `target_metadata` —
imported once from `app.storage` — stays a complete picture of the schema.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Column, Index, Table, Text, select
from sqlalchemy.exc import IntegrityError

from . import storage

waitlist = Table(
    "waitlist",
    storage.metadata,
    Column("id", Text, primary_key=True),
    Column("email", Text, nullable=False),
    Column("user_id", Text, nullable=True),
    Column("created_at", Text, nullable=False),
    Column("source", Text, nullable=True),
)
Index("ix_waitlist_email", waitlist.c.email, unique=True)


def _normalize_email(email: str) -> str:
    """The dedup key: lowercased, stripped. RFC 5321 technically allows a
    case-sensitive local part, but no real mailbox provider observes that
    in practice — treating `Founder@x.com` and `founder@x.com` as two rows
    would silently double-count the same person and, worse, tell the
    second signup "you're in" when they already were, under a different
    case, which is exactly the non-idempotent behavior the endpoint
    contract rules out. The stored `email` column holds this normalized
    form, never the visitor's original casing."""
    return email.strip().lower()


def join(email: str, *, user_id: Optional[str], source: str) -> bool:
    """Records `email` on the waitlist if it isn't there yet. Returns
    True if this call created the row (a genuinely new signup), False if
    the (normalized) email already existed — the idempotent signal
    `POST /api/waitlist` reports back as `{status: "joined"|"already_joined"}`,
    always a 200 either way.

    Select-then-insert, not a dialect-specific upsert — same reasoning as
    entitlements.get_or_create: sqlite and postgres spell ON CONFLICT
    differently, and this stays portable rather than splitting on dialect.
    A concurrent duplicate submission (two requests for the same email
    landing at once) loses the insert race to an IntegrityError on the
    unique index, caught below and reported as "already joined" rather
    than propagating a 500 for what is, from the caller's perspective, a
    perfectly normal outcome."""
    normalized = _normalize_email(email)
    engine = storage.get_engine()
    with engine.connect() as conn:
        existing = conn.execute(
            select(waitlist.c.id).where(waitlist.c.email == normalized)
        ).fetchone()
    if existing is not None:
        return False

    try:
        with engine.begin() as conn:
            conn.execute(waitlist.insert().values(
                id=uuid.uuid4().hex, email=normalized, user_id=user_id,
                created_at=datetime.now(timezone.utc).isoformat(), source=source))
        return True
    except IntegrityError:
        return False  # lost the create race to a concurrent identical signup
