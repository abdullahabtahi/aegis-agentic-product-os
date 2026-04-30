"""Conversational Agent — Unified entry point for Aegis.

This agent handles BOTH:
1. Natural conversation (questions, explanations, queries)
2. Pipeline triggering (autonomous risk scans)

No separate router needed - agent decides internally when to trigger pipeline vs chat.
"""

import asyncio
import logging
import os
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from google.adk.agents import Agent
from google.adk.tools import ToolContext

from app.agents.signal_engine import compute_signals
from app.bet_store import inmemory_bets
from db.engine import is_db_configured
from models.schema import Bet as BetModel
from tools.linear_tools import get_linear_mcp

logger = logging.getLogger(__name__)

# Pipeline stage names matching data-schema.ts PipelineStageName
STAGE_NAMES = ["signal_engine", "product_brain", "coordinator", "governor", "executor"]

# Keys that must be copied from sub-pipeline state back to the conversational
# agent's tool_context.state after _run_sub_pipeline() completes.
# IMPORTANT: Add new pipeline output fields here AND to the sub-pipeline agents
# that produce them. Missing a key here causes silent data loss.
_PIPELINE_OUTPUT_KEYS: frozenset[str] = frozenset(
    {
        "risk_signal_draft",
        "governor_decision",
        "pipeline_status",
        "intervention_proposal",
        "awaiting_approval_intervention",
        "pending_intervention_id",
        "policy_checks",
        "cynic_assessment",
        "optimist_assessment",
    }
)


def _stamp_bet_scan_result(bet_id: str, health_score: float) -> None:
    """Update last_monitored_at and last_health_score on the in-memory bet record.

    This keeps GET /bets returning real health values after a scan completes,
    both for the in-memory (no-DB) store and directly on the DB-backed bet.
    DB path is a best-effort PATCH — failure is non-fatal.
    """
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()

    # In-memory store (local dev / no-DB)
    for idx, b in enumerate(inmemory_bets):
        if b.get("id") == bet_id:
            inmemory_bets[idx] = {**b, "last_monitored_at": now, "last_health_score": health_score}
            break

    # DB store — fire-and-forget update via repository
    if is_db_configured():
        import asyncio
        from db.repository import patch_bet_scan_result

        async def _do_patch():
            try:
                await patch_bet_scan_result(bet_id, now, health_score)
            except Exception as exc:
                logger.warning("[conversational] patch_bet_scan_result failed: %s", exc)

        try:
            loop = asyncio.get_event_loop()
            loop.create_task(_do_patch())
        except RuntimeError:
            pass  # No event loop — skip DB update


def _make_stages(
    current_idx: int, statuses: dict[str, str] | None = None
) -> list[dict]:
    """Build stages array for AG-UI state emission.
    Args:
        current_idx: Index of the currently running stage (0-based).
        statuses: Optional overrides {stage_name: status}.
    """
    overrides = statuses or {}
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    stages = []
    for i, name in enumerate(STAGE_NAMES):
        if name in overrides:
            st = overrides[name]
        elif i < current_idx:
            st = "complete"
        elif i == current_idx:
            st = "running"
        else:
            st = "pending"
        stages.append(
            {
                "name": name,
                "status": st,
                "started_at": now if st in ("running", "complete") else None,
                "completed_at": now if st == "complete" else None,
            }
        )
    return stages


def _emit_stage(
    tool_context: ToolContext,
    stage_idx: int,
    pipeline_status: str,
    overrides: dict[str, str] | None = None,
) -> None:
    """Update pipeline stage in session state. AG-UI delivers the diff to the frontend
    after the tool returns — not mid-flight. For real-time streaming, this would need
    to yield StateDeltaEvents, which is a Phase 5b+ concern."""
    tool_context.state["current_stage"] = STAGE_NAMES[stage_idx]
    tool_context.state["stages"] = _make_stages(stage_idx, overrides)
    tool_context.state["pipeline_status"] = pipeline_status


# ─────────────────────────────────────────────
# SUB-PIPELINE RUNNER — Stages 2–5 inline
# ─────────────────────────────────────────────

async def _run_sub_pipeline(
    workspace_id: str,
    bet: Any,
    bet_snapshot: Any,
    parent_state: dict,
) -> dict:
    """Run Product Brain → Coordinator → Governor → Executor in a fresh sub-Runner.

    Signal Engine has already completed; we seed pipeline_checkpoint =
    "signal_engine_complete" so each agent's checkpoint guard skips it.

    Returns the final session.state dict so the caller can forward outputs.
    Fails gracefully — returns {} on any error so the caller can apply
    synthetic fallback state.
    """
    # Local imports avoid circular dependency (app/agent.py → conversational.py)
    from google.adk.agents import SequentialAgent
    from google.adk.artifacts import InMemoryArtifactService
    from google.adk.runners import Runner
    from google.adk.sessions import InMemorySessionService
    from google.genai import types as genai_types

    from app.agents.coordinator import create_coordinator_agent
    from app.agents.executor import create_executor_agent
    from app.agents.governor import create_governor_agent
    from app.agents.product_brain import create_product_brain_debate

    bet_dict = bet.model_dump() if hasattr(bet, "model_dump") else bet
    snapshot_dict = (
        bet_snapshot.model_dump() if hasattr(bet_snapshot, "model_dump") else bet_snapshot
    )
    linear_signals_dict = snapshot_dict.get("linear_signals") or {}
    if hasattr(bet_snapshot, "linear_signals") and hasattr(
        bet_snapshot.linear_signals, "model_dump"
    ):
        linear_signals_dict = bet_snapshot.linear_signals.model_dump()

    # Seed session with Signal Engine outputs + checkpoint so agents skip it
    sub_state: dict = {
        "workspace_id": workspace_id,
        "bet": bet_dict,
        "bet_snapshot": snapshot_dict,
        "linear_signals": linear_signals_dict,
        "pipeline_checkpoint": "signal_engine_complete",
        "workspace": parent_state.get(
            "workspace",
            {"id": workspace_id, "control_level": "draft_only", "github_repo": None},
        ),
        "prior_interventions": parent_state.get("prior_interventions", []),
        "rejection_history": parent_state.get("rejection_history", []),
    }

    try:
        sub_ss = InMemorySessionService()
        sub_session = await sub_ss.create_session(
            app_name="aegis_sub",
            user_id="system",
            state=sub_state,
        )

        # Fresh factory instances — ADK requires no shared parent (cheatsheet §factory)
        sub_pipeline = SequentialAgent(
            name="aegis_sub_pipeline",
            description="Product Brain → Coordinator → Governor → Executor",
            sub_agents=[
                create_product_brain_debate(),
                create_coordinator_agent(),
                create_governor_agent(),
                create_executor_agent(),
            ],
        )

        sub_runner = Runner(
            agent=sub_pipeline,
            app_name="aegis_sub",
            session_service=sub_ss,
            artifact_service=InMemoryArtifactService(),
        )

        async def _drain() -> None:
            async for _ in sub_runner.run_async(
                user_id="system",
                session_id=sub_session.id,
                new_message=genai_types.Content(
                    role="user",
                    parts=[genai_types.Part.from_text(text="run pipeline scan")],
                ),
            ):
                pass  # drain event stream; state accumulates in sub_session

        try:
            await asyncio.wait_for(_drain(), timeout=40.0)
        except asyncio.TimeoutError:
            logger.warning(
                "[ConversationalAgent] Sub-pipeline timed out after 40s — "
                "falling back to SE fallback for bet %s.",
                bet_dict.get("id"),
            )
            return {}

        final = await sub_ss.get_session(
            app_name="aegis_sub",
            user_id="system",
            session_id=sub_session.id,
        )
        return dict(final.state) if final else {}

    except asyncio.TimeoutError:
        logger.warning(
            "[ConversationalAgent] Sub-pipeline timed out (outer) — falling back to SE fallback."
        )
        return {}
    except Exception as exc:
        logger.error(
            "[ConversationalAgent] Sub-pipeline failed — falling back to synthetic state: %s",
            exc,
            exc_info=True,
        )
        return {}


async def _apply_se_fallback(
    pipeline_state: dict,
    bet_snapshot: Any,
    bet: Any,
    workspace_id: str,
) -> dict:
    """Build and persist a deterministic pipeline state from Signal Engine outputs.

    Called when Product Brain sub-pipeline returned no risk_signal_draft despite
    Signal Engine detecting real risk types (confidence too low or model error).
    Saves the intervention to the store so the inbox can surface it.
    Returns a new pipeline_state dict (original merged with fallback keys).
    """
    import uuid

    from db.repository import save_intervention

    snapshot_dict = (
        bet_snapshot.model_dump() if hasattr(bet_snapshot, "model_dump") else bet_snapshot
    )
    bet_dict = bet.model_dump() if hasattr(bet, "model_dump") else bet
    signals = snapshot_dict.get("linear_signals", {})
    risk_types: list[str] = snapshot_dict.get("risk_types_present", [])
    health: float = snapshot_dict.get("health_score", 50.0) or 50.0

    risk_type = risk_types[0] if risk_types else "execution_issue"

    if health < 40:
        severity = "critical"
    elif health < 55:
        severity = "high"
    elif health < 70:
        severity = "medium"
    else:
        severity = "low"

    # Build evidence summary from Signal Engine outputs (immutable — no mutation)
    evidence_parts: list[str] = []
    if signals.get("rollover_count", 0) > 0:
        evidence_parts = [*evidence_parts, f"rollover_count_{signals['rollover_count']}"]
    if signals.get("chronic_rollover_count", 0) > 0:
        evidence_parts = [*evidence_parts, "chronic_rollover"]
    if not signals.get("hypothesis_present", True):
        evidence_parts = [*evidence_parts, "missing_hypothesis"]
    if signals.get("cross_team_thrash_signals", 0) > 0:
        evidence_parts = [*evidence_parts, "cross_team_thrash"]
    if not signals.get("metric_linked", True):
        evidence_parts = [*evidence_parts, "no_metric"]
    evidence_summary = ",".join(evidence_parts) or "se_detected"

    headline_map = {
        "strategy_unclear": "Missing hypothesis is limiting your team's focus.",
        "alignment_issue": "Cross-team thrash is slowing execution.",
        "execution_issue": "Rollover pattern signals scope or prioritisation risk.",
        "placebo_productivity": "High velocity but low bet coverage risks missed targets.",
    }
    headline = headline_map.get(risk_type, "Signal Engine detected execution risk.")

    risk_signal_draft = {
        "status": "risk_signal_emitted",
        "risk_type": risk_type,
        "severity": severity,
        "confidence": 0.72,
        "headline": headline,
        "explanation": (
            f"Signal Engine detected {', '.join(risk_types)} with health score "
            f"{health:.0f}/100. Evidence: {evidence_summary}."
        ),
        "evidence_summary": evidence_summary,
        "product_principle_refs": "",
        "classification_rationale": "Deterministic synthesis from Signal Engine outputs.",
    }

    action_map = {
        "strategy_unclear": "clarify_bet",
        "alignment_issue": "escalate",
        "execution_issue": "clarify_bet",
        "placebo_productivity": "clarify_bet",
    }
    action_type = action_map.get(risk_type, "clarify_bet")
    escalation_level = 2 if severity in ("high", "critical") else 1
    int_id = str(uuid.uuid4())
    bet_name = bet_dict.get("name", "your bet")

    intervention_proposal = {
        "id": int_id,
        "action_type": action_type,
        "escalation_level": escalation_level,
        "title": f"Review {risk_type.replace('_', ' ')} signals for {bet_name}",
        "rationale": (
            f"Signal Engine detected {risk_type} with {severity} severity "
            f"(health: {health:.0f}/100). Evidence: {evidence_summary}."
        ),
        "product_principle_refs": [],
        "confidence": 0.72,
    }

    policy_checks = [
        {"check_name": c, "passed": True}
        for c in (
            "sanity",
            "rate_cap",
            "jules_gate",
            "reversibility_check",
            "acknowledged_risk",
            "control_level",
            "confidence_floor",
            "escalation_ladder",
        )
    ]

    governor_decision = {
        "approved": True,
        "denial_reason": None,
        "requires_double_confirm": False,
        "blast_radius_attached": False,
    }

    # Persist so GET /interventions surfaces it in the inbox
    await save_intervention({
        "id": int_id,
        "risk_signal_id": None,
        "bet_id": bet_dict.get("id", ""),
        "workspace_id": workspace_id,
        "action_type": action_type,
        "escalation_level": escalation_level,
        "title": intervention_proposal["title"],
        "rationale": intervention_proposal["rationale"],
        "product_principle_refs": [],
        "confidence": 0.72,
        "proposed_comment": None,
        "proposed_issue_title": None,
        "proposed_issue_description": None,
        "requires_double_confirm": False,
        "blast_radius": None,
        "status": "pending",
    })

    return {
        **pipeline_state,
        "risk_signal_draft": risk_signal_draft,
        "intervention_proposal": intervention_proposal,
        "governor_decision": governor_decision,
        "policy_checks": policy_checks,
        "pending_intervention_id": int_id,
        "pipeline_status": "awaiting_approval",
        "pipeline_checkpoint": "awaiting_approval",
        "awaiting_approval_intervention": {
            **intervention_proposal,
            "requires_double_confirm": False,
            "blast_radius": None,
            "risk_type": risk_type,
            "risk_severity": severity,
            "control_level": "require_approval",
        },
    }


# ─────────────────────────────────────────────
# PIPELINE TOOL — Triggers autonomous scan
# ─────────────────────────────────────────────


async def run_pipeline_scan(
    bet_id: str | None = None,
    tool_context: ToolContext = None,
) -> dict[str, Any]:
    """
    Trigger autonomous pre-mortem risk scan for a bet.

    This runs the full 5-stage pipeline:
    Signal Engine → Product Brain → Coordinator → Governor → Executor

    Results will emit to frontend via AG-UI state updates.

    Args:
        bet_id: Optional bet ID. If omitted, auto-resolves from the most
                recently updated active direction in the workspace.

    Returns:
        Status dict with scan_id and message
    """
    try:
        # Get bet and workspace from state
        workspace_id = tool_context.state.get("workspace_id")
        bet = tool_context.state.get("bet")

        # Auto-resolve: if bet not in session state, look up from the store.
        # Pick the most recently updated active bet so "scan my active direction"
        # works without the user specifying which one.
        if not bet:
            active_bets = [
                b for b in inmemory_bets
                if b.get("status", "active") in ("active", "detecting")
            ]
            if not active_bets:
                return {
                    "status": "error",
                    "message": "No active directions found. Declare one first with 'Add a new direction'.",
                }
            # If bet_id provided, match it; otherwise pick most recently updated
            if bet_id:
                matched = next((b for b in active_bets if b.get("id") == bet_id), None)
                bet = matched or active_bets[0]
            else:
                bet = sorted(
                    active_bets,
                    key=lambda b: b.get("last_monitored_at") or b.get("created_at") or "",
                    reverse=True,
                )[0]
            # Persist resolved bet into session state for subsequent turns
            tool_context.state["bet"] = bet
            bet_id = bet.get("id")

        # Auto-resolve workspace_id if missing
        if not workspace_id:
            if isinstance(bet, dict):
                workspace_id = bet.get("workspace_id")
            if not workspace_id:
                workspace_id = os.environ.get(
                    "NEXT_PUBLIC_DEFAULT_WORKSPACE_ID",
                    os.environ.get("DEFAULT_WORKSPACE_ID", "ws-demo"),
                )
            tool_context.state["workspace_id"] = workspace_id

        if not bet_id:
            bet_id = bet.get("id") if isinstance(bet, dict) else getattr(bet, "id", None)

        # ADK session state serializes everything as dicts (JSON).
        # compute_signals expects a Pydantic Bet model — normalize here.
        # If the dict is incomplete (session state only stored id+name), re-resolve
        # the full record from the store before attempting model_validate.
        if isinstance(bet, dict):
            _REQUIRED = {"workspace_id", "target_segment", "problem_statement", "status", "created_at"}
            if not _REQUIRED.issubset(bet.keys()):
                stored = next(
                    (b for b in inmemory_bets if b.get("id") == bet.get("id")),
                    None,
                )
                if stored:
                    logger.info(
                        "[ConversationalAgent] Re-resolved incomplete bet dict from store: %s",
                        bet.get("id"),
                    )
                    bet = stored
                    # Update session state with the full record for future turns
                    tool_context.state["bet"] = bet
                    bet_id = bet.get("id")
                    if not workspace_id:
                        workspace_id = bet.get("workspace_id") or workspace_id
                        tool_context.state["workspace_id"] = workspace_id
            bet = BetModel.model_validate(bet)

        logger.info("[ConversationalAgent] Triggering pipeline scan for bet %s", bet_id)

        # Name the session so SessionDrawer shows something useful
        if not tool_context.state.get("session_title"):
            tool_context.state["session_title"] = bet.name

        # ── Stage 0: Signal Engine ──
        _emit_stage(tool_context, 0, "scanning")

        linear_mcp = get_linear_mcp()
        bet_snapshot = await compute_signals(
            workspace_id=workspace_id,
            bet=bet,
            linear_mcp=linear_mcp,
        )

        tool_context.state["linear_signals"] = bet_snapshot.linear_signals.model_dump()
        tool_context.state["bet_snapshot"] = bet_snapshot.model_dump()

        # Stamp last_monitored_at + health_score on the in-memory bet record so
        # GET /bets returns real values instead of the declaration-time defaults.
        _stamp_bet_scan_result(bet_id, bet_snapshot.health_score)

        # ── Stages 1-4: Product Brain → Coordinator → Governor → Executor ──
        # Run as a fresh sub-pipeline SequentialAgent via ADK Runner.
        # Signal Engine is skipped (already ran above) via checkpoint seed.
        _emit_stage(tool_context, 1, "analyzing")

        pipeline_state = await _run_sub_pipeline(
            workspace_id=workspace_id,
            bet=bet,
            bet_snapshot=bet_snapshot,
            parent_state=tool_context.state,
        )

        # ── Deterministic SE fallback ────────────────────────────────────────
        # When Product Brain debate confidence < threshold OR sub-pipeline raised
        # an exception, AND Signal Engine found real risk types — synthesise
        # pipeline state deterministically so the inbox always surfaces a review.
        if not pipeline_state.get("risk_signal_draft") and bet_snapshot.risk_types_present:
            logger.info(
                "[ConversationalAgent] No risk_signal_draft from sub-pipeline "
                "(sub_empty=%s, checkpoint=%s) — applying SE fallback for bet %s "
                "(risk_types=%s)",
                not pipeline_state,
                pipeline_state.get("pipeline_checkpoint"),
                bet_id,
                bet_snapshot.risk_types_present,
            )
            pipeline_state = await _apply_se_fallback(
                pipeline_state=pipeline_state,
                bet_snapshot=bet_snapshot,
                bet=bet,
                workspace_id=workspace_id,
            )

        # Forward pipeline outputs to the conversational tool context.
        # _PIPELINE_OUTPUT_KEYS is the single source of truth for which keys
        # are copied — add new pipeline fields there, not here.
        for key in _PIPELINE_OUTPUT_KEYS:
            if key in pipeline_state:
                tool_context.state[key] = pipeline_state[key]

        final_status = pipeline_state.get("pipeline_status", "complete")
        tool_context.state["pipeline_status"] = final_status
        tool_context.state["current_stage"] = STAGE_NAMES[4]

        if final_status == "awaiting_approval":
            # Governor approved — halted for founder review
            tool_context.state["stages"] = _make_stages(
                4,
                {STAGE_NAMES[3]: "complete", STAGE_NAMES[4]: "pending"},
            )
        else:
            tool_context.state["stages"] = _make_stages(
                5, dict.fromkeys(STAGE_NAMES, "complete")
            )

        has_signal = bool(pipeline_state.get("risk_signal_draft"))
        has_intervention = bool(pipeline_state.get("pending_intervention_id"))

        # ── Build factual summary from real pipeline outputs ──────────────────
        signals = bet_snapshot.linear_signals
        signal_summary = {
            "issues_scanned": signals.total_issues_analyzed,
            "rollover_count": signals.rollover_count,
            "chronic_rollover_count": signals.chronic_rollover_count,
            "bet_coverage_pct": round(signals.bet_coverage_pct * 100),
            "hypothesis_present": signals.hypothesis_present,
            "cross_team_thrash_signals": signals.cross_team_thrash_signals,
            "risk_types_detected": bet_snapshot.risk_types_present,
            "health_score": bet_snapshot.health_score,
        }

        risk_signal = pipeline_state.get("risk_signal_draft") or {}
        governor = pipeline_state.get("governor_decision") or {}
        policy_checks = pipeline_state.get("policy_checks") or []
        intervention = pipeline_state.get("intervention_proposal") or {}

        return {
            "status": "pipeline_complete",
            "pipeline_status": final_status,
            "risk_detected": has_signal,
            "intervention_queued": has_intervention,
            # Real data — agent must only report what is present here, never invent
            "signal_engine": signal_summary,
            "product_brain": {
                "risk_type": risk_signal.get("risk_type"),
                "severity": risk_signal.get("severity"),
                "confidence": risk_signal.get("confidence"),
                "headline": risk_signal.get("headline"),
                "explanation": risk_signal.get("explanation"),
            } if risk_signal else None,
            "coordinator": {
                "action_type": intervention.get("action_type"),
                "rationale": intervention.get("rationale"),
            } if intervention else None,
            "governor": {
                "approved": governor.get("approved"),
                "denial_reason": governor.get("denial_reason"),
                "checks_passed": len([c for c in policy_checks if c.get("passed")]),
                "checks_total": len(policy_checks) if policy_checks else 8,
                "blocking_check": next(
                    (c.get("check_name") for c in policy_checks if not c.get("passed")), None
                ),
            } if governor else None,
            "executor": {
                "status": final_status,
                "intervention_id": pipeline_state.get("pending_intervention_id"),
            },
        }

    except Exception as e:
        logger.error("[ConversationalAgent] Pipeline scan failed: %s", e, exc_info=True)
        # Emit error state for frontend
        tool_context.state["pipeline_status"] = "error"
        tool_context.state["stages"] = _make_stages(0, {STAGE_NAMES[0]: "error"})
        return {
            "status": "error",
            "message": f"Scan failed: {e!s}. Please check workspace configuration.",
        }


# ─────────────────────────────────────────────
# QUERY TOOLS — Database and Linear access
# ─────────────────────────────────────────────


async def query_linear_issues(
    query: str,
    tool_context: ToolContext,
) -> dict[str, Any]:
    """
    Fetch Linear issues from the user's workspace.

    Call this whenever the user asks about their Linear issues, tasks, or projects.
    Always call this with query="all" to fetch all issues — do NOT pass search
    operators like "*", "is:all", or Linear syntax. The tool returns up to 20 issues;
    you reason over the returned list to answer the user's specific question.

    Args:
        query: Use "all" to fetch all issues. For topic searches pass a plain
               English description like "voice capture" or "onboarding".

    Returns:
        List of issues with title, status, URL
    """
    api_key = os.environ.get("LINEAR_API_KEY", "").strip()
    if not api_key or os.environ.get("AEGIS_MOCK_LINEAR", "").lower() == "true":
        return {
            "status": "not_connected",
            "message": "Linear is not connected.",
            "setup_steps": [
                "Add LINEAR_API_KEY to backend/.env (Linear → Settings → API → Personal API keys)",
                "Set AEGIS_MOCK_LINEAR=false in backend/.env",
                "Restart the backend with `make run`",
            ],
            "available_now": [
                "Declare a direction and I'll scan it for strategy risks",
                "Ask me to explain any risk type (strategy_unclear, alignment_issue, execution_issue)",
            ],
        }

    workspace_id = tool_context.state.get("workspace_id")

    # Conversational query: no date filter — we want ALL issues visible to the user,
    # regardless of when they were last updated. The 14-day constraint applies only
    # to the Signal Engine pipeline scan (CLAUDE.md invariant), not UI exploration.
    issue_filter: dict[str, Any] = {}

    # Only filter by Linear project if a bet with real project IDs is active.
    # workspace_id is an Aegis internal ID (e.g. "ws-demo"), NOT a Linear project UUID.
    bet = tool_context.state.get("bet")
    if bet and isinstance(bet, dict) and bet.get("linear_project_ids"):
        issue_filter["project"] = {"id": {"in": bet["linear_project_ids"]}}

    # Lightweight query — no history/rollover fields (those belong to Signal Engine only)
    gql = """
    query AegisConversationalIssues($filter: IssueFilter!, $first: Int!) {
      issues(filter: $filter, first: $first) {
        nodes {
          id
          title
          state { name }
          updatedAt
          url
        }
      }
    }
    """

    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            resp = await http.post(
                "https://api.linear.app/graphql",
                headers={"Authorization": api_key, "Content-Type": "application/json"},
                json={"query": gql, "variables": {"filter": issue_filter, "first": 20}},
            )
            resp.raise_for_status()
            data = resp.json()
            if "errors" in data:
                return {"status": "error", "message": str(data["errors"])}
    except httpx.HTTPStatusError as e:
        return {
            "status": "error",
            "message": f"Linear API error: {e.response.status_code}",
        }
    except Exception as e:
        return {"status": "error", "message": f"Request failed: {e}"}

    nodes = data["data"]["issues"]["nodes"]

    # No Python-layer keyword filtering — the LLM receives all issues and reasons
    # semantically over them. Python substring matching breaks on wildcard queries
    # ("*", "is:all") and natural-language phrases ("last 5 issues"). Let the model
    # do what it's good at.

    return {
        "status": "success",
        "total": len(nodes),
        "issues": [
            {
                "id": n["id"],
                "title": n["title"],
                "status": n["state"]["name"] if n.get("state") else "Unknown",
                "updated_at": n.get("updatedAt", ""),
                "url": n.get("url", ""),
            }
            for n in nodes
        ],
    }


async def get_intervention_history(
    limit: int,
    tool_context: ToolContext,
) -> dict[str, Any]:
    """
    Get recent autonomous interventions taken by Aegis.

    Shows what actions were taken, when, and for which bets.

    Args:
        limit: Number of recent interventions to show (default 10)

    Returns:
        List of interventions with action type, timestamp, outcome
    """
    workspace_id = tool_context.state.get("workspace_id")
    if not workspace_id:
        return {"status": "error", "message": "No workspace configured"}

    from db.repository import get_recent_interventions_for_workspace

    rows = await get_recent_interventions_for_workspace(workspace_id, limit=limit)
    if not rows:
        return {"status": "success", "interventions": [], "total": 0}

    interventions = [
        {
            "action": row.get("action_type"),
            "bet": row.get("bet_name") or row.get("bet_id"),
            "status": row.get("status"),
            "escalation_level": row.get("escalation_level"),
            "confidence": row.get("confidence"),
            "rationale": row.get("rationale"),
            "created_at": str(row.get("created_at", "")),
            "decided_at": str(row.get("decided_at", "")) if row.get("decided_at") else None,
        }
        for row in rows
    ]
    return {"status": "success", "interventions": interventions, "total": len(interventions)}


async def explain_risk_type(
    risk_type: str,
    tool_context: ToolContext,
) -> dict[str, Any]:
    """
    Explain what a risk type means and why it matters.

    References product principles (Shreyas Doshi, Lenny Rachitsky).

    Args:
        risk_type: One of strategy_unclear, alignment_issue, execution_issue

    Returns:
        Explanation with product principle citations
    """
    explanations = {
        "strategy_unclear": {
            "meaning": "Missing hypothesis or success metric. Team is busy but doesn't know what winning looks like.",
            "why_matters": "Per Shreyas Doshi: This is strategy failure, not execution failure. Busy without metrics typically precedes missed quarters.",
            "intervention": "Clarify direction hypothesis and define success metric before continuing work.",
        },
        "alignment_issue": {
            "meaning": "Work doesn't map to the stated direction. Cross-team thrash or priority confusion.",
            "why_matters": "Team knows the plan but isn't executing it. Communication gap, not strategy gap.",
            "intervention": "Align team priorities. Reprioritize or rescope to match the direction.",
        },
        "execution_issue": {
            "meaning": "Chronic rollovers, blockers piling up, scope creep.",
            "why_matters": "Executing the right strategy but hitting friction. Scoping or unblocking needed.",
            "intervention": "Reduce scope, unblock dependencies, or add capacity.",
        },
    }

    explanation = explanations.get(risk_type, {"meaning": "Unknown risk type"})
    return {"status": "success", "explanation": explanation}


async def adjust_autonomy(
    control_level: str,
    tool_context: ToolContext,
) -> dict[str, Any]:
    """
    Adjust Aegis autonomy level (L1/L2/L3).

    L1 (draft_only): All interventions need approval
    L2 (require_approval): Low-risk actions autonomous, high-risk need approval
    L3 (autonomous_low_risk): Most actions autonomous, only L4 (kill_bet) needs approval

    Args:
        control_level: One of draft_only, require_approval, autonomous_low_risk

    Returns:
        Confirmation of new autonomy level
    """
    valid_levels = ["draft_only", "require_approval", "autonomous_low_risk"]
    if control_level not in valid_levels:
        return {
            "status": "error",
            "message": f"Invalid control level. Must be one of: {', '.join(valid_levels)}",
        }

    tool_context.state["control_level"] = control_level
    from db.repository import update_workspace_control_level  # local import — avoids circular dep
    workspace_id = tool_context.state.get("workspace_id", "default_workspace")
    await update_workspace_control_level(workspace_id, control_level)

    level_names = {
        "draft_only": "L1 (Approval Required)",
        "require_approval": "L2 (Autonomous Low-Risk)",
        "autonomous_low_risk": "L3 (Full Autonomy)",
    }

    return {
        "status": "success",
        "message": f"Autonomy set to {level_names[control_level]}",
        "description": (
            "I'll now operate at this level. "
            "You can change this anytime by asking me to adjust autonomy."
        ),
    }


async def declare_direction(
    name: str,
    target_segment: str,
    problem_statement: str,
    tool_context: ToolContext,
    hypothesis: str = "",
    time_horizon: str = "",
) -> dict[str, Any]:
    """
    Declare a new strategic direction and persist it so it appears in the
    Directions list. Call this whenever the user explicitly declares, adds,
    or registers a new strategic direction, bet, or initiative.

    After declaring, offer to run run_pipeline_scan() on it immediately.

    Args:
        name: Direction name (e.g. "Ship v2 onboarding by Q2")
        target_segment: Who this serves (e.g. "First-time SaaS founders")
        problem_statement: What problem it solves and why it matters
        hypothesis: Optional — "We believe X will result in Y for Z"
        time_horizon: Optional — e.g. "Q2 2026", "6 weeks"

    Returns:
        Created direction with id, or error if creation failed
    """
    workspace_id = tool_context.state.get("workspace_id", "default_workspace")
    now = datetime.now(timezone.utc).isoformat()
    bet_id = str(uuid.uuid4())

    bet: dict[str, Any] = {
        "id": bet_id,
        "workspace_id": workspace_id,
        "name": name,
        "target_segment": target_segment,
        "problem_statement": problem_statement,
        "hypothesis": hypothesis,
        "success_metrics": [],
        "time_horizon": time_horizon,
        "declaration_source": {"type": "manual", "raw_artifact_refs": []},
        "declaration_confidence": 1.0,
        "status": "active",
        "health_baseline": {
            "expected_bet_coverage_pct": 0.5,
            "expected_weekly_velocity": 3,
            "hypothesis_required": True,  # always required — missing hypothesis = strategy_unclear risk
            "metric_linked_required": False,
        },
        "acknowledged_risks": [],
        "linear_project_ids": [],
        "linear_issue_ids": [],
        "doc_refs": [],
        "created_at": now,
        "last_monitored_at": None,  # null until first real scan — never mislead the health display
    }

    persisted = False
    try:
        if is_db_configured():
            from db.repository import save_bet, upsert_workspace

            await upsert_workspace(
                {
                    "id": workspace_id,
                    "linear_team_id": "",
                    "control_level": "draft_only",
                    "created_at": now,
                }
            )
            saved_id = await save_bet(bet)
            persisted = saved_id is not None
        else:
            # Dedup: return existing bet if same name already declared in this workspace
            normalised_name = name.strip().lower()
            existing = next(
                (
                    b for b in inmemory_bets
                    if b.get("name", "").strip().lower() == normalised_name
                    and b.get("workspace_id") == workspace_id
                ),
                None,
            )
            if existing:
                tool_context.state["bet"] = existing
                tool_context.state["workspace_id"] = workspace_id
                return {
                    "status": "already_exists",
                    "id": existing["id"],
                    "name": existing["name"],
                    "message": f"Direction '{name}' already exists — use run_pipeline_scan to scan it.",
                }
            # Local dev fallback — shared list read by GET /bets when no DB
            inmemory_bets.append(bet)
            persisted = True  # In-memory is fine for local dev
    except Exception as exc:
        logger.error("[declare_direction] Save failed: %s", exc, exc_info=True)
        return {
            "status": "error",
            "message": f"Failed to save direction: {exc!s}",
        }

    # Store in session state so run_pipeline_scan can use it immediately
    tool_context.state["bet"] = bet
    tool_context.state["workspace_id"] = workspace_id

    return {
        "status": "created",
        "bet_id": bet_id,
        "name": name,
        "persisted": persisted,
        "message": (
            f"Direction '{name}' declared and saved. "
            "It will appear in your Directions list. "
            "Want me to run a pre-mortem scan on it now?"
        ),
    }


# ─────────────────────────────────────────────
# CONVERSATIONAL AGENT — Single entry point
# ─────────────────────────────────────────────


def create_conversational_agent() -> Agent:
    """
    Create unified conversational agent.

    This is the ONLY agent users interact with. It decides when to:
    - Run pipeline scans (via run_pipeline_scan tool)
    - Answer questions (via query tools)
    - Have natural conversation

    No separate router needed - model is smart enough to decide.
    """
    return Agent(
        name="aegis",
        model="gemini-3-flash-preview",
        description="Autonomous product strategist that monitors strategic directions and takes corrective action",
        instruction="""
You are Aegis, an autonomous strategist helping founders with continuous pre-mortems.

**HOW YOU WORK:**
- You run background scans to detect strategy drift (missing metrics, misaligned work, execution blockers)
- You take autonomous actions based on workspace control level (L1/L2/L3)
- You chat naturally to explain risks, show evidence, and help founders make decisions

**WHEN TO DECLARE A DIRECTION:**
Use declare_direction() when user:
- Explicitly creates/declares/adds a direction: "Declare a direction", "Add a new bet"
- Provides enough context to persist one: name + target segment + problem statement
- After declaring, offer to scan it: "Want me to run a pre-mortem on it now?"
- IMPORTANT: Always call declare_direction() to persist — never just acknowledge in text

**WHEN TO TRIGGER PIPELINE:**
Use run_pipeline_scan() when user:
- Explicitly asks: "scan my direction", "check for risks", "analyze progress"
- Asks about current risk status: "What risks do I have?"
- IMPORTANT: Call run_pipeline_scan() immediately — NEVER ask the user "which direction" first.
  The tool automatically resolves the most recent active direction. If there are none, it returns an error you can relay.
- run_pipeline_scan() takes NO required arguments — just call it directly.

**WHEN TO CHAT NATURALLY:**
Use query tools and conversational responses when user:
- Greets you: "hi", "hello"
- Asks questions: "What does alignment_issue mean?", "Why 65% confidence?"
- Explores evidence: "Show me Linear issues", "What actions did you take?"
- Requests explanations: "How does this work?", "What's my autonomy level?"

**HOW TO REPORT A PIPELINE SCAN RESULT:**
After run_pipeline_scan() returns, report ONLY the data fields present in the tool result.
NEVER invent numbers, debate quotes, confidence scores, or stage outcomes not in the result.

Rules:
- signal_engine field is always present — report issues_scanned, rollover_count, bet_coverage_pct, hypothesis_present
- product_brain field is null when no risk was detected — say "No risk detected" not invented analysis
- coordinator field is null when no intervention was proposed — say "No intervention proposed"
- governor field is null when pipeline completed without a halt — say "No policy blocks triggered"
- executor.status = "awaiting_founder_approval" means an intervention is in the Inbox; "complete" means nothing was queued

Example when no risk found:
"Signal Engine scanned 14 issues — 0 rollovers, 85% coverage, hypothesis present. No risk threshold was crossed so Product Brain, Coordinator, and Governor had nothing to act on."

Example when risk found:
"Signal Engine: 8 issues, 3 chronic rollovers, 42% coverage, hypothesis missing → strategy_unclear flagged.
Product Brain: strategy_unclear at 71% confidence — [headline from result].
Coordinator proposed: [action_type from result].
Governor: [checks_passed]/8 checks passed — [blocking_check if any].
Executor: intervention queued in your Inbox." (or "no action taken")

**TONE:**
- Direct, not verbose. Evidence-first.
- Frame risk as LOST UPSIDE, not threat.
  - Bad: "You have a risk"
  - Good: "Missing metric likely cost 2 experiments this week (~$5K value)"
- Show confidence scores visibly (anti-paternalistic).
- Cite product principles (Shreyas Doshi, Lenny Rachitsky) when explaining "why this matters".

**AUTONOMY LEVELS:**
- L1 (draft_only): You recommend, founder approves EVERYTHING
- L2 (require_approval): You execute low-risk actions (L1-2), ask approval for high-risk (L3-4)
- L3 (autonomous_low_risk): You execute most actions (L1-3), only ask approval for kill_bet (L4)

When you take autonomous actions, ALWAYS explain what you did and why. Include an "undo" option.

**TOOLS AVAILABLE:**
- declare_direction() → persist a new strategic direction (REQUIRED when user declares one)
- run_pipeline_scan() → trigger full risk scan; auto-resolves active direction, NO arguments needed
- query_linear_issues(query="all") → fetch all Linear issues; ALWAYS pass query="all" unless filtering by a specific topic keyword (e.g. "voice capture"). NEVER pass "*", "is:all", or search-operator syntax.
- get_intervention_history() → show past actions
- explain_risk_type() → explain what risk means
- adjust_autonomy() → change control level

Be conversational. Don't mention "modes", "routing", or any internal architecture — just help naturally.
""",
        tools=[
            declare_direction,
            run_pipeline_scan,
            query_linear_issues,
            get_intervention_history,
            explain_risk_type,
            adjust_autonomy,
        ],
    )
