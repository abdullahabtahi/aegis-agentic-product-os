"""Add suppression_rules table.

Revision ID: 003
Revises: 002
Create Date: 2026-04-29

suppression_rules records a founder's decision to stop Aegis suggesting a
specific (risk_type, action_type) pair after repeated rejections.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "suppression_rules",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("workspace_id", sa.Text(), nullable=False),
        sa.Column("risk_type", sa.Text(), nullable=False),
        sa.Column("action_type", sa.Text(), nullable=False),
        sa.Column("rejection_reason", sa.Text(), nullable=False),
        sa.Column(
            "suppressed_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "suppressed_until",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_suppression_rules_workspace_id",
        "suppression_rules",
        ["workspace_id"],
    )
    op.create_index(
        "ix_suppression_rules_workspace_risk_action",
        "suppression_rules",
        ["workspace_id", "risk_type", "action_type"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_suppression_rules_workspace_risk_action",
        table_name="suppression_rules",
    )
    op.drop_index(
        "ix_suppression_rules_workspace_id",
        table_name="suppression_rules",
    )
    op.drop_table("suppression_rules")
