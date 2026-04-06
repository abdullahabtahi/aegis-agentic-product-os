"""AutoResearch — offline eval replay loop (stub).

Phase 4+: replays accumulated AgentTraces with mutated HeuristicVersion
parameters, scores with LLM-as-judge, promotes candidates on manual review.
"""

from __future__ import annotations


async def run_auto_research(traces: list[dict], heuristic_version_id: str) -> dict:
    """Stub: Phase 4+ offline replay. Returns no-op result."""
    return {
        "status": "stub",
        "message": "AutoResearch deferred — requires N=20 accepted/rejected interventions",
        "traces_count": len(traces),
        "heuristic_version_id": heuristic_version_id,
    }
