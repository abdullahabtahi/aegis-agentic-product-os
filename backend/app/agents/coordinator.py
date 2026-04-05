"""Coordinator Agent — Component 3 of the Aegis pipeline.

Type: LlmAgent with gemini-3-pro-preview.
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
    return {
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


# ─────────────────────────────────────────────
# CALLBACKS
# ─────────────────────────────────────────────

async def before_coordinator(ctx: CallbackContext) -> None:
    """Assemble CoordinatorAgentContext from session state.

    Writes to session state["coordinator_context"] for AutoResearch replay.
    """
    bet = ctx.state.get("bet", {})
    risk_signal_draft = ctx.state.get("risk_signal_draft", "")
    prior_interventions = ctx.state.get("prior_interventions", [])
    workspace_id = ctx.state.get("workspace_id", "")

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
        "heuristic_version": DEFAULT_HEURISTIC_VERSION.version,
        "intervention_ranking_weights": [
            w.model_dump() for w in DEFAULT_HEURISTIC_VERSION.intervention_ranking_weights
        ],
    }
    ctx.state["coordinator_context"] = context


async def after_coordinator(ctx: CallbackContext) -> types.Content | None:
    ctx.state["pipeline_checkpoint"] = "coordinator_complete"
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

coordinator_agent = Agent(
    name="coordinator",
    # gemini-3-pro-preview for synthesis — per CLAUDE.md constraint
    model="gemini-3-pro-preview",
    instruction=_COORDINATOR_INSTRUCTION,
    description="Selects one intervention from the taxonomy for a detected risk signal.",
    tools=[propose_intervention],
    output_key="intervention_proposal",
    before_agent_callback=before_coordinator,
    after_agent_callback=after_coordinator,
)
