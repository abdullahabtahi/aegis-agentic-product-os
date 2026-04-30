"""Add boardroom_sessions, boardroom_turns, boardroom_verdicts tables.

Revision ID: 004
Revises: 003
Create Date: 2026-04-30

Tables:
  boardroom_sessions  — one record per boardroom session; rate-limited to 1 active per workspace
  boardroom_turns     — individual speaker turns captured during a session
  boardroom_verdicts  — ADK-generated structured verdict produced after session ends
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ─────────────────────────────────────────────
    # boardroom_sessions
    # ─────────────────────────────────────────────
    op.create_table(
        "boardroom_sessions",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("workspace_id", sa.Text(), nullable=False),
        sa.Column("bet_id", sa.Text(), nullable=True),
        sa.Column("decision_question", sa.Text(), nullable=False),
        sa.Column("key_assumption", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="active"),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "ended_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("status IN ('active', 'completed')", name="ck_boardroom_sessions_status"),
    )
    op.create_index(
        "ix_boardroom_sessions_workspace_id",
        "boardroom_sessions",
        ["workspace_id"],
    )
    op.create_index(
        "ix_boardroom_sessions_bet_id",
        "boardroom_sessions",
        ["bet_id"],
    )
    # Partial index for rate-limit check: at most 1 active session per workspace
    op.create_index(
        "ix_boardroom_sessions_workspace_active",
        "boardroom_sessions",
        ["workspace_id"],
        postgresql_where=sa.text("status = 'active'"),
    )

    # ─────────────────────────────────────────────
    # boardroom_turns
    # ─────────────────────────────────────────────
    op.create_table(
        "boardroom_turns",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("session_id", sa.Text(), nullable=False),
        sa.Column("speaker", sa.Text(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("sequence_number", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["boardroom_sessions.id"],
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "speaker IN ('user', 'bear', 'bull', 'sage')",
            name="ck_boardroom_turns_speaker",
        ),
    )
    op.create_index(
        "ix_boardroom_turns_session_id",
        "boardroom_turns",
        ["session_id"],
    )
    op.create_index(
        "ix_boardroom_turns_session_sequence",
        "boardroom_turns",
        ["session_id", "sequence_number"],
    )

    # ─────────────────────────────────────────────
    # boardroom_verdicts
    # ─────────────────────────────────────────────
    op.create_table(
        "boardroom_verdicts",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("session_id", sa.Text(), nullable=False),
        sa.Column("bet_id", sa.Text(), nullable=True),
        sa.Column("confidence_score", sa.Integer(), nullable=False),
        sa.Column("recommendation", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("key_risks", sa.JSON(), nullable=False),
        sa.Column("next_experiments", sa.JSON(), nullable=False),
        sa.Column("bear_assessment", sa.Text(), nullable=True),
        sa.Column("bull_assessment", sa.Text(), nullable=True),
        sa.Column("sage_assessment", sa.Text(), nullable=True),
        sa.Column("sage_voice_summary", sa.Text(), nullable=True),
        sa.Column("intervention_id", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["boardroom_sessions.id"],
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "confidence_score BETWEEN 0 AND 100",
            name="ck_boardroom_verdicts_confidence",
        ),
        sa.CheckConstraint(
            "recommendation IN ('proceed', 'pause', 'pivot')",
            name="ck_boardroom_verdicts_recommendation",
        ),
    )
    op.create_index(
        "ix_boardroom_verdicts_session_id",
        "boardroom_verdicts",
        ["session_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_boardroom_verdicts_session_id", table_name="boardroom_verdicts")
    op.drop_table("boardroom_verdicts")

    op.drop_index("ix_boardroom_turns_session_sequence", table_name="boardroom_turns")
    op.drop_index("ix_boardroom_turns_session_id", table_name="boardroom_turns")
    op.drop_table("boardroom_turns")

    op.drop_index("ix_boardroom_sessions_workspace_active", table_name="boardroom_sessions")
    op.drop_index("ix_boardroom_sessions_bet_id", table_name="boardroom_sessions")
    op.drop_index("ix_boardroom_sessions_workspace_id", table_name="boardroom_sessions")
    op.drop_table("boardroom_sessions")
