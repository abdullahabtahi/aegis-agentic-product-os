"""Async repository — thin persistence layer for agent pipeline writes.

Uses SQLAlchemy Core (not ORM) for speed. Pydantic models in models/schema.py
are the canonical types — this layer handles dict → SQL mapping only.

Design: every function is self-contained with its own session. Agents call
these from after_agent_callback or inline. No shared transaction state.

Graceful degradation: if DB is not configured, all writes are no-ops
(logged to session state only). Reads return empty results.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import text

from db.engine import get_session, is_db_configured

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return str(uuid.uuid4())


# ─────────────────────────────────────────────
# BET SNAPSHOTS
# ─────────────────────────────────────────────

async def save_bet_snapshot(snapshot: dict) -> str | None:
    """Persist a BetSnapshot dict to bet_snapshots table. Returns ID or None."""
    if not is_db_configured():
        return None
    try:
        async with get_session() as session:
            await session.execute(
                text("""
                    INSERT INTO bet_snapshots (
                        id, bet_id, captured_at, period_start, period_end,
                        linear_signals, health_score, risk_types_present,
                        status, error_code, hypothesis_staleness_days,
                        hypothesis_experiment_count, last_experiment_outcome,
                        similar_bet_outcome_pct, outcome_pattern_source_count
                    ) VALUES (
                        :id, :bet_id, :captured_at, :period_start, :period_end,
                        :linear_signals::jsonb, :health_score, :risk_types_present,
                        :status, :error_code, :hypothesis_staleness_days,
                        :hypothesis_experiment_count, :last_experiment_outcome,
                        :similar_bet_outcome_pct, :outcome_pattern_source_count
                    )
                """),
                {
                    "id": snapshot.get("id", _new_id()),
                    "bet_id": snapshot["bet_id"],
                    "captured_at": snapshot["captured_at"],
                    "period_start": snapshot["period_start"],
                    "period_end": snapshot["period_end"],
                    "linear_signals": _json_str(snapshot.get("linear_signals", {})),
                    "health_score": snapshot.get("health_score", 0.0),
                    "risk_types_present": snapshot.get("risk_types_present", []),
                    "status": snapshot.get("status", "ok"),
                    "error_code": snapshot.get("error_code"),
                    "hypothesis_staleness_days": snapshot.get("hypothesis_staleness_days"),
                    "hypothesis_experiment_count": snapshot.get("hypothesis_experiment_count", 0),
                    "last_experiment_outcome": snapshot.get("last_experiment_outcome"),
                    "similar_bet_outcome_pct": snapshot.get("similar_bet_outcome_pct"),
                    "outcome_pattern_source_count": snapshot.get("outcome_pattern_source_count", 0),
                },
            )
        return snapshot.get("id")
    except Exception as exc:
        logger.warning("Failed to save bet_snapshot: %s", exc)
        return None


# ─────────────────────────────────────────────
# AGENT TRACES
# ─────────────────────────────────────────────

async def save_agent_trace(trace: dict) -> str | None:
    """Persist an AgentTrace dict. Returns ID or None."""
    if not is_db_configured():
        return None
    try:
        trace_id = trace.get("id", _new_id())
        async with get_session() as session:
            await session.execute(
                text("""
                    INSERT INTO agent_traces (
                        id, workspace_id, trace_type, agent_name,
                        input_context_hash, output_summary, output_ids,
                        classification_rationale, heuristic_version_id,
                        eval_score, eval_rubric, human_accepted,
                        latency_ms, created_at
                    ) VALUES (
                        :id, :workspace_id, :trace_type, :agent_name,
                        :input_context_hash, :output_summary, :output_ids,
                        :classification_rationale, :heuristic_version_id,
                        :eval_score, :eval_rubric, :human_accepted,
                        :latency_ms, :created_at
                    )
                """),
                {
                    "id": trace_id,
                    "workspace_id": trace["workspace_id"],
                    "trace_type": trace["trace_type"],
                    "agent_name": trace["agent_name"],
                    "input_context_hash": trace["input_context_hash"],
                    "output_summary": trace.get("output_summary", ""),
                    "output_ids": trace.get("output_ids", []),
                    "classification_rationale": trace.get("classification_rationale"),
                    "heuristic_version_id": trace["heuristic_version_id"],
                    "eval_score": trace.get("eval_score"),
                    "eval_rubric": trace.get("eval_rubric"),
                    "human_accepted": trace.get("human_accepted"),
                    "latency_ms": trace.get("latency_ms", 0),
                    "created_at": trace.get("created_at", _now_iso()),
                },
            )
        return trace_id
    except Exception as exc:
        logger.warning("Failed to save agent_trace: %s", exc)
        return None


# ─────────────────────────────────────────────
# POLICY DENIED EVENTS
# ─────────────────────────────────────────────

async def save_policy_denied_event(
    bet_id: str,
    intervention_id: str,
    denial_reason: str,
) -> str | None:
    """Persist a PolicyDeniedEvent. Returns ID or None."""
    if not is_db_configured():
        return None
    try:
        event_id = _new_id()
        async with get_session() as session:
            await session.execute(
                text("""
                    INSERT INTO policy_denied_events (id, bet_id, intervention_id, denial_reason, created_at)
                    VALUES (:id, :bet_id, :intervention_id, :denial_reason, :created_at)
                """),
                {
                    "id": event_id,
                    "bet_id": bet_id,
                    "intervention_id": intervention_id,
                    "denial_reason": denial_reason,
                    "created_at": _now_iso(),
                },
            )
        return event_id
    except Exception as exc:
        logger.warning("Failed to save policy_denied_event: %s", exc)
        return None


# ─────────────────────────────────────────────
# INTERVENTIONS
# ─────────────────────────────────────────────

async def save_intervention(intervention: dict) -> str | None:
    """Persist an Intervention dict. Returns ID or None."""
    if not is_db_configured():
        return None
    try:
        int_id = intervention.get("id", _new_id())
        async with get_session() as session:
            await session.execute(
                text("""
                    INSERT INTO interventions (
                        id, risk_signal_id, bet_id, workspace_id,
                        action_type, escalation_level, title, rationale,
                        product_principle_refs, confidence,
                        proposed_linear_action, blast_radius,
                        status, created_at
                    ) VALUES (
                        :id, :risk_signal_id, :bet_id, :workspace_id,
                        :action_type, :escalation_level, :title, :rationale,
                        :product_principle_refs, :confidence,
                        :proposed_linear_action::jsonb, :blast_radius::jsonb,
                        :status, :created_at
                    )
                """),
                {
                    "id": int_id,
                    "risk_signal_id": intervention.get("risk_signal_id"),
                    "bet_id": intervention["bet_id"],
                    "workspace_id": intervention.get("workspace_id", ""),
                    "action_type": intervention["action_type"],
                    "escalation_level": intervention.get("escalation_level", 1),
                    "title": intervention.get("title", ""),
                    "rationale": intervention.get("rationale", ""),
                    "product_principle_refs": intervention.get("product_principle_refs", []),
                    "confidence": intervention.get("confidence", 0.0),
                    "proposed_linear_action": _json_str(intervention.get("proposed_linear_action")),
                    "blast_radius": _json_str(intervention.get("blast_radius")),
                    "status": intervention.get("status", "pending"),
                    "created_at": intervention.get("created_at", _now_iso()),
                },
            )
        return int_id
    except Exception as exc:
        logger.warning("Failed to save intervention: %s", exc)
        return None


async def update_intervention_status(
    intervention_id: str,
    status: str,
    decided_at: str | None = None,
    rejection_reason: str | None = None,
    founder_note: str | None = None,
) -> bool:
    """Update intervention status after founder decision. Returns success."""
    if not is_db_configured():
        return False
    try:
        async with get_session() as session:
            await session.execute(
                text("""
                    UPDATE interventions
                    SET status = :status,
                        decided_at = :decided_at,
                        rejection_reason = :rejection_reason,
                        founder_note = :founder_note
                    WHERE id = :id
                """),
                {
                    "id": intervention_id,
                    "status": status,
                    "decided_at": decided_at or _now_iso(),
                    "rejection_reason": rejection_reason,
                    "founder_note": founder_note,
                },
            )
        return True
    except Exception as exc:
        logger.warning("Failed to update intervention %s: %s", intervention_id, exc)
        return False


# ─────────────────────────────────────────────
# READS — for Governor + Coordinator context
# ─────────────────────────────────────────────

async def get_recent_interventions(
    bet_id: str,
    limit: int = 20,
) -> list[dict]:
    """Get recent interventions for a bet (newest first). For Governor policy checks."""
    if not is_db_configured():
        return []
    try:
        async with get_session() as session:
            result = await session.execute(
                text("""
                    SELECT id, action_type, escalation_level, status,
                           rejection_reason, created_at, decided_at
                    FROM interventions
                    WHERE bet_id = :bet_id
                    ORDER BY created_at DESC
                    LIMIT :limit
                """),
                {"bet_id": bet_id, "limit": limit},
            )
            return [dict(row._mapping) for row in result]
    except Exception as exc:
        logger.warning("Failed to read interventions for bet %s: %s", bet_id, exc)
        return []


async def count_agent_traces(workspace_id: str) -> int:
    """Count total agent traces for a workspace. For AutoResearch trigger threshold."""
    if not is_db_configured():
        return 0
    try:
        async with get_session() as session:
            result = await session.execute(
                text("SELECT COUNT(*) FROM agent_traces WHERE workspace_id = :wid"),
                {"wid": workspace_id},
            )
            return result.scalar() or 0
    except Exception as exc:
        logger.warning("Failed to count traces for workspace %s: %s", workspace_id, exc)
        return 0


async def get_workspace_intervention_stats(workspace_id: str) -> dict:
    """Get acceptance/rejection counts for a workspace. For Coordinator calibration."""
    if not is_db_configured():
        return {"accepted": 0, "rejected": 0}
    try:
        async with get_session() as session:
            result = await session.execute(
                text("""
                    SELECT
                        COUNT(*) FILTER (WHERE status = 'accepted') AS accepted,
                        COUNT(*) FILTER (WHERE status = 'rejected') AS rejected
                    FROM interventions
                    WHERE workspace_id = :wid
                """),
                {"wid": workspace_id},
            )
            row = result.one()
            return {"accepted": row.accepted or 0, "rejected": row.rejected or 0}
    except Exception as exc:
        logger.warning("Failed to read intervention stats: %s", exc)
        return {"accepted": 0, "rejected": 0}


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def _json_str(obj: dict | list | None) -> str | None:
    """Serialize to JSON string for JSONB columns. None → None."""
    if obj is None:
        return None
    import json
    return json.dumps(obj)
