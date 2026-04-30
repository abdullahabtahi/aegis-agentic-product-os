"""Pivot diagnosis scoring — Feature 010.

Pure function: no DB calls, no LLM calls.
Source: Todd Jackson's 4Ps framework (Problem, Persona, Product, Positioning).
"""
from __future__ import annotations

from models.schema import PivotPScore, PivotRecommendation

# Label lookup
_P_LABELS: dict[str, str] = {
    "problem": "Problem",
    "persona": "Persona",
    "product": "Product",
    "positioning": "Positioning",
}

# Ordered for tiebreaker (Problem first)
_P_ORDER = ["problem", "persona", "product", "positioning"]


def compute_pivot_recommendation(
    scores: list[PivotPScore],
) -> tuple[PivotRecommendation, str, str]:
    """Compute recommendation from 4 P scores.

    Returns (recommendation, rationale, weakest_p).

    Rules (from spec):
    1. Problem confidence ≤ 2 → "kill" (overrides all others)
    2. Count of weak scores (confidence ≤ 2, non-null):
       - 0 → "stay_course"
       - 1-2 → "small_pivot"
       - 3-4 → "large_pivot"
    3. If all scores are None (all skipped) → "stay_course" + special rationale
    """
    if not scores:
        return "stay_course", "No scores provided.", "problem"

    # Build a lookup: p → confidence
    conf: dict[str, int | None] = {s.p: s.confidence for s in scores}

    # All skipped?
    non_null = [c for c in conf.values() if c is not None]
    if not non_null:
        return (
            "stay_course",
            "Insufficient data — all questions were skipped.",
            "problem",
        )

    # Rule 1: Problem score ≤ 2 → kill
    problem_conf = conf.get("problem")
    if problem_conf is not None and problem_conf <= 2:
        return (
            "kill",
            "If the problem isn't genuinely painful enough, no other adjustment saves the bet.",
            "problem",
        )

    # Weakest P (lowest non-null; ties broken by _P_ORDER)
    weakest_p = min(
        (p for p in _P_ORDER if conf.get(p) is not None),
        key=lambda p: (conf[p], _P_ORDER.index(p)),  # type: ignore[index]
    )
    weakest_label = _P_LABELS[weakest_p]

    # Rule 2: count weak Ps (confidence ≤ 2, non-null only)
    weak_count = sum(
        1 for c in non_null if c <= 2
    )

    if weak_count == 0:
        rec: PivotRecommendation = "stay_course"
        rationale = (
            "Strong conviction across all four lenses. "
            "The issue may be execution, not strategy."
        )
    elif weak_count <= 2:
        rec = "small_pivot"
        rationale = (
            f"{weakest_label} is the weakest lens. "
            "Adjust targeting before concluding this bet is dead."
        )
    else:
        rec = "large_pivot"
        rationale = (
            "Multiple foundational assumptions are weak. "
            "A significant rethink is warranted."
        )

    return rec, rationale, weakest_p
