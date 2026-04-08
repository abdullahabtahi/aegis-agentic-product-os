"""Override & Teach — suppression logic for rejected interventions.

Pure functions (no side effects, no mutation). Governor calls should_suppress()
before running the 8 policy checks. The rejection handler (approval_handler.py)
calls record_rejection() to build the history.

Rule: if the same (risk_type, action_type, rejection_reason) is rejected 2x
within 30 days, Governor auto-suppresses that combination for auto_suppress_days.

Suppression is surfaced in the Suppression Log UI so founders can see and undo it.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone


def build_suppression_key(
    risk_type: str, action_type: str, rejection_reason: str
) -> str:
    """Deterministic key for grouping rejections by pattern."""
    return f"{risk_type}:{action_type}:{rejection_reason}"


def should_suppress(
    rejection_history: list[dict],
    risk_type: str,
    action_type: str,
    threshold: int = 2,
    window_days: int = 30,
) -> tuple[bool, str | None]:
    """Check if a (risk_type, action_type) pattern should be suppressed.

    Scans rejection_history for matching entries within window_days.
    Returns (True, matching_reason) if count >= threshold for any reason,
    else (False, None).
    """
    if not rejection_history:
        return False, None

    cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)

    # Group by rejection_reason within window
    reason_counts: dict[str, int] = {}
    for entry in rejection_history:
        if (
            entry.get("risk_type") == risk_type
            and entry.get("action_type") == action_type
        ):
            rejected_at_str = entry.get("rejected_at", "")
            try:
                rejected_at = datetime.fromisoformat(rejected_at_str)
                if rejected_at.tzinfo is None:
                    rejected_at = rejected_at.replace(tzinfo=timezone.utc)
            except (ValueError, TypeError):
                continue

            if rejected_at >= cutoff:
                reason = entry.get("rejection_reason", "other")
                reason_counts[reason] = reason_counts.get(reason, 0) + 1

    # Check if any reason hits the threshold
    for reason, count in reason_counts.items():
        if count >= threshold:
            return True, reason

    return False, None


def record_rejection(
    rejection_history: list[dict],
    risk_type: str,
    action_type: str,
    rejection_reason: str,
    rejected_at: str,
) -> list[dict]:
    """Append a rejection entry to history. Returns a NEW list (immutable)."""
    entry = {
        "risk_type": risk_type,
        "action_type": action_type,
        "rejection_reason": rejection_reason,
        "rejected_at": rejected_at,
    }
    return [*rejection_history, entry]
