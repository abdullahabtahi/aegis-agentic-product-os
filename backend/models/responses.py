"""Agent output types — what each LLM agent produces as structured output.

These are intermediate types (not persisted directly). After validation,
they are promoted to the canonical schema types (RiskSignal, Intervention, etc.).

Design: agents call FunctionTools (not output_schema) so tool_trajectory_avg_score
in adk eval can track correct tool sequences.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from models.schema import (
    ActionType,
    EscalationLevel,
    Evidence,
    LinearAction,
    PolicyDenialReason,
    ProductHeuristic,
    RiskType,
    Severity,
)


class RiskSignalDraft(BaseModel):
    """Produced by Product Brain's emit_risk_signal tool call.

    Confidence < 0.6 → return None (no RiskSignal created, no intervention surfaced).
    """
    risk_type: RiskType
    severity: Severity
    confidence: float  # 0–1
    evidence: list[Evidence] = Field(default_factory=list)
    headline: str  # ≤12 words, lost-upside framing — never threat
    explanation: str  # 2–3 sentences, cites product principle by ID
    product_principle_refs: list[str] = Field(default_factory=list)
    # Phase 3: chain-of-thought before structured output (post-hoc debugging)
    classification_rationale: str | None = None

    model_config = {"frozen": True}

    def is_confident(self, floor: float = 0.65) -> bool:
        return self.confidence >= floor


class InterventionProposal(BaseModel):
    """Produced by Coordinator's propose_intervention tool call."""
    action_type: ActionType
    escalation_level: EscalationLevel
    title: str
    rationale: str  # grounded in cited product principle
    product_principle_refs: list[str] = Field(default_factory=list)
    proposed_linear_action: LinearAction | None = None
    confidence: float

    model_config = {"frozen": True}


class GovernorDecision(BaseModel):
    """Produced by Governor (BaseAgent) after running all 8 policy checks.

    approved=True → intervention proceeds to HITL approval surface.
    approved=False → PolicyDeniedEvent written to AlloyDB, nothing surfaced to founder.
    """
    approved: bool
    denial_reason: PolicyDenialReason | None = None  # None if approved
    requires_double_confirm: bool = False  # Level 3–4 or kill_bet
    blast_radius_attached: bool = False

    model_config = {"frozen": True}


class PolicyCheckResult(BaseModel):
    """Internal result of a single Governor policy check."""
    check_name: str
    passed: bool
    denial_reason: PolicyDenialReason | None = None
    details: str = ""

    model_config = {"frozen": True}
