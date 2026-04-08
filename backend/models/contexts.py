"""Agent context objects — assembled at runtime, never persisted as-is.

These are the structured inputs injected into each agent via before_agent_callback.
Fields are narrowed to what each agent actually needs (context-minimization pattern).
Context objects are ALSO written to ctx.session.state so AutoResearch replay can
reconstruct what each agent saw during a pipeline run.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from models.schema import (
    AcknowledgedRisk,
    BetSnapshot,
    HeuristicVersion,
    Intervention,
    LinearSignals,
    Metric,
    Outcome,
    ProductHeuristic,
    RiskSignal,
    RiskType,
)


class BetForSignalEngine(BaseModel):
    """Narrow Bet view for Signal Engine — only what's needed to read Linear."""

    id: str
    name: str
    hypothesis: str
    success_metrics: list[Metric] = Field(default_factory=list)
    time_horizon: str
    health_baseline: models.schema.BetHealthBaseline  # noqa: F821
    linear_project_ids: list[str] = Field(default_factory=list)
    linear_issue_ids: list[str] = Field(default_factory=list)

    model_config = {"frozen": True}


class ExecutionAgentContext(BaseModel):
    """Context for Signal Engine (Component 1)."""

    bet: BetForSignalEngine
    recent_snapshots: list[BetSnapshot] = Field(default_factory=list)  # last 4 weeks
    acknowledged_risks: list[AcknowledgedRisk] = Field(default_factory=list)
    monitoring_period_days: int = 14

    model_config = {"frozen": True}


class BetForProductBrain(BaseModel):
    """Narrow Bet view for Product Brain — classification context only."""

    id: str
    name: str
    target_segment: str
    problem_statement: str
    hypothesis: str
    success_metrics: list[Metric] = Field(default_factory=list)
    time_horizon: str

    model_config = {"frozen": True}


class ProductBrainAgentContext(BaseModel):
    """Context for Product Brain Agent (Component 2).

    IMPORTANT: prior_risk_types is historical context (past BetSnapshots), NOT a
    current-cycle classification hint. Product Brain must reason independently over
    detected_signals. Do not pre-classify risk here — that would anchor LLM reasoning
    via confirmation bias.
    """

    bet: BetForProductBrain
    detected_signals: LinearSignals
    # Risk types from last 2 BetSnapshots — labeled as historical, not hypothesis.
    # Empty on first run.
    prior_risk_types: list[RiskType] = Field(default_factory=list)
    relevant_heuristics: list[ProductHeuristic] = Field(default_factory=list)
    strategy_doc_excerpts: list[str] = Field(default_factory=list)
    active_heuristic_version: HeuristicVersion

    model_config = {"frozen": True}


class BetForCoordinator(BaseModel):
    """Narrowed Bet for Coordinator — intervention-relevant fields only.

    Excludes: declaration_source, linear_issue_ids (potentially hundreds),
    doc_refs, created_at — not needed for intervention selection.
    acknowledged_risks included for Governor acknowledged_risk check context.
    """

    id: str
    name: str
    status: models.schema.BetStatus  # noqa: F821
    hypothesis: str
    success_metrics: list[Metric] = Field(default_factory=list)
    time_horizon: str
    acknowledged_risks: list[AcknowledgedRisk] = Field(default_factory=list)

    model_config = {"frozen": True}


class PriorIntervention(BaseModel):
    intervention: Intervention
    outcome: Outcome | None = None

    model_config = {"frozen": True}


class WorkspaceContext(BaseModel):
    other_active_bets: list[dict] = Field(
        default_factory=list
    )  # Pick<Bet, id|name|status>
    recent_accepted_interventions: int = 0
    recent_rejected_interventions: int = 0

    model_config = {"frozen": True}


class CoordinatorAgentContext(BaseModel):
    """Context for Coordinator Agent (Component 3)."""

    bet: BetForCoordinator
    risk_signal: RiskSignal
    prior_interventions: list[PriorIntervention] = Field(default_factory=list)
    workspace_context: WorkspaceContext = Field(default_factory=WorkspaceContext)
    active_heuristic_version: str  # HeuristicVersion.id

    model_config = {"frozen": True}


# Fix forward references

BetForSignalEngine.model_rebuild()
ExecutionAgentContext.model_rebuild()
CoordinatorAgentContext.model_rebuild()
