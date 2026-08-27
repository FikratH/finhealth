"""entitlements: plan/status/usage tracking (enforcement off)

Revision ID: 0002_entitlements
Revises: 0001_initial
Create Date: 2026-08-27

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_entitlements"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "entitlements",
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("plan", sa.Text(), nullable=False, server_default="free"),
        sa.Column("status", sa.Text(), nullable=False, server_default="active"),
        sa.Column("analyses_used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("provider", sa.Text(), nullable=True),
        sa.Column("provider_sub_id", sa.Text(), nullable=True),
        sa.Column("current_period_end", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("user_id"),
    )


def downgrade() -> None:
    op.drop_table("entitlements")
