"""waitlist: Pro waitlist capture (pre-payments launch stance, P6.T6)

Revision ID: 0003_waitlist
Revises: 0002_entitlements
Create Date: 2026-08-28

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003_waitlist"
down_revision: Union[str, None] = "0002_entitlements"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "waitlist",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=True),
        sa.Column("created_at", sa.Text(), nullable=False),
        sa.Column("source", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_waitlist_email", "waitlist", ["email"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_waitlist_email", table_name="waitlist")
    op.drop_table("waitlist")
