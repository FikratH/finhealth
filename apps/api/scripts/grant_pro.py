#!/usr/bin/env python3
"""Manual Pro grant for pilot users (pre-payments launch stance — see
docs/payments-plan.md). Usage:

    python scripts/grant_pro.py <user_id>

Runs against DATABASE_URL if set, otherwise the default sqlite DB_PATH —
same resolution as the running app (app.storage.database_url()). Prints the
entitlements row before and after so the operator can confirm the grant.
"""
from __future__ import annotations

import sys
from pathlib import Path

# Make `app` importable regardless of the cwd this script is invoked from.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import update  # noqa: E402

from app import entitlements, storage  # noqa: E402


def grant_pro(user_id: str) -> None:
    before = entitlements.get_or_create(user_id)
    print(f"before: {before}")

    engine = storage.get_engine()
    with engine.begin() as conn:
        conn.execute(
            update(entitlements.entitlements)
            .where(entitlements.entitlements.c.user_id == user_id)
            .values(plan="pro")
        )

    after = entitlements.get_or_create(user_id)
    print(f"after:  {after}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: python scripts/grant_pro.py <user_id>", file=sys.stderr)
        sys.exit(1)
    grant_pro(sys.argv[1])
