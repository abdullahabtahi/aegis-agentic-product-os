"""Agent trace logging — after_agent_callback helpers for persistence.

Creates AgentTrace records and persists them via db.repository.
Graceful degradation: if DB is not configured, traces are still written
to session state (for eval/debug) but not persisted.
"""

from __future__ import annotations

import logging
import time
import uuid

from datetime import datetime, timezone

from google.adk.agents.callback_context import CallbackContext

from app.app_utils.input_context_hash import compute_input_context_hash
from models.schema import DEFAULT_HEURISTIC_VERSION, TraceType

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return str(uuid.uuid4())


def _build_trace(
    callback_context: CallbackContext | dict,
    agent_name: str,
    trace_type: TraceType,
    output_summary: str,
    output_ids: list[str] | None = None,
    classification_rationale: str | None = None,
) -> dict:
    """Build an AgentTrace dict from callback context (or raw state dict).

    Reads bet_id, linear_signals, workspace_id from session state.
    Computes input_context_hash per CLAUDE.md spec.
    Accepts CallbackContext (LlmAgent callbacks) or plain dict (BaseAgent).
    """
    state = callback_context if isinstance(callback_context, dict) else callback_context.state
    bet = state.get("bet", {})
    bet_id = bet.get("id", "")
    workspace_id = state.get("workspace_id", bet.get("workspace_id", ""))
    linear_signals = state.get("linear_signals", {})
    heuristic_version_id = DEFAULT_HEURISTIC_VERSION.id

    input_hash = compute_input_context_hash(
        bet_id=bet_id,
        linear_signals=linear_signals if isinstance(linear_signals, dict) else {},
        heuristic_version_id=heuristic_version_id,
    )

    start_ms = state.get("_trace_start_ms", 0)
    latency_ms = int((time.monotonic() * 1000) - start_ms) if start_ms else 0

    return {
        "id": _new_id(),
        "workspace_id": workspace_id,
        "trace_type": trace_type,
        "agent_name": agent_name,
        "input_context_hash": input_hash,
        "output_summary": output_summary,
        "output_ids": output_ids or [],
        "classification_rationale": classification_rationale,
        "heuristic_version_id": heuristic_version_id,
        "latency_ms": latency_ms,
        "created_at": _now_iso(),
    }


def record_trace_start(callback_context: CallbackContext) -> None:
    """Call in before_agent_callback to stamp trace start time."""
    callback_context.state["_trace_start_ms"] = int(time.monotonic() * 1000)


async def log_product_brain_trace(callback_context: CallbackContext) -> None:
    """after_agent_callback for Product Brain synthesis — logs risk_classification trace."""
    from db.repository import save_agent_trace

    risk_draft = callback_context.state.get("risk_signal_draft", {})
    if isinstance(risk_draft, str):
        risk_draft = {}

    risk_type = risk_draft.get("risk_type", "none")
    confidence = risk_draft.get("confidence", 0.0)
    output_summary = (
        f"risk_type={risk_type}, confidence={confidence:.2f}"
        if risk_draft
        else "no_signal_surfaced"
    )
    classification_rationale = risk_draft.get("classification_rationale")

    trace = _build_trace(
        callback_context,
        agent_name="product_brain",
        trace_type="risk_classification",
        output_summary=output_summary,
        classification_rationale=classification_rationale,
    )
    callback_context.state["product_brain_trace"] = trace
    await save_agent_trace(trace)


async def log_coordinator_trace(callback_context: CallbackContext) -> None:
    """after_agent_callback for Coordinator — logs intervention_selection trace."""
    from db.repository import save_agent_trace

    proposal = callback_context.state.get("intervention_proposal", {})
    if isinstance(proposal, str):
        proposal = {}

    action_type = proposal.get("action_type", "no_intervention")
    confidence = proposal.get("confidence", 0.0)
    output_summary = f"action_type={action_type}, confidence={confidence:.2f}"

    trace = _build_trace(
        callback_context,
        agent_name="coordinator",
        trace_type="intervention_selection",
        output_summary=output_summary,
    )
    callback_context.state["coordinator_trace"] = trace
    await save_agent_trace(trace)


async def log_governor_trace(
    state: dict,
    approved: bool,
    denial_reason: str | None = None,
) -> None:
    """Called from GovernorAgent._run_async_impl after decision is made.

    Accepts raw session state dict (Governor is a BaseAgent, not LlmAgent).
    """
    from db.repository import save_agent_trace

    output_summary = (
        "approved" if approved else f"denied: {denial_reason or 'unknown'}"
    )
    trace = _build_trace(
        state,
        agent_name="governor",
        trace_type="risk_detection",
        output_summary=output_summary,
    )
    state["governor_trace"] = trace
    await save_agent_trace(trace)
