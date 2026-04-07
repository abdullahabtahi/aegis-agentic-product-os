"""Conversational Agent — Unified entry point for Aegis.

This agent handles BOTH:
1. Natural conversation (questions, explanations, queries)
2. Pipeline triggering (autonomous risk scans)

No separate router needed - agent decides internally when to trigger pipeline vs chat.
"""

import logging
from typing import Any

from google.adk.agents import Agent
from google.adk.tools import ToolContext

from app.agents.signal_engine import compute_signals
from tools.linear_tools import get_linear_mcp

logger = logging.getLogger(__name__)


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
                          "Please provide bet details first."
            }

        logger.info(f"[ConversationalAgent] Triggering pipeline scan for bet {bet_id}")

        # Emit state update: scanning started
        tool_context.state["pipeline_status"] = "scanning"
        tool_context.state["scan_started_at"] = tool_context.state.get("timestamp")

        # Run Signal Engine (deterministic)
        linear_mcp = get_linear_mcp()
        bet_snapshot = await compute_signals(
            workspace_id=workspace_id,
            bet=bet,
            linear_mcp=linear_mcp,
        )

        # Write to state for Product Brain to pick up
        tool_context.state["linear_signals"] = bet_snapshot.linear_signals.model_dump()
        tool_context.state["bet_snapshot"] = bet_snapshot.model_dump()
        tool_context.state["pipeline_status"] = "analyzing"

        # NOTE: Product Brain → Coordinator → Governor → Executor
        # will run as sub-agents triggered by main pipeline.
        # For now, Signal Engine is the entry point.

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
                "Executor will take autonomous actions (L2/L3) or request approval (L1)"
            ]
        }

    except Exception as e:
        logger.error(f"[ConversationalAgent] Pipeline scan failed: {e}", exc_info=True)
        return {
            "status": "error",
            "message": f"Scan failed: {str(e)}. Please check workspace configuration."
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
    workspace_id = tool_context.state.get("workspace_id")
    if not workspace_id:
        return {"status": "error", "message": "No workspace configured"}

    # TODO: Implement actual Linear query via LinearMCP
    # For now, return placeholder
    return {
        "status": "success",
        "message": f"Searching Linear for: {query}",
        "issues": [
            {"id": "ENG-47", "title": "Redesign onboarding", "status": "In Progress"},
            {"id": "ENG-52", "title": "Add analytics", "status": "Backlog"},
        ]
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
                "outcome": "Created Linear issue ENG-47"
            }
        ]
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
            "intervention": "Clarify bet hypothesis and define success metric before continuing work."
        },
        "alignment_issue": {
            "meaning": "Work doesn't map to stated bet. Cross-team thrash or priority confusion.",
            "why_matters": "Team knows the plan but isn't executing it. Communication gap, not strategy gap.",
            "intervention": "Align team priorities. Reprioritize or rescope to match bet."
        },
        "execution_issue": {
            "meaning": "Chronic rollovers, blockers piling up, scope creep.",
            "why_matters": "Executing the right strategy but hitting friction. Scoping or unblocking needed.",
            "intervention": "Reduce scope, unblock dependencies, or add capacity."
        }
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
            "message": f"Invalid control level. Must be one of: {', '.join(valid_levels)}"
        }

    # TODO: Update workspace.control_level in AlloyDB
    tool_context.state["control_level"] = control_level

    level_names = {
        "draft_only": "L1 (Approval Required)",
        "require_approval": "L2 (Autonomous Low-Risk)",
        "autonomous_low_risk": "L3 (Full Autonomy)"
    }

    return {
        "status": "success",
        "message": f"Autonomy set to {level_names[control_level]}",
        "description": (
            "I'll now operate at this level. "
            "You can change this anytime by asking me to adjust autonomy."
        )
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
        description="Autonomous product strategist that monitors bets and takes corrective action",
        instruction="""
You are Aegis, an autonomous strategist helping founders with continuous pre-mortems.

**HOW YOU WORK:**
- You run background scans to detect strategy drift (missing metrics, misaligned work, execution blockers)
- You take autonomous actions based on workspace control level (L1/L2/L3)
- You chat naturally to explain risks, show evidence, and help founders make decisions

**WHEN TO TRIGGER PIPELINE:**
Use run_pipeline_scan() when user:
- Explicitly asks: "scan my bet", "check for risks", "analyze progress"
- Provides bet context: "Here's my Q2 bet: [details]"
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

Be conversational. Don't mention "modes" or "routing" - just help naturally.
""",
        tools=[
            run_pipeline_scan,
            query_linear_issues,
            get_intervention_history,
            explain_risk_type,
            adjust_autonomy,
        ],
    )
