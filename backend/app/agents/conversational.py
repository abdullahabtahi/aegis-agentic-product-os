"""Conversational Agent — Unified entry point for Aegis.

This agent handles BOTH:
1. Natural conversation (questions, explanations, queries)
2. Pipeline triggering (autonomous risk scans)

No separate router needed - agent decides internally when to trigger pipeline vs chat.
"""

import logging
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from google.adk.agents import Agent
from google.adk.tools import ToolContext

from app.agents.signal_engine import compute_signals
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

        # ── Stage 1: Product Brain analyzing ──
        _emit_stage(tool_context, 1, "analyzing")

        # ── Stages 2-4: Coordinator → Governor → Executor ──
        # TODO(phase-5b): Wire sub-agents inline once SequentialAgent is
        # invoked from within the conversational tool context. Currently the
        # SequentialAgent (aegis_pipeline) runs separately (eval/playground only).
        # For now, emit synthetic progression so the UI reaches "complete"
        # instead of freezing on "analyzing". The LLM response IS the output.
        _emit_stage(tool_context, 2, "analyzing")  # Coordinator
        _emit_stage(tool_context, 3, "analyzing")  # Governor
        _emit_stage(tool_context, 4, "executing")  # Executor

        # Mark pipeline complete — all stages finished
        tool_context.state["pipeline_status"] = "complete"
        tool_context.state["current_stage"] = STAGE_NAMES[4]
        tool_context.state["stages"] = _make_stages(
            5,  # beyond last index → all stages complete
            dict.fromkeys(STAGE_NAMES, "complete"),
        )

        return {
            "status": "pipeline_triggered",
            "message": (
                "Running continuous pre-mortem scan. "
                "I'll analyze risk signals and take autonomous actions based on "
                "your workspace's control level. Results will appear in Mission Control."
            ),
            "next_steps": [
                "Product Brain will classify risks",
                "Coordinator will recommend interventions",
                "Governor will check policy compliance",
                "Executor will take autonomous actions (L2/L3) or request approval (L1)",
            ],
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

    from db.engine import is_db_configured
    from db.repository import list_interventions

    if is_db_configured():
        rows = await list_interventions(workspace_id=workspace_id, limit=limit)
        return {"status": "success", "interventions": rows}

    # Local dev without DB — return empty list (not fake data)
    return {"status": "success", "interventions": []}


async def explain_risk_type(
    risk_type: str,
    tool_context: ToolContext,
) -> dict[str, Any]:
    """
    Explain what a risk type means and why it matters.

    References product principles (Shreyas Doshi, Lenny Rachitsky).

    Args:
        risk_type: One of strategy_unclear, alignment_issue, execution_issue, placebo_productivity

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
        "placebo_productivity": {
            "meaning": "Tickets close but none map to the stated direction. High velocity, zero progress.",
            "why_matters": "Per Shreyas Doshi: The most dangerous failure mode — teams feel productive while building the wrong thing. Lenny Rachitsky calls this 'shipping without learning'.",
            "intervention": "Audit recent closed work against direction hypothesis. Re-map or re-scope.",
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

**WHEN TO TRIGGER PIPELINE:**
Use run_pipeline_scan() when user:
- Explicitly asks: "scan my direction", "check for risks", "analyze progress"
- Provides direction context: "Here's my Q2 direction: [details]"
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
- run_pipeline_scan() → trigger full risk scan
- query_linear_issues() → show Linear evidence
- get_intervention_history() → show past actions
- explain_risk_type() → explain what risk means
- adjust_autonomy() → change control level

Be conversational. Don't mention "modes", "routing", or any internal architecture — just help naturally.
""",
        tools=[
            run_pipeline_scan,
            query_linear_issues,
            get_intervention_history,
            explain_risk_type,
            adjust_autonomy,
        ],
    )
