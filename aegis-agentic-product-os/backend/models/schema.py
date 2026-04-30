from typing import List, Optional
from pydantic import BaseModel, Field

# ─────────────────────────────────────────────
# CONVICTION SCORE (Feature 008)
# ─────────────────────────────────────────────

class ConvictionDimension(BaseModel):
    key: str
    name: str
    met: bool
    points_earned: float
    points_max: float

class ConvictionScore(BaseModel):
    total: float
    level: str  # strong, developing, nascent, critical
    dimensions: List[ConvictionDimension]

# ─────────────────────────────────────────────
# PIVOT DIAGNOSIS (Feature 010)
# ─────────────────────────────────────────────

class PivotPScore(BaseModel):
    p: str  # problem, persona, product, positioning
    label: str
    confidence: Optional[int] = Field(None, ge=1, le=5)
    founder_note: str = ""
    is_weakest: bool = False

class PivotDiagnosis(BaseModel):
    id: str
    intervention_id: str
    bet_id: str
    conducted_at: str
    scores: List[PivotPScore]
    recommendation: str  # stay_course, small_pivot, large_pivot, kill
    recommendation_rationale: str
    weakest_p: Optional[str] = None

# ─────────────────────────────────────────────
# FOUNDER BRIEF (Feature 009)
# ─────────────────────────────────────────────

class BriefBetSummary(BaseModel):
    bet_id: str
    bet_name: str
    conviction_total: float
    conviction_level: str
    risk_count: int
    kill_criteria_status: str
    kill_criteria_condition: Optional[str] = None

class FounderBrief(BaseModel):
    workspace_id: str
    generated_at: str
    week_label: str
    bets_improving: List[BriefBetSummary]
    bets_at_risk: List[BriefBetSummary]
    pending_intervention_count: int
    most_urgent_intervention: Optional[str] = None
    weekly_question: str
    total_bets: int
    avg_conviction: Optional[float] = None
    scans_this_week: int
