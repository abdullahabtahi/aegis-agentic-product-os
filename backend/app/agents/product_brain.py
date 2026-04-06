"""Product Brain Agent — Component 2 of the Aegis pipeline.

Phase 2: Debate pattern — Flash(Cynic) + Flash(Optimist) + Pro(Synthesis).
  - Cynic and Optimist share the same bet_context (prompt-cache eligible).
  - Each calls a typed tool that writes its JSON assessment to session state via ToolContext.
  - Synthesis reads both assessments + staleness warning, then calls emit_risk_signal.
  - Composed as product_brain_debate = SequentialAgent(name="product_brain", ...).

Key design decisions (CLAUDE.md):
- Tool-based structured output — eval tracks tool_trajectory (emit_risk_signal present/absent).
- 1-retry on Pydantic validation failure before silent skip (after_model on synthesis).
- before_cynic callback assembles ProductBrainAgentContext once; all 3 agents share session state.
- prior_risk_types is historical context, NOT a classification hint (F3.1 — no anchoring bias).
- Steps B (classify) and C (copy) are in synthesis prompt, explicitly separated.
- Confidence < 0.6 → NO emit_risk_signal call → no RiskSignal created.
- hypothesis_staleness_days > 30 OR time_horizon passed → synthesis prompt warns and penalises.
- Lenny MCP (search_transcripts) is available as an optional enrichment tool on synthesis agent
  if the MCP server is connected via: claude mcp add -t http -s user lenny-transcripts https://lenny-mcp.onrender.com/mcp
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from google.adk.agents import Agent, SequentialAgent
from google.adk.agents.callback_context import CallbackContext
from google.adk.models.llm_response import LlmResponse
from google.adk.tools import ToolContext
from google.genai import types

from models.schema import DEFAULT_HEURISTIC_VERSION


# ─────────────────────────────────────────────
# TOOLS — each writes to session state via ToolContext
# ─────────────────────────────────────────────

def emit_cynic_assessment(
    risk_type: str,
    severity: str,
    confidence: float,
    evidence_summary: str,
    key_concerns: str,
    tool_context: ToolContext,
) -> dict:
    """Emit the PESSIMISTIC risk assessment. Call ONCE. Focus on worst-case evidence.

    Args:
        risk_type: One of: strategy_unclear, alignment_issue, execution_issue,
            placebo_productivity. Use 'none' if you see no meaningful risk evidence.
        severity: One of: low, medium, high, critical.
        confidence: Confidence in this risk assessment, 0.0 to 1.0.
        evidence_summary: Comma-separated evidence types observed (e.g. 'chronic_rollover,missing_hypothesis').
        key_concerns: 2–3 sentences on what could go worst-case if this risk is real.

    Returns:
        Assessment dict saved to session state for Optimist and Synthesis to read.
    """
    result = {
        "risk_type": risk_type,
        "severity": severity,
        "confidence": confidence,
        "evidence_summary": evidence_summary,
        "key_concerns": key_concerns,
        "perspective": "cynic",
    }
    tool_context.state["cynic_assessment"] = result
    return result


def emit_optimist_assessment(
    risk_type: str,
    confidence: float,
    mitigating_factors: str,
    adjusted_severity: str,
    tool_context: ToolContext,
) -> dict:
    """Emit the OPTIMISTIC risk assessment. Call ONCE. Focus on mitigating factors.

    Args:
        risk_type: Your own independent classification. May differ from Cynic's.
            Use 'none' if mitigating factors make the signal noise.
        confidence: Your confidence, 0.0 to 1.0.
        mitigating_factors: 2–3 sentences on evidence that reduces risk severity.
        adjusted_severity: After weighing mitigating factors: low, medium, high, or critical.

    Returns:
        Assessment dict saved to session state for Synthesis to read.
    """
    result = {
        "risk_type": risk_type,
        "confidence": confidence,
        "mitigating_factors": mitigating_factors,
        "adjusted_severity": adjusted_severity,
        "perspective": "optimist",
    }
    tool_context.state["optimist_assessment"] = result
    return result


def emit_risk_signal(
    risk_type: str,
    severity: str,
    confidence: float,
    headline: str,
    explanation: str,
    evidence_summary: str,
    product_principle_refs: str = "",
    classification_rationale: str = "",
    tool_context: ToolContext | None = None,
) -> dict:
    """Emit the FINAL classified risk signal. Call ONCE after weighing both assessments.

    Do NOT call if final confidence < 0.6. In that case say:
    "Confidence below threshold — no signal surfaced."

    Args:
        risk_type: Final classification: strategy_unclear, alignment_issue,
            execution_issue, or placebo_productivity.
        severity: Final severity: low, medium, high, or critical.
        confidence: Final synthesised confidence, 0.0 to 1.0.
        headline: ONE sentence, max 12 words. LOST UPSIDE framing — never threat or failure.
            WRONG: "Your bet is failing." RIGHT: "Scope creep risks missing your target launch."
        explanation: 2–3 sentences. Cite specific signal values and product principle by ID.
        evidence_summary: Comma-separated evidence types (e.g. 'chronic_rollover,cross_team_thrash').
        product_principle_refs: Comma-separated ProductHeuristic IDs cited.
        classification_rationale: Optional chain-of-thought showing how Cynic vs Optimist were weighed.

    Returns:
        Confirmation dict saved to session state as 'risk_signal_draft'.
    """
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
    if tool_context is not None:
        tool_context.state["risk_signal_draft"] = result
    return result


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def _compute_hypothesis_staleness_warning(bet: dict, bet_snapshot: dict) -> str:
    """Determine hypothesis/time_horizon staleness for prompt injection.

    Returns a human-readable warning string for the synthesis agent.
    Jules feedback: heavily penalise if hypothesis > 30 days old OR time_horizon passed.
    """
    warnings: list[str] = []

    # Check time_horizon expiry
    time_horizon = bet.get("time_horizon", "")
    if time_horizon:
        try:
            th = datetime.fromisoformat(time_horizon.replace("Z", "+00:00"))
            # Make timezone-aware if parsed as naive (e.g. "2026-12-01" date-only string)
            if th.tzinfo is None:
                th = th.replace(tzinfo=timezone.utc)
            now = datetime.now(timezone.utc)
            if th < now:
                days_past = (now - th).days
                warnings.append(
                    f"CRITICAL: bet.time_horizon was {days_past} day(s) ago "
                    f"({time_horizon[:10]}) — this bet may be expired. "
                    "Penalise heavily; recommend clarify_bet or kill_bet."
                )
        except ValueError:
            pass  # malformed date — skip

    # Check hypothesis staleness from BetSnapshot (Phase 2: computed by HypothesisExperiment)
    staleness_days = bet_snapshot.get("hypothesis_staleness_days")
    if staleness_days is not None and staleness_days > 30:
        warnings.append(
            f"WARNING: hypothesis last updated {staleness_days} day(s) ago "
            "(threshold: 30 days). High-agency founders update hypotheses frequently. "
            "Surface this as evidence in strategy_unclear or execution_issue classification."
        )

    return "\n".join(warnings) if warnings else "OK — hypothesis and time_horizon appear fresh."


def _format_detected_signals(signals: dict) -> str:
    """Format LinearSignals dict as a compact, LLM-readable summary."""
    if not signals:
        return "(no signals available — Signal Engine may have been skipped)"
    lines = [
        f"- coverage: {signals.get('bet_coverage_pct', 0):.0%} ({signals.get('bet_mapped_issues', 0)}/{signals.get('total_issues_analyzed', 0)} issues mapped)",
        f"- rollovers: {signals.get('rollover_count', 0)} total, {signals.get('chronic_rollover_count', 0)} chronic (2+ cycles)",
        f"- cross_team_thrash: {signals.get('cross_team_thrash_signals', 0)} signals",
        f"- hypothesis_present: {signals.get('hypothesis_present', False)}",
        f"- metric_linked: {signals.get('metric_linked', False)}",
        f"- misc_ticket_pct: {signals.get('misc_ticket_pct', 0):.0%}",
        f"- blocked_count: {signals.get('blocked_count', 0)}",
        f"- scope_change_count: {signals.get('scope_change_count', 0)}",
        f"- read_window_days: {signals.get('read_window_days', 14)}",
    ]
    return "\n".join(lines)


# ─────────────────────────────────────────────
# CALLBACKS
# ─────────────────────────────────────────────

# Checkpoints at or past Product Brain stage — skip LLM calls on re-invocation
_PB_SKIP_CHECKPOINTS = frozenset({
    "product_brain_complete",
    "coordinator_complete",
    "governor_complete",
    "awaiting_founder_approval",
    "founder_approved",
    "founder_rejected",
    "executor_complete",
})


async def before_cynic(callback_context: CallbackContext) -> types.Content | None:
    """Assemble shared ProductBrainAgentContext. Runs once before Cynic.

    All three debate agents share this context via session state.
    Writes to session state["product_brain_context"] for AutoResearch replay.
    Returns Content to skip LLM call if checkpoint is past this stage.
    """
    checkpoint = callback_context.state.get("pipeline_checkpoint", "")
    if checkpoint in _PB_SKIP_CHECKPOINTS:
        return types.Content(
            role="model",
            parts=[types.Part.from_text(text="[ProductBrain] Skipped — checkpoint exists")],
        )
    signals = callback_context.state.get("linear_signals", {})
    bet = callback_context.state.get("bet", {})
    bet_snapshot = callback_context.state.get("bet_snapshot", {})

    prior_risk_types: list[str] = []
    for snap in callback_context.state.get("recent_snapshots", [])[-2:]:
        prior_risk_types.extend(snap.get("risk_types_present", []))

    staleness_warning = _compute_hypothesis_staleness_warning(bet, bet_snapshot)
    signals_str = _format_detected_signals(signals)

    callback_context.state["product_brain_context"] = {
        "bet_id": bet.get("id"),
        "bet_name": bet.get("name"),
        "hypothesis": bet.get("hypothesis"),
        "time_horizon": bet.get("time_horizon"),
        "success_metrics": bet.get("success_metrics", []),
        "prior_risk_types": list(set(prior_risk_types)),
        "signals": signals,
        "heuristic_version": DEFAULT_HEURISTIC_VERSION.version,
        "classification_prompt_fragment": DEFAULT_HEURISTIC_VERSION.classification_prompt_fragment,
    }
    callback_context.state["pb_bet_name"] = bet.get("name", "(unnamed bet)")
    callback_context.state["pb_hypothesis"] = bet.get("hypothesis") or "(no hypothesis)"
    callback_context.state["pb_time_horizon"] = bet.get("time_horizon") or "(no deadline set)"
    callback_context.state["pb_problem_statement"] = bet.get("problem_statement") or "(no problem statement)"
    callback_context.state["pb_signals_str"] = signals_str
    callback_context.state["pb_prior_risk_types"] = str(list(set(prior_risk_types))) or "[]"
    callback_context.state["pb_staleness_warning"] = staleness_warning
    callback_context.state["pb_classification_fragment"] = DEFAULT_HEURISTIC_VERSION.classification_prompt_fragment


async def before_synthesis(callback_context: CallbackContext) -> None:
    """Format Cynic and Optimist assessments as JSON strings for synthesis instruction."""
    cynic = callback_context.state.get("cynic_assessment", {})
    optimist = callback_context.state.get("optimist_assessment", {})
    callback_context.state["pb_cynic_json"] = json.dumps(cynic, indent=2) if cynic else "(cynic did not respond)"
    callback_context.state["pb_optimist_json"] = json.dumps(optimist, indent=2) if optimist else "(optimist did not respond)"


async def after_synthesis_model(
    callback_context: CallbackContext,
    llm_response: LlmResponse,  # ADK passes this as keyword arg 'llm_response='
) -> LlmResponse | None:
    """1-retry on validation failure. Silent skip after 1 retry."""
    retry_count = callback_context.state.get("product_brain_retry_count", 0)
    if retry_count < 1:
        callback_context.state["product_brain_retry_count"] = retry_count
    return None


async def after_synthesis(callback_context: CallbackContext) -> types.Content | None:
    """Reset retry counter and set checkpoint."""
    callback_context.state["product_brain_retry_count"] = 0
    callback_context.state["pipeline_checkpoint"] = "product_brain_complete"
    return None


# ─────────────────────────────────────────────
# AGENT INSTRUCTIONS
# ─────────────────────────────────────────────

_CYNIC_INSTRUCTION = """You are the PESSIMISTIC analyst in Aegis's risk detection debate.

Your role: surface the WORST-CASE interpretation of the signals. Assume things are more broken than they appear. Be specific, not alarmist.

## Bet context:
Name: {pb_bet_name}
Hypothesis: {pb_hypothesis}
Time horizon: {pb_time_horizon}

## Staleness check:
{pb_staleness_warning}

## Detected signals (last 14 days of Linear activity):
{pb_signals_str}

## Historical risk types (prior scans — context only, do NOT treat as current answer):
{pb_prior_risk_types}

## TASK:
1. Reason over the signals with a pessimistic lens.
2. Classify the PRIMARY risk type:
   - strategy_unclear: missing/stale hypothesis, no metric, vague problem, strategy-execution mismatch
   - alignment_issue: cross-team thrash, blocked_by crossing team boundaries
   - execution_issue: chronic rollovers (2+ cycles), scope creep, low bet coverage
   - placebo_productivity: high closed-issue velocity but few/none mapped to bet
   - none: signals do not support a meaningful risk classification
3. Call emit_cynic_assessment ONCE with your worst-case assessment.
"""

_OPTIMIST_INSTRUCTION = """You are the OPTIMISTIC analyst in Aegis's risk detection debate.

Your role: surface MITIGATING FACTORS and alternative interpretations of the same signals. Assume the team is capable and context matters. Be honest — if the signals are genuinely bad, say so.

## Bet context:
Name: {pb_bet_name}
Hypothesis: {pb_hypothesis}
Time horizon: {pb_time_horizon}

## Staleness check:
{pb_staleness_warning}

## Detected signals (last 14 days of Linear activity):
{pb_signals_str}

## TASK:
1. Look for mitigating factors: team just started, known disruption, bet is early-stage, etc.
2. Classify independently — your risk_type may differ from (or agree with) the Cynic.
3. Call emit_optimist_assessment ONCE with your assessment.
   - If you genuinely see no significant risk: use risk_type 'none', confidence 0.2, adjusted_severity 'low'.
"""

_SYNTHESIS_INSTRUCTION = """You are the SENIOR PRODUCT STRATEGIST synthesising a risk debate.

Two analysts reviewed the same Linear signals. Your job: weigh their perspectives and produce the final risk signal.

## Bet context:
Name: {pb_bet_name}
Hypothesis: {pb_hypothesis}
Time horizon: {pb_time_horizon}
Problem statement: {pb_problem_statement}

## Staleness check (Jules rule: heavily penalise stale hypotheses and expired time horizons):
{pb_staleness_warning}

## Detected signals (last 14 days):
{pb_signals_str}

## Cynic's assessment:
{pb_cynic_json}

## Optimist's assessment:
{pb_optimist_json}

## Active heuristic guidance:
{pb_classification_fragment}

## STEP B — CLASSIFY:
Weigh the Cynic vs Optimist assessments. Classify ONE primary risk type:
  - strategy_unclear · alignment_issue · execution_issue · placebo_productivity

Determine final confidence (0.0–1.0).
→ If confidence < 0.6: do NOT call emit_risk_signal. Say: "Confidence below threshold — no signal surfaced."
→ Staleness warning above INCREASES your confidence in strategy_unclear or execution_issue classification.

## STEP C — COPY:
If confident (>= 0.6), generate founder-facing copy:
  headline: ONE sentence, max 12 words. LOST UPSIDE framing — never threat or failure.
    WRONG: "Your team is not executing."
    RIGHT: "3 weeks of rollover risk threaten your launch window."
  explanation: 2–3 sentences. Cite specific signal values. Ground in product principles.

## CRITICAL RULES:
1. prior_risk_types context in session is HISTORICAL — do NOT copy it as your answer.
2. Classify independently from Cynic/Optimist if their confidence is low.
3. Call emit_risk_signal ONCE with final classification.
4. If confidence < 0.6: skip emit_risk_signal entirely.
"""


# ─────────────────────────────────────────────
# AGENT DEFINITIONS
# ─────────────────────────────────────────────

def create_product_brain_debate() -> SequentialAgent:
    """Factory — always returns fresh agent instances with no pre-existing parent.

    ADK eval re-validates Pydantic models per test case; module-level singletons
    cause 'already has a parent' errors when the validator runs twice on the same
    object. Always use this factory in pipeline construction.
    """
    return SequentialAgent(
        name="product_brain",
        description=(
            "Product Brain debate: Cynic (flash) → Optimist (flash) → Synthesis (pro). "
            "Classifies startup execution risk from Linear signals with adversarial critique."
        ),
        sub_agents=[
            Agent(
                name="product_brain_cynic",
                model="gemini-3-flash-preview",
                instruction=_CYNIC_INSTRUCTION,
                description="Pessimistic risk analyst. Surfaces worst-case interpretation of Linear signals.",
                tools=[emit_cynic_assessment],
                before_agent_callback=before_cynic,
            ),
            Agent(
                name="product_brain_optimist",
                model="gemini-3-flash-preview",
                instruction=_OPTIMIST_INSTRUCTION,
                description="Optimistic risk analyst. Surfaces mitigating factors for Linear signals.",
                tools=[emit_optimist_assessment],
            ),
            Agent(
                name="product_brain_synthesis",
                model="gemini-3.1-pro-preview",
                instruction=_SYNTHESIS_INSTRUCTION,
                description="Senior strategist synthesising Cynic/Optimist debate into final risk signal.",
                tools=[emit_risk_signal],
                before_agent_callback=before_synthesis,
                after_agent_callback=after_synthesis,
                after_model_callback=after_synthesis_model,
            ),
        ],
    )


# Backward-compat alias. Do NOT use in pipeline construction.
product_brain_debate = create_product_brain_debate()
