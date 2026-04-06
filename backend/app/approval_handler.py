"""Approval Handler — state transitions for founder accept/reject.

Pure functions that return NEW state dicts (never mutate input).
CopilotKit (Phase 5) or test harness calls these to transition
pipeline_status after Governor halts at "awaiting_founder_approval".

Two invocation model:
  Invocation 1: Pipeline runs → Governor halts → awaiting_founder_approval
  External:     approve_intervention() or reject_intervention()
  Invocation 2: Pipeline re-runs → all prior agents skip → Executor runs
"""

from __future__ import annotations

from datetime import datetime, timezone

from models.schema import RejectionReasonCategory


def approve_intervention(session_state: dict) -> dict:
    """Transition pipeline from awaiting_founder_approval → founder_approved.

    Returns a NEW dict — does NOT mutate the input.

    Raises:
        ValueError: If pipeline_status is not "awaiting_founder_approval".
    """
    current_status = session_state.get("pipeline_status")
    if current_status != "awaiting_founder_approval":
        raise ValueError(
            f"Cannot approve: pipeline_status is '{current_status}', "
            "expected 'awaiting_founder_approval'."
        )

    return {
        **session_state,
        "pipeline_status": "founder_approved",
        "pipeline_checkpoint": "founder_approved",
        "founder_decided_at": datetime.now(timezone.utc).isoformat(),
    }


def reject_intervention(
    session_state: dict,
    rejection_reason: RejectionReasonCategory,
    founder_note: str | None = None,
) -> dict:
    """Transition pipeline from awaiting_founder_approval → founder_rejected.

    Stores rejection reason on the intervention payload and appends to
    rejection_history for Override & Teach (Governor reads this on next cycle).

    Returns a NEW dict — does NOT mutate the input.

    Raises:
        ValueError: If pipeline_status is not "awaiting_founder_approval".
    """
    current_status = session_state.get("pipeline_status")
    if current_status != "awaiting_founder_approval":
        raise ValueError(
            f"Cannot reject: pipeline_status is '{current_status}', "
            "expected 'awaiting_founder_approval'."
        )

    now = datetime.now(timezone.utc).isoformat()

    # Build updated intervention payload with rejection info
    intervention = session_state.get("awaiting_approval_intervention", {})
    updated_intervention = {
        **intervention,
        "status": "rejected",
        "rejection_reason": rejection_reason,
        "founder_note": founder_note,
        "decided_at": now,
    }

    # Build rejection history entry for Override & Teach
    rejection_entry = {
        "risk_type": intervention.get("risk_type", ""),
        "action_type": intervention.get("action_type", ""),
        "rejection_reason": rejection_reason,
        "rejected_at": now,
        "bet_id": session_state.get("bet", {}).get("id", ""),
    }

    # Append to existing history (immutable — new list)
    existing_history = list(session_state.get("rejection_history", []))
    updated_history = [*existing_history, rejection_entry]

    return {
        **session_state,
        "pipeline_status": "founder_rejected",
        "pipeline_checkpoint": "founder_rejected",
        "founder_decided_at": now,
        "awaiting_approval_intervention": updated_intervention,
        "rejection_history": updated_history,
    }
