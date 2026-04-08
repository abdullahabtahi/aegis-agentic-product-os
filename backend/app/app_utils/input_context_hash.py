"""Compute input_context_hash for AgentTrace records.

Locked decision (CLAUDE.md):
  sha256(json.dumps({"bet_id", "signals" (exclude read_window_days),
    "heuristic_version_id"}, sort_keys=True))
  MUST exclude timestamps, workspace_id, session metadata.

This hash groups traces by identical input for AutoResearch replay.
"""

from __future__ import annotations

import hashlib
import json


def compute_input_context_hash(
    bet_id: str,
    linear_signals: dict,
    heuristic_version_id: str,
) -> str:
    """Return hex SHA-256 of the canonical input context.

    Args:
        bet_id: The bet being analysed.
        linear_signals: LinearSignals dict from Signal Engine.
            ``read_window_days`` is excluded (always 14 — adds no information).
        heuristic_version_id: Active HeuristicVersion.id.

    Returns:
        64-char lowercase hex digest.
    """
    signals_copy = {k: v for k, v in linear_signals.items() if k != "read_window_days"}
    payload = {
        "bet_id": bet_id,
        "signals": signals_copy,
        "heuristic_version_id": heuristic_version_id,
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
