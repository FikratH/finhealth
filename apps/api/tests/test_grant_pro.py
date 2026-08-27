"""scripts/grant_pro.py: manual pilot-user Pro grant (pre-payments launch
stance, see docs/payments-plan.md). Proves the script actually flips the
plan enforcement would key off — a free user at the analyses limit is
denied by require_entitlement() before the grant and allowed after."""
from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from grant_pro import grant_pro  # noqa: E402

from app import entitlements  # noqa: E402


def test_grant_pro_sets_plan_to_pro():
    entitlements.get_or_create("pilot-1")

    grant_pro("pilot-1")

    assert entitlements.get_or_create("pilot-1")["plan"] == "pro"


def test_grant_pro_flips_the_require_entitlement_verdict():
    entitlements.get_or_create("pilot-2")
    entitlements.increment_analyses("pilot-2")
    entitlements.increment_analyses("pilot-2")  # at the free-tier limit
    assert entitlements.require_entitlement("pilot-2", "analyze") == (False, "free_limit_reached")

    grant_pro("pilot-2")

    assert entitlements.require_entitlement("pilot-2", "analyze") == (True, None)


def test_grant_pro_works_when_no_row_exists_yet():
    """A pilot user who has never analyzed anything has no entitlements
    row yet — the grant must create one rather than silently no-op."""
    grant_pro("pilot-3")

    row = entitlements.get_or_create("pilot-3")
    assert row["plan"] == "pro"
