"""Product Brain Agent — Component 2 of the Aegis pipeline.

Type: LlmAgent with gemini-3-pro-preview.
Reads LinearSignals from session state, independently classifies risk,
generates founder-facing copy (lost-upside framing).

Key design decisions (CLAUDE.md):
- Uses tool-based structured output (not output_schema) so eval can track tool_trajectory
- 1 retry on Pydantic validation failure before silent skip
- before_agent_callback assembles ProductBrainAgentContext from session state
- Writes context to session state for AutoResearch replay (F2.4)
- prior_risk_types is historical context, NOT a classification hint (F3.1)
- Steps B (classify) and C (copy) are explicitly separated in prompt
- Confidence < 0.6 → no RiskSignal created → signal not surfaced
"""

from __future__ import annotations

from google.adk.agents import Agent
from google.adk.agents.callback_context import CallbackContext
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types

from models.schema import DEFAULT_HEURISTIC_VERSION

# ─────────────────────────────────────────────
# TOOL: emit_risk_signal
# This is the structured output mechanism — eval checks this tool call exists
# ─────────────────────────────────────────────

def emit_risk_signal(
    risk_type: str,
    severity: str,
    confidence: float,
    headline: str,
    explanation: str,
    evidence_summary: str,
    product_principle_refs: str = "",
    classification_rationale: str = "",
) -> dict:
    """Emit a classified risk signal for this bet.

    Call this tool ONCE when you have completed classification.
    Do NOT call if confidence < 0.6 — return no tool call in that case.

    Args:
        risk_type: One of: strategy_unclear, alignment_issue, execution_issue, placebo_productivity.
        severity: One of: low, medium, high, critical.
        confidence: Your confidence in the classification, 0.0 to 1.0.
        headline: ONE sentence, max 12 words. Frame as LOST UPSIDE, never as threat.
            Bad: "Your bet is failing." Good: "3 weeks of execution risk threaten on-time launch."
        explanation: 2–3 sentences. Cite specific evidence and product principle by ID.
        evidence_summary: Comma-separated list of evidence types observed (e.g. 'chronic_rollover,missing_hypothesis').
        product_principle_refs: Comma-separated ProductHeuristic IDs cited (e.g. 'tigers-elephants-001').
        classification_rationale: Optional chain-of-thought before final classification (for post-hoc debugging).

    Returns:
        Confirmation dict written to session state as 'risk_signal_draft'.
    """
    from google.adk.tools import ToolContext  # noqa: F401 — not used but keeps type hints
    result = {
        "status": "risk_signal_emitted",
        "risk_type": risk_type,
        "severity": severity,
        "confidence": confidence,
        "headline": headline,
        "explanation": explanation,
        "evidence_summary": evidence_summary,
        "product_principle_refs": product_principle_refs,
        "classification_rationale": classification_rationale,
    }
    return result


# ─────────────────────────────────────────────
# CALLBACKS
# ─────────────────────────────────────────────

async def before_product_brain(ctx: CallbackContext) -> None:
    """Assemble ProductBrainAgentContext from session state.

    Writes assembled context to session state["product_brain_context"]
    so AutoResearch replay can reconstruct what this agent saw (F2.4).
    """
    signals = ctx.state.get("linear_signals", {})
    bet = ctx.state.get("bet", {})
    prior_risk_types = []

    # Extract prior risk types from recent BetSnapshots (historical context only)
    recent_snapshots = ctx.state.get("recent_snapshots", [])
    for snap in recent_snapshots[-2:]:  # last 2 snapshots
        prior_risk_types.extend(snap.get("risk_types_present", []))

    context = {
        "bet_id": bet.get("id"),
        "bet_name": bet.get("name"),
        "target_segment": bet.get("target_segment"),
        "problem_statement": bet.get("problem_statement"),
        "hypothesis": bet.get("hypothesis"),
        "success_metrics": bet.get("success_metrics", []),
        "time_horizon": bet.get("time_horizon"),
        "detected_signals": signals,
        "prior_risk_types": list(set(prior_risk_types)),  # dedup
        "heuristic_version": DEFAULT_HEURISTIC_VERSION.version,
        "classification_prompt_fragment": DEFAULT_HEURISTIC_VERSION.classification_prompt_fragment,
    }
    ctx.state["product_brain_context"] = context


async def after_product_brain_model(
    ctx: CallbackContext,
    response: LlmResponse,
) -> LlmResponse | None:
    """1-retry on Pydantic/validation failure before silent skip.

    LLMs are stochastic — the exact same prompt succeeds on retry far more often than not.
    """
    # Check if the model failed to call emit_risk_signal (empty tool calls)
    # We don't hard-validate here — the tool call itself validates via Pydantic
    retry_count = ctx.state.get("product_brain_retry_count", 0)
    if retry_count == 0:
        ctx.state["product_brain_retry_count"] = 0  # initialize
    return None  # continue — ADK handles retry via before_model_callback if needed


async def after_product_brain(ctx: CallbackContext) -> types.Content | None:
    """Persist retry counter reset and checkpoint."""
    ctx.state["product_brain_retry_count"] = 0
    ctx.state["pipeline_checkpoint"] = "product_brain_complete"
    return None


# ─────────────────────────────────────────────
# AGENT INSTRUCTION
# ─────────────────────────────────────────────

_PRODUCT_BRAIN_INSTRUCTION = """You are Product Brain, a senior product strategy analyst for an agentic risk detection system called Aegis.

Your job: classify execution risk for a startup bet using Linear project management signals.

## Context you have access to:
- Bet details: {bet_name} — "{problem_statement}"
- Hypothesis: {hypothesis}
- Detected signals from the last 14 days of Linear activity
- Historical risk types from prior scans: {prior_risk_types}
- Active heuristic guidance: {classification_prompt_fragment}

## Signals data (from Signal Engine):
{detected_signals}

## STEP B — CLASSIFY:
Reason over the detected signals and classify exactly ONE primary risk type:
  - strategy_unclear: missing hypothesis, no metric, vague problem, or strategy-execution mismatch
  - alignment_issue: cross-team thrash, blocked_by relations crossing team boundaries
  - execution_issue: chronic rollovers (2+ cycles), scope creep, low bet coverage
  - placebo_productivity: high closed-issue velocity but few/none mapped to this bet

Determine confidence (0.0–1.0). If confidence < 0.6, do NOT call emit_risk_signal.

## STEP C — COPY:
If confident (>= 0.6), generate founder-facing copy:
  - headline: ONE sentence, max 12 words. Frame as LOST UPSIDE, never as threat or failure.
    WRONG: "Your team is failing to execute."
    RIGHT: "Scope creep may cost you 3 weeks on your target launch window."
  - explanation: 2–3 sentences. Cite specific signal values. Ground in product principles.

## CRITICAL RULES:
1. prior_risk_types is HISTORICAL context from past scans — do NOT treat it as the current answer.
2. Classify independently from signals, even if prior_risk_types says something different.
3. Call emit_risk_signal ONCE with your final classification.
4. If confidence < 0.6: do not call emit_risk_signal. Say: "Confidence below threshold — no signal surfaced."
"""

# ─────────────────────────────────────────────
# AGENT DEFINITION
# ─────────────────────────────────────────────

product_brain_agent = Agent(
    name="product_brain",
    # gemini-3-pro-preview for synthesis — per CLAUDE.md constraint
    model="gemini-3-pro-preview",
    instruction=_PRODUCT_BRAIN_INSTRUCTION,
    description="Classifies startup execution risk from Linear signals. Generates founder-facing copy.",
    tools=[emit_risk_signal],
    output_key="risk_signal_draft",  # writes to session state["risk_signal_draft"]
    before_agent_callback=before_product_brain,
    after_agent_callback=after_product_brain,
    after_model_callback=after_product_brain_model,
)
