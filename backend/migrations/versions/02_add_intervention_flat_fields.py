"""Add flat display columns to interventions table.

Revision ID: 002
Revises: 001
Create Date: 2026-04-08

These columns were referenced in list_interventions SQL but missing from the
initial schema (values were embedded inside proposed_linear_action JSON).
Making them first-class columns enables direct SQL projection and indexing.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "interventions",
        sa.Column("proposed_comment", sa.Text(), nullable=True),
    )
    op.add_column(
        "interventions",
        sa.Column("proposed_issue_title", sa.Text(), nullable=True),
    )
    op.add_column(
        "interventions",
        sa.Column("proposed_issue_description", sa.Text(), nullable=True),
    )
    op.add_column(
        "interventions",
        sa.Column(
            "requires_double_confirm",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )


def downgrade() -> None:
    op.drop_column("interventions", "requires_double_confirm")
    op.drop_column("interventions", "proposed_issue_description")
    op.drop_column("interventions", "proposed_issue_title")
    op.drop_column("interventions", "proposed_comment")
