from typing import List
from models.schema import PivotPScore, PivotRecommendation, PivotDiagnosis


def compute_pivot_recommendation(scores: List[PivotPScore]) -> PivotRecommendation:
    """Compute the diagnosis recommendation based on the 4Ps scores.

    Logic:
    - All 4 >= 4: stay_course
    - Problem <= 2: kill (Problem override)
    - 3+ scores <= 2: large_pivot
    - 1-2 weak scores: small_pivot
    """
    score_map = {s.p: s.confidence for s in scores}

    # 1. Problem override
    if score_map.get("problem", 5) <= 2:
        return "kill"

    # 2. Count weak scores (<= 2)
    weak_count = sum(1 for s in scores if s.confidence <= 2)

    if weak_count >= 3:
        return "large_pivot"
    if weak_count >= 1:
        return "small_pivot"

    # 3. Check for strong conviction (all >= 4)
    if all(s.confidence >= 4 for s in scores):
        return "stay_course"

    # Default fallback
    return "small_pivot"


def generate_recommendation_rationale(
    recommendation: PivotRecommendation,
    scores: List[PivotPScore],
) -> str:
    """Generate a 1-sentence rationale for the recommendation."""
    weakest = min(scores, key=lambda s: s.confidence if s.confidence is not None else 6)

    if recommendation == "kill":
        return f"Low confidence in the core problem lens ({weakest.confidence}/5). If the problem isn't real, no other adjustment saves the bet."

    if recommendation == "stay_course":
        return "Strong conviction across all four strategic lenses. Current issues are likely execution-related, not strategic."

    if recommendation == "large_pivot":
        return f"Foundational weakness detected across {sum(1 for s in scores if s.confidence <= 2)} lenses. A significant strategic pivot is warranted."

    return f"Weakness detected in the {weakest.label} lens. Adjust targeting or solution approach before concluding this bet is dead."
