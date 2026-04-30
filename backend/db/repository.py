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
                    "hypothesis_staleness_days": snapshot.get(
                        "hypothesis_staleness_days"
                    ),
                    "hypothesis_experiment_count": snapshot.get(
                        "hypothesis_experiment_count", 0
                    ),
                    "last_experiment_outcome": snapshot.get("last_experiment_outcome"),
                    "similar_bet_outcome_pct": snapshot.get("similar_bet_outcome_pct"),
                    "outcome_pattern_source_count": snapshot.get(
                        "outcome_pattern_source_count", 0
                    ),
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
                        proposed_comment, proposed_issue_title,
                        proposed_issue_description, requires_double_confirm,
                        status, created_at
                    ) VALUES (
                        :id, :risk_signal_id, :bet_id, :workspace_id,
                        :action_type, :escalation_level, :title, :rationale,
                        :product_principle_refs, :confidence,
                        :proposed_linear_action::jsonb, :blast_radius::jsonb,
                        :proposed_comment, :proposed_issue_title,
                        :proposed_issue_description, :requires_double_confirm,
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
                    "product_principle_refs": intervention.get(
                        "product_principle_refs", []
                    ),
                    "confidence": intervention.get("confidence", 0.0),
                    "proposed_linear_action": _json_str(
                        intervention.get("proposed_linear_action")
                    ),
                    "blast_radius": _json_str(intervention.get("blast_radius")),
                    "proposed_comment": intervention.get("proposed_comment"),
                    "proposed_issue_title": intervention.get("proposed_issue_title"),
                    "proposed_issue_description": intervention.get(
                        "proposed_issue_description"
                    ),
                    "requires_double_confirm": intervention.get(
                        "requires_double_confirm", False
                    ),
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
    """Update intervention status after founder decision. Returns success.

    Also updates the human_accepted field on the associated AgentTrace records
    to complete the feedback flywheel (data mining for AutoResearch).
    """
    if not is_db_configured():
        return False
    try:
        accepted = status == "accepted"
        async with get_session() as session:
            # 1. Update the intervention
            result = await session.execute(
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
            if result.rowcount == 0:
                return False

            # 2. Backfill human_accepted for tracing/eval feedback
            # Find the risk_signal_id linked to this intervention
            res = await session.execute(
                text("SELECT risk_signal_id FROM interventions WHERE id = :id"),
                {"id": intervention_id},
            )
            risk_id = res.scalar()
            if risk_id:
                # Update all traces associated with this risk_signal
                # Note: this assumes trace output_ids contains the risk_signal_id
                await session.execute(
                    text("""
                        UPDATE agent_traces
                        SET human_accepted = :accepted
                        WHERE :risk_id = ANY(output_ids)
                    """),
                    {"risk_id": risk_id, "accepted": accepted},
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


async def get_recent_interventions_for_workspace(
    workspace_id: str,
    limit: int = 10,
) -> list[dict]:
    """Get recent interventions across all bets for a workspace (newest first).
    Used by the conversational agent to report what actions Aegis has taken.
    """
    if not is_db_configured():
        return []
    try:
        async with get_session() as session:
            result = await session.execute(
                text("""
                    SELECT i.id, i.bet_id, i.action_type, i.escalation_level,
                           i.status, i.rationale, i.confidence,
                           i.created_at, i.decided_at,
                           b.name AS bet_name
                    FROM interventions i
                    LEFT JOIN bets b ON b.id = i.bet_id
                    WHERE i.workspace_id = :wid
                    ORDER BY i.created_at DESC
                    LIMIT :limit
                """),
                {"wid": workspace_id, "limit": limit},
            )
            return [dict(row._mapping) for row in result]
    except Exception as exc:
        logger.warning(
            "Failed to read interventions for workspace %s: %s", workspace_id, exc
        )
        return []


# ─────────────────────────────────────────────
# WORKSPACES
# ─────────────────────────────────────────────


async def upsert_workspace(workspace: dict) -> str | None:
    """Insert workspace if not exists (by id). Returns id or None."""
    if not is_db_configured():
        return workspace.get("id")
    try:
        ws_id = workspace.get("id", _new_id())
        async with get_session() as session:
            await session.execute(
                text("""
                    INSERT INTO workspaces (
                        id, linear_team_id, strategy_doc_refs, active_bet_ids,
                        control_level, github_repo, created_at
                    ) VALUES (
                        :id, :linear_team_id, :strategy_doc_refs, :active_bet_ids,
                        :control_level, :github_repo, :created_at
                    )
                    ON CONFLICT (id) DO NOTHING
                """),
                {
                    "id": ws_id,
                    "linear_team_id": workspace.get("linear_team_id", ""),
                    "strategy_doc_refs": workspace.get("strategy_doc_refs", []),
                    "active_bet_ids": workspace.get("active_bet_ids", []),
                    "control_level": workspace.get("control_level", "draft_only"),
                    "github_repo": workspace.get("github_repo"),
                    "created_at": workspace.get("created_at", _now_iso()),
                },
            )
        return ws_id
    except Exception as exc:
        logger.warning("Failed to upsert workspace: %s", exc)
        return None


async def update_workspace_control_level(
    workspace_id: str, control_level: str
) -> bool:
    """Update control_level on an existing workspace. Returns True on success."""
    if not is_db_configured():
        return False
    try:
        async with get_session() as session:
            await session.execute(
                text("""
                    INSERT INTO workspaces (id, linear_team_id, strategy_doc_refs, active_bet_ids, control_level, github_repo, created_at)
                    VALUES (:id, '', '{}', '{}', :control_level, NULL, :created_at)
                    ON CONFLICT (id) DO UPDATE SET control_level = :control_level
                """),
                {
                    "id": workspace_id,
                    "control_level": control_level,
                    "created_at": _now_iso(),
                },
            )
        return True
    except Exception as exc:
        logger.warning(
            "Failed to update control_level for workspace %s: %s", workspace_id, exc
        )
        return False


async def get_workspace(workspace_id: str) -> dict | None:
    """Fetch a workspace by id. Returns dict or None."""
    if not is_db_configured():
        return None
    try:
        async with get_session() as session:
            result = await session.execute(
                text("SELECT * FROM workspaces WHERE id = :id"),
                {"id": workspace_id},
            )
            row = result.mappings().first()
            return dict(row) if row else None
    except Exception as exc:
        logger.warning("Failed to get workspace %s: %s", workspace_id, exc)
        return None


# ─────────────────────────────────────────────
# BETS
# ─────────────────────────────────────────────


async def save_bet(bet: dict) -> str | None:
    """Persist a Bet dict. Returns id or None."""
    if not is_db_configured():
        return bet.get("id")
    try:
        bet_id = bet.get("id", _new_id())
        now = _now_iso()
        async with get_session() as session:
            await session.execute(
                text("""
                    INSERT INTO bets (
                        id, workspace_id, name, target_segment, problem_statement,
                        hypothesis, success_metrics, time_horizon,
                        declaration_source, declaration_confidence,
                        status, health_baseline, acknowledged_risks,
                        linear_project_ids, linear_issue_ids, doc_refs,
                        kill_criteria,
                        created_at, last_monitored_at
                    ) VALUES (
                        :id, :workspace_id, :name, :target_segment, :problem_statement,
                        :hypothesis, :success_metrics::jsonb, :time_horizon,
                        :declaration_source::jsonb, :declaration_confidence,
                        :status, :health_baseline::jsonb, :acknowledged_risks::jsonb,
                        :linear_project_ids, :linear_issue_ids, :doc_refs,
                        :kill_criteria::jsonb,
                        :created_at, :last_monitored_at
                    )
                """),
                {
                    "id": bet_id,
                    "workspace_id": bet["workspace_id"],
                    "name": bet["name"],
                    "target_segment": bet.get("target_segment", ""),
                    "problem_statement": bet.get("problem_statement", ""),
                    "hypothesis": bet.get("hypothesis", ""),
                    "success_metrics": _json_str(bet.get("success_metrics", [])),
                    "time_horizon": bet.get("time_horizon", ""),
                    "declaration_source": _json_str(
                        bet.get(
                            "declaration_source",
                            {
                                "type": "manual",
                                "raw_artifact_refs": [],
                            },
                        )
                    ),
                    "declaration_confidence": bet.get("declaration_confidence", 1.0),
                    "status": bet.get("status", "active"),
                    "health_baseline": _json_str(
                        bet.get(
                            "health_baseline",
                            {
                                "expected_bet_coverage_pct": 0.5,
                                "expected_weekly_velocity": 3,
                                "hypothesis_required": True,
                                "metric_linked_required": True,
                            },
                        )
                    ),
                    "acknowledged_risks": _json_str(bet.get("acknowledged_risks", [])),
                    "linear_project_ids": bet.get("linear_project_ids", []),
                    "linear_issue_ids": bet.get("linear_issue_ids", []),
                    "doc_refs": bet.get("doc_refs", []),
                    "kill_criteria": _json_str(bet.get("kill_criteria")),
                    "created_at": bet.get("created_at", now),
                    "last_monitored_at": bet.get("last_monitored_at", now),
                },
            )
            # Update workspace.active_bet_ids
            await session.execute(
                text("""
                    UPDATE workspaces
                    SET active_bet_ids = array_append(active_bet_ids, :bet_id)
                    WHERE id = :workspace_id
                    AND NOT (:bet_id = ANY(active_bet_ids))
                """),
                {"bet_id": bet_id, "workspace_id": bet["workspace_id"]},
            )
        return bet_id
    except Exception as exc:
        logger.warning("Failed to save bet: %s", exc)
        return None


async def list_bets(workspace_id: str, status: str | None = None) -> list[dict]:
    """List bets for a workspace, newest first. Optionally filter by status."""
    if not is_db_configured():
        return []
    try:
        async with get_session() as session:
            if status:
                result = await session.execute(
                    text("""
                        SELECT id, workspace_id, name, target_segment, problem_statement,
                               hypothesis, success_metrics, time_horizon, status,
                               declaration_source, declaration_confidence,
                               health_baseline, acknowledged_risks,
                               linear_project_ids, linear_issue_ids, doc_refs,
                               created_at, last_monitored_at, completed_at
                        FROM bets
                        WHERE workspace_id = :wid AND status = :status
                        ORDER BY created_at DESC
                    """),
                    {"wid": workspace_id, "status": status},
                )
            else:
                result = await session.execute(
                    text("""
                        SELECT id, workspace_id, name, target_segment, problem_statement,
                               hypothesis, success_metrics, time_horizon, status,
                               declaration_source, declaration_confidence,
                               health_baseline, acknowledged_risks,
                               linear_project_ids, linear_issue_ids, doc_refs,
                               created_at, last_monitored_at, completed_at
                        FROM bets
                        WHERE workspace_id = :wid
                        ORDER BY created_at DESC
                    """),
                    {"wid": workspace_id},
                )
            return [dict(row._mapping) for row in result]
    except Exception as exc:
        logger.warning("Failed to list bets for workspace %s: %s", workspace_id, exc)
        return []


async def get_bet(bet_id: str) -> dict | None:
    """Fetch a single bet by id."""
    if not is_db_configured():
        return None
    try:
        async with get_session() as session:
            result = await session.execute(
                text("SELECT * FROM bets WHERE id = :id"),
                {"id": bet_id},
            )
            row = result.mappings().first()
            return dict(row) if row else None
    except Exception as exc:
        logger.warning("Failed to get bet %s: %s", bet_id, exc)
        return None


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────


def _json_str(obj: dict | list | None) -> str | None:
    """Serialize to JSON string for JSONB columns. None → None."""
    if obj is None:
        return None
    import json

    return json.dumps(obj)


# ─────────────────────────────────────────────
# BET MUTATIONS
# ─────────────────────────────────────────────

# Allowlist guards against arbitrary column injection — values are always
# bound parameters; only the column names come from this set.
_BET_UPDATE_ALLOWED: frozenset[str] = frozenset(
    {
        "name",
        "target_segment",
        "problem_statement",
        "hypothesis",
        "success_metrics",
        "time_horizon",
        "linear_project_ids",
        "status",
    }
)
_BET_UPDATE_JSONB: frozenset[str] = frozenset({"success_metrics"})


async def update_bet(bet_id: str, fields: dict) -> bool:
    """Update allowed fields on a bet. Returns True if the row was updated."""
    if not is_db_configured():
        return False
    safe_fields = {k: v for k, v in fields.items() if k in _BET_UPDATE_ALLOWED}
    if not safe_fields:
        return False
    try:
        set_clauses: list[str] = []
        params: dict = {"bet_id": bet_id}
        for col, val in safe_fields.items():
            if col in _BET_UPDATE_JSONB:
                set_clauses.append(f"{col} = :{col}::jsonb")
                params[col] = _json_str(val)
            else:
                set_clauses.append(f"{col} = :{col}")
                params[col] = val
        set_sql = ", ".join(set_clauses)
        async with get_session() as session:
            result = await session.execute(
                # Column names come from validated allowlist; values are bound params.
                text(f"UPDATE bets SET {set_sql} WHERE id = :bet_id"),  # noqa: S608
                params,
            )
            return result.rowcount > 0
    except Exception as exc:
        logger.warning("Failed to update bet %s: %s", bet_id, exc)
        return False


async def archive_bet(bet_id: str) -> bool:
    """Set status='archived' and completed_at=now(). Returns True if updated."""
    if not is_db_configured():
        return False
    try:
        async with get_session() as session:
            result = await session.execute(
                text("""
                    UPDATE bets
                    SET status = 'archived', completed_at = :now
                    WHERE id = :bet_id
                """),
                {"bet_id": bet_id, "now": _now_iso()},
            )
            return result.rowcount > 0
    except Exception as exc:
        logger.warning("Failed to archive bet %s: %s", bet_id, exc)
        return False


async def update_acknowledged_risks(
    bet_id: str, acknowledged_risks: list[dict]
) -> bool:
    """Replace acknowledged_risks on a bet. Returns True if updated."""
    if not is_db_configured():
        return False
    try:
        async with get_session() as session:
            result = await session.execute(
                text("""
                    UPDATE bets
                    SET acknowledged_risks = :acknowledged_risks::jsonb
                    WHERE id = :bet_id
                """),
                {
                    "bet_id": bet_id,
                    "acknowledged_risks": _json_str(acknowledged_risks),
                },
            )
            return result.rowcount > 0
    except Exception as exc:
        logger.warning(
            "Failed to update acknowledged_risks for bet %s: %s", bet_id, exc
        )
        return False


# ─────────────────────────────────────────────
# SUPPRESSION RULES
# ─────────────────────────────────────────────


async def save_suppression_rule(rule: dict) -> str | None:
    """Persist a suppression rule. Returns id or None."""
    if not is_db_configured():
        return None
    try:
        rule_id = rule.get("id", _new_id())
        async with get_session() as session:
            await session.execute(
                text("""
                    INSERT INTO suppression_rules (
                        id, workspace_id, risk_type, action_type,
                        rejection_reason, suppressed_at, suppressed_until, created_at
                    ) VALUES (
                        :id, :workspace_id, :risk_type, :action_type,
                        :rejection_reason, :suppressed_at, :suppressed_until, :created_at
                    )
                """),
                {
                    "id": rule_id,
                    "workspace_id": rule["workspace_id"],
                    "risk_type": rule["risk_type"],
                    "action_type": rule["action_type"],
                    "rejection_reason": rule["rejection_reason"],
                    "suppressed_at": rule.get("suppressed_at", _now_iso()),
                    "suppressed_until": rule.get("suppressed_until"),
                    "created_at": rule.get("created_at", _now_iso()),
                },
            )
        return rule_id
    except Exception as exc:
        logger.warning("Failed to save suppression_rule: %s", exc)
        return None


async def list_suppression_rules(workspace_id: str) -> list[dict]:
    """List suppression rules for a workspace, newest first. Max 100."""
    if not is_db_configured():
        return []
    try:
        async with get_session() as session:
            result = await session.execute(
                text("""
                    SELECT id, workspace_id, risk_type, action_type,
                           rejection_reason, suppressed_at, suppressed_until,
                           created_at
                    FROM suppression_rules
                    WHERE workspace_id = :wid
                    ORDER BY created_at DESC
                    LIMIT 100
                """),
                {"wid": workspace_id},
            )
            return [dict(row._mapping) for row in result]
    except Exception as exc:
        logger.warning(
            "Failed to list suppression_rules for workspace %s: %s", workspace_id, exc
        )
        return []


async def delete_suppression_rule(rule_id: str) -> bool:
    """Delete a suppression rule by id. Returns True if a row was deleted."""
    if not is_db_configured():
        return False
    try:
        async with get_session() as session:
            result = await session.execute(
                text("DELETE FROM suppression_rules WHERE id = :id"),
                {"id": rule_id},
            )
            return result.rowcount > 0
    except Exception as exc:
        logger.warning("Failed to delete suppression_rule %s: %s", rule_id, exc)
        return False


# ─────────────────────────────────────────────
# OUTCOME functions
# ─────────────────────────────────────────────


async def save_outcome(outcome: dict) -> str | None:
    """Persist an Outcome record. Returns the outcome id on success, None on failure."""
    if not is_db_configured():
        return None
    try:
        async with get_session() as session:
            await session.execute(
                text(
                    """
                    INSERT INTO outcomes (
                        id, intervention_id, bet_id,
                        snapshot_before_id, snapshot_after_id,
                        health_score_delta, risk_resolved, founder_rating, measured_at
                    ) VALUES (
                        :id, :intervention_id, :bet_id,
                        :snapshot_before_id, :snapshot_after_id,
                        :health_score_delta, :risk_resolved, :founder_rating, :measured_at
                    )
                    """
                ),
                {
                    "id": outcome["id"],
                    "intervention_id": outcome["intervention_id"],
                    "bet_id": outcome["bet_id"],
                    "snapshot_before_id": outcome["snapshot_before_id"],
                    "snapshot_after_id": outcome["snapshot_after_id"],
                    "health_score_delta": outcome.get("health_score_delta", 0.0),
                    "risk_resolved": outcome.get("risk_resolved", False),
                    "founder_rating": outcome.get("founder_rating"),
                    "measured_at": outcome["measured_at"],
                },
            )
        return outcome["id"]
    except Exception as exc:
        logger.warning("Failed to save outcome %s: %s", outcome.get("id"), exc)
        return None


async def get_outcomes_for_bet(bet_id: str) -> list[dict]:
    """Return all Outcome records for a bet, ordered by measured_at DESC."""
    if not is_db_configured():
        return []
    try:
        async with get_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT id, intervention_id, bet_id, snapshot_before_id,
                           snapshot_after_id, health_score_delta, risk_resolved,
                           founder_rating, measured_at
                    FROM outcomes
                    WHERE bet_id = :bet_id
                    ORDER BY measured_at DESC
                    """
                ),
                {"bet_id": bet_id},
            )
            rows = result.mappings().all()
            return [dict(r) for r in rows]
    except Exception as exc:
        logger.warning("Failed to get outcomes for bet %s: %s", bet_id, exc)
        return []

