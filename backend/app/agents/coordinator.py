"""Coordinator Agent — Component 3 of the Aegis pipeline.

Type: LlmAgent with gemini-3.1-pro-preview.
Receives RiskSignal, selects ONE intervention from the taxonomy.

Key design decisions (CLAUDE.md):
- Uses tool-based structured output — eval tracks propose_intervention tool call
- Escalation ladder: Coordinator RECOMMENDS, Governor ENFORCES (check #8)
- Cannot produce more than one intervention per risk signal
- Reads prior_interventions from session state to reason about current escalation level
- Writes CoordinatorAgentContext to session state for AutoResearch replay (F2.4)
"""

from __future__ import annotations

from google.adk.agents import Agent
from google.adk.agents.callback_context import CallbackContext
from google.adk.tools import ToolContext
from google.genai import types

from models.schema import DEFAULT_HEURISTIC_VERSION

# ─────────────────────────────────────────────
# TOOL: propose_intervention
# ─────────────────────────────────────────────


def propose_intervention(
    action_type: str,
    escalation_level: int,
    title: str,
    rationale: str,
    confidence: float,
    product_principle_refs: str = "",
    proposed_comment: str = "",
    proposed_issue_title: str = "",
    proposed_issue_description: str = "",
    tool_context: ToolContext | None = None,
) -> dict:
    """Propose exactly ONE intervention for the detected risk signal.

    Call this tool ONCE with your final intervention recommendation.
    Governor (Component 4) will run 8 deterministic checks before approval.

    Args:
        action_type: One of the valid action types from the Intervention Taxonomy.
            Level 1: clarify_bet, add_hypothesis, add_metric
            Level 2: rescope, align_team, redesign_experiment
            Level 3: pre_mortem_session, jules_instrument_experiment, jules_add_guardrails,
                     jules_refactor_blocker, jules_scaffold_experiment
            Level 4: kill_bet
            Special: no_intervention (low confidence or rate cap)
        escalation_level: 1, 2, 3, or 4. Must match action_type level.
        title: Short title for the intervention (shown in Intervention Inbox).
        rationale: 2–3 sentences grounded in product principles and evidence.
        confidence: Your confidence in this intervention, 0.0–1.0.
        product_principle_refs: Comma-separated ProductHeuristic IDs cited.
        proposed_comment: For add_comment actions — the comment text to post to Linear.
        proposed_issue_title: For create_issue actions — the issue title.
        proposed_issue_description: For create_issue actions — the issue description.

    Returns:
        Confirmation dict stored in session state as 'intervention_proposal'.
    """
    result = {
        "status": "intervention_proposed",
        "action_type": action_type,
        "escalation_level": escalation_level,
        "title": title,
        "rationale": rationale,
        "confidence": confidence,
        "product_principle_refs": product_principle_refs,
        "proposed_comment": proposed_comment,
        "proposed_issue_title": proposed_issue_title,
        "proposed_issue_description": proposed_issue_description,
    }
    if tool_context is not None:
        tool_context.state["intervention_proposal"] = result
    return result


# ─────────────────────────────────────────────
# CALLBACKS
# ─────────────────────────────────────────────

# Checkpoints at or past Coordinator stage — skip LLM call on re-invocation
_COORD_SKIP_CHECKPOINTS = frozenset(
    {
        "coordinator_complete",
        "governor_complete",
        "awaiting_founder_approval",
        "founder_approved",
        "founder_rejected",
        "executor_complete",
    }
)


async def before_coordinator(callback_context: CallbackContext) -> types.Content | None:
    """Assemble CoordinatorAgentContext from session state.

    Writes to session state["coordinator_context"] for AutoResearch replay.
    Returns Content to skip LLM call if checkpoint is past this stage.
    """
    checkpoint = callback_context.state.get("pipeline_checkpoint", "")
    if checkpoint in _COORD_SKIP_CHECKPOINTS:
        return types.Content(
            role="model",
            parts=[
                types.Part.from_text(text="[Coordinator] Skipped — checkpoint exists")
            ],
        )
    from app.app_utils.trace_logging import record_trace_start

    record_trace_start(callback_context)

    bet = callback_context.state.get("bet", {})
    risk_signal_draft = callback_context.state.get("risk_signal_draft", "")
    prior_interventions = callback_context.state.get("prior_interventions", [])

    # Fetch workspace-level calibration data (accepted/rejected counts)
    from db.repository import get_workspace_intervention_stats

    workspace_id = callback_context.state.get(
        "workspace_id",
        bet.get("workspace_id", ""),
    )
    workspace_stats = await get_workspace_intervention_stats(workspace_id)

    context = {
        "bet_id": bet.get("id"),
        "bet_name": bet.get("name"),
        "bet_status": bet.get("status"),
        "hypothesis": bet.get("hypothesis"),
        "success_metrics": bet.get("success_metrics", []),
        "time_horizon": bet.get("time_horizon"),
        "acknowledged_risks": bet.get("acknowledged_risks", []),
        "risk_signal_draft": risk_signal_draft,
        "prior_interventions": prior_interventions,
        "workspace_stats": workspace_stats,
        "heuristic_version": DEFAULT_HEURISTIC_VERSION.version,
        "intervention_ranking_weights": [
            w.model_dump()
            for w in DEFAULT_HEURISTIC_VERSION.intervention_ranking_weights
        ],
    }
    callback_context.state["coordinator_context"] = context

    # Write flat keys for ADK instruction template substitution: {bet_name}, {hypothesis}, etc.
    callback_context.state["bet_name"] = bet.get("name", "")
    callback_context.state["hypothesis"] = bet.get("hypothesis", "")
    callback_context.state["acknowledged_risks"] = bet.get("acknowledged_risks", [])
    callback_context.state["prior_interventions"] = prior_interventions
    callback_context.state["intervention_ranking_weights"] = context[
        "intervention_ranking_weights"
    ]
    callback_context.state["workspace_stats"] = workspace_stats


async def after_coordinator(callback_context: CallbackContext) -> types.Content | None:
    from app.app_utils.trace_logging import log_coordinator_trace

    callback_context.state["pipeline_checkpoint"] = "coordinator_complete"
    await log_coordinator_trace(callback_context)
    return None


# ─────────────────────────────────────────────
# AGENT INSTRUCTION
# ─────────────────────────────────────────────

_COORDINATOR_INSTRUCTION = """You are the Coordinator for Aegis, an agentic risk detection system for startup founders.

Your job: select exactly ONE intervention for the detected risk signal.
You will call propose_intervention once with your final recommendation.

## Risk signal to act on:
{risk_signal_draft}

## Bet context:
Name: {bet_name}
Hypothesis: {hypothesis}
Acknowledged risks: {acknowledged_risks}

## Prior interventions on this bet:
{prior_interventions}

## Intervention Taxonomy (select from EXACTLY these):

LEVEL 1 — Clarify (try first):
  clarify_bet: Add comment asking founder to clarify bet scope (strategy_unclear, confidence < 0.7)
  add_hypothesis: Create issue to document missing hypothesis (missing_hypothesis evidence)
  add_metric: Create issue to define success metric (missing_metric evidence)

LEVEL 2 — Adjust:
  rescope: Add comment with suggested reduced scope (execution_issue + chronic rollovers)
  align_team: Comment linking cross-team blocked issues (alignment_issue + cross-team thrash)
  redesign_experiment: Draft pre-mortem doc (strategy_unclear at high severity)

LEVEL 3 — Escalate:
  pre_mortem_session: Create issue proposing a team pre-mortem meeting
  jules_instrument_experiment: Jules scaffolds observability for experiment
  jules_add_guardrails: Jules adds safety checks to risky deployment
  jules_refactor_blocker: Jules refactors technical blocker
  jules_scaffold_experiment: Jules creates experiment scaffold

LEVEL 4 — Terminal:
  kill_bet: Draft retrospective document (critical + multiple prior cycles)

Special:
  no_intervention: Log and surface reasoning; no action taken

## ESCALATION GUIDANCE (Governor enforces hard rules — you provide best recommendation):
- Prefer Level 1 if no prior intervention exists for this bet
- Prefer Level 2 if a Level 1 was accepted but didn't resolve the risk
- Level 3 eligible only if Level 2 was accepted + failed to resolve
- Level 4 (kill_bet) only if Level 3 was attempted
- Exception: severity == critical AND chronic_rollover_count >= 3 → you may recommend Level 3

## WORKSPACE CALIBRATION (founder decision history — use to calibrate confidence):
{workspace_stats}

## RANKING WEIGHTS (higher = prefer this action):
{intervention_ranking_weights}

## RULES:
1. Propose EXACTLY ONE intervention — call propose_intervention once.
2. If the risk signal draft is empty or confidence was below threshold, call propose_intervention with action_type="no_intervention".
3. Never propose a Jules action if no GitHub is mentioned in the bet context.
4. The rationale must cite the specific evidence values from the risk signal.
"""

# ─────────────────────────────────────────────
# AGENT DEFINITION
# ─────────────────────────────────────────────


def create_coordinator_agent() -> Agent:
    """Factory — always returns a fresh instance with no pre-existing parent.

    See signal_engine.py factory comment for why singletons break ADK eval.
    """
    return Agent(
        name="coordinator",
        model="gemini-3.1-pro-preview",
        instruction=_COORDINATOR_INSTRUCTION,
        description="Selects one intervention from the taxonomy for a detected risk signal.",
        tools=[propose_intervention],
        before_agent_callback=before_coordinator,
        after_agent_callback=after_coordinator,
    )
