"""Conversational Agent — Unified entry point for Aegis.

This agent handles BOTH:
1. Natural conversation (questions, explanations, queries)
2. Pipeline triggering (autonomous risk scans)

No separate router needed - agent decides internally when to trigger pipeline vs chat.
"""

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

        async for _ in sub_runner.run_async(
            user_id="system",
            session_id=sub_session.id,
            new_message=genai_types.Content(
                role="user",
                parts=[genai_types.Part.from_text("run pipeline scan")],
            ),
        ):
            pass  # drain event stream; state accumulates in sub_session

        final = await sub_ss.get_session(
            app_name="aegis_sub",
            user_id="system",
            session_id=sub_session.id,
        )
        return dict(final.state) if final else {}

    except Exception as exc:
        logger.error(
            "[ConversationalAgent] Sub-pipeline failed — falling back to synthetic state: %s",
            exc,
            exc_info=True,
        )
        return {}


# ─────────────────────────────────────────────
# PIPELINE TOOL — Triggers autonomous scan
# ─────────────────────────────────────────────


async def run_pipeline_scan(
    bet_id: str,
    tool_context: ToolContext,
) -> dict[str, Any]:
    """
    Trigger autonomous pre-mortem risk scan for a bet.

    This runs the full 5-stage pipeline:
    Signal Engine → Product Brain → Coordinator → Governor → Executor

    Results will emit to frontend via AG-UI state updates.

    Args:
        bet_id: The bet ID to scan

    Returns:
        Status dict with scan_id and message
    """
    try:
        # Get bet and workspace from state
        workspace_id = tool_context.state.get("workspace_id")
        bet = tool_context.state.get("bet")

        if not workspace_id or not bet:
            return {
                "status": "error",
                "message": "Missing workspace_id or bet in session state. "
                "Please provide bet details first.",
            }

        # ADK session state serializes everything as dicts (JSON).
        # compute_signals expects a Pydantic Bet model — normalize here.
        if isinstance(bet, dict):
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

        # Forward pipeline outputs to the conversational tool context
        for key in (
            "risk_signal_draft",
            "governor_decision",
            "pipeline_status",
            "intervention_proposal",
            "awaiting_approval_intervention",
            "pending_intervention_id",
            "policy_checks",
        ):
            if key in pipeline_state:
                tool_context.state[key] = pipeline_state[key]

        final_status = pipeline_state.get("pipeline_status", "complete")
        tool_context.state["pipeline_status"] = final_status
        tool_context.state["current_stage"] = STAGE_NAMES[4]

        if final_status == "awaiting_founder_approval":
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

        return {
            "status": "pipeline_complete",
            "pipeline_status": final_status,
            "risk_detected": has_signal,
            "intervention_queued": has_intervention,
            "message": (
                "Pre-mortem scan complete. "
                + (
                    "A risk was detected and an intervention is awaiting your approval in the Inbox."
                    if final_status == "awaiting_founder_approval"
                    else "No policy-passing intervention was generated this cycle."
                    if not has_signal
                    else "Risk detected. Governor evaluated the proposal."
                )
            ),
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
    Query Linear issues for a workspace.

    Use this to show evidence, explore work patterns, or answer questions
    about what's in Linear.

    Args:
        query: Search query (e.g., "issues without bet mention")

    Returns:
        List of matching issues with titles, status, URLs
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

    cutoff = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
    workspace_id = tool_context.state.get("workspace_id")

    issue_filter: dict[str, Any] = {"updatedAt": {"gte": cutoff}}
    if workspace_id:
        issue_filter["project"] = {"id": {"in": [workspace_id]}}

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

    # Keyword filter when a specific query is provided
    q = query.lower()
    if q and q not in ("all", "recent", "latest", "issues"):
        nodes = [n for n in nodes if q in n["title"].lower()]

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

    # TODO: Query AlloyDB interventions table
    # For now, return placeholder
    return {
        "status": "success",
        "interventions": [
            {
                "action": "add_success_metric",
                "bet": "Ship v2 onboarding",
                "timestamp": "2h ago",
                "outcome": "Created Linear issue ENG-47",
            }
        ],
    }


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

    # TODO: Update workspace.control_level in AlloyDB
    tool_context.state["control_level"] = control_level

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
            "hypothesis_required": bool(hypothesis),
            "metric_linked_required": False,
        },
        "acknowledged_risks": [],
        "linear_project_ids": [],
        "linear_issue_ids": [],
        "doc_refs": [],
        "created_at": now,
        "last_monitored_at": now,
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
- Provides direction context after already declaring (bet is in session state)
- Asks about current risk status: "What risks do I have?"

**WHEN TO CHAT NATURALLY:**
Use query tools and conversational responses when user:
- Greets you: "hi", "hello"
- Asks questions: "What does alignment_issue mean?", "Why 65% confidence?"
- Explores evidence: "Show me Linear issues", "What actions did you take?"
- Requests explanations: "How does this work?", "What's my autonomy level?"

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
- run_pipeline_scan() → trigger full risk scan on current direction
- query_linear_issues() → show Linear evidence
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
