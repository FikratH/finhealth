"""Entitlements substrate (P5.T5): plan/status/usage tracking per the
schema sketched in docs/payments-plan.md.

Launch decision: this ships enforcement-OFF. `require_entitlement()` reports
what enforcement WOULD decide so the logic is unit-tested end to end, but
no endpoint calls it yet — everyone gets full access while the product is
behind a Pro waitlist (see docs/payments-plan.md's "Pre-payments launch
stance"). Wiring it into POST /api/analyze (and any future Pro-gated
endpoint) is a later, deliberate change, not implied by this module
existing.

Table: registered on `storage.metadata` (not a private MetaData here) so
alembic/env.py's `target_metadata` — imported once from `app.storage` —
stays a complete picture of the schema, same as the `analyses` table.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import Column, Integer, Table, Text, select, update
from sqlalchemy.exc import IntegrityError

from . import storage

FREE_ANALYSES_LIMIT = 2

entitlements = Table(
    "entitlements",
    storage.metadata,
    Column("user_id", Text, primary_key=True),
    Column("plan", Text, nullable=False, server_default="free"),
    Column("status", Text, nullable=False, server_default="active"),
    Column("analyses_used", Integer, nullable=False, server_default="0"),
    Column("provider", Text, nullable=True),
    Column("provider_sub_id", Text, nullable=True),
    Column("current_period_end", Text, nullable=True),
)


def _row_to_dict(row) -> dict:
    return {
        "user_id": row.user_id,
        "plan": row.plan,
        "status": row.status,
        "analyses_used": row.analyses_used,
        "provider": row.provider,
        "provider_sub_id": row.provider_sub_id,
        "current_period_end": row.current_period_end,
    }


def get_or_create(user_id: str) -> dict:
    """Returns the user's entitlements row, creating a default
    free/active/0 row on first use. Idempotent.

    Select-then-insert rather than a dialect-specific upsert (sqlite and
    postgres spell ON CONFLICT differently, and storage.py already avoids
    that split — see its save_analysis docstring): two concurrent
    first-calls for the same brand-new user both miss the select, both
    attempt the insert, and the primary-key collision on the loser comes
    back as an IntegrityError rather than a corrupted row — caught below
    and resolved by re-selecting, so the loser still returns the winner's
    row instead of raising.
    """
    engine = storage.get_engine()
    with engine.connect() as conn:
        row = conn.execute(
            select(entitlements).where(entitlements.c.user_id == user_id)
        ).fetchone()
    if row is not None:
        return _row_to_dict(row)

    try:
        with engine.begin() as conn:
            conn.execute(entitlements.insert().values(
                user_id=user_id, plan="free", status="active", analyses_used=0,
                provider=None, provider_sub_id=None, current_period_end=None))
    except IntegrityError:
        pass  # lost the create race; the re-select below picks up the winner's row

    with engine.connect() as conn:
        row = conn.execute(
            select(entitlements).where(entitlements.c.user_id == user_id)
        ).fetchone()
    return _row_to_dict(row)


def increment_analyses(user_id: str) -> None:
    """Atomic `UPDATE ... SET analyses_used = analyses_used + 1` for one
    authenticated analysis. Assumes the row already exists — callers
    (main.py's analyze()) call get_or_create() first. A missing row is a
    silent no-op rather than an error: the caller already treats
    entitlements bookkeeping as best-effort (see its own try/except), so
    there is no second layer worth raising here."""
    engine = storage.get_engine()
    with engine.begin() as conn:
        conn.execute(
            update(entitlements)
            .where(entitlements.c.user_id == user_id)
            .values(analyses_used=entitlements.c.analyses_used + 1)
        )


def require_entitlement(user_id: str, feature: str) -> tuple[bool, Optional[str]]:
    """Reports what enforcement WOULD decide for (user_id, feature) as
    (allowed, reason) — reason is None when allowed, else a stable
    machine-readable code. NOT wired to any endpoint (enforcement is off
    for launch; see module docstring).

    - plan != 'free' (i.e. 'pro'): always allowed.
    - plan == 'free', feature == 'analyze': allowed while
      analyses_used < FREE_ANALYSES_LIMIT, else ("free_limit_reached").
    - any other feature name: allowed. Permissive by default rather than
      fail-closed, because nothing calls this yet — a typo'd or
      not-yet-modeled feature name can only ever fail to protect something
      (harmless today), never silently lock out a real user, which matters
      once this DOES get wired up and callers pass real feature names.
    """
    row = get_or_create(user_id)
    if row["plan"] != "free":
        return True, None
    if feature == "analyze":
        if row["analyses_used"] < FREE_ANALYSES_LIMIT:
            return True, None
        return False, "free_limit_reached"
    return True, None
