"""Core entity models — mirrors context/data-schema.ts exactly.

Rules (from CLAUDE.md):
- Never add a field to implementation before adding it to data-schema.ts first.
- Never mutate objects — always return new copies (use model.model_copy(update={...})).
- All IDs are UUIDs (str).
- hypothesis_staleness_days: int | None — None = Phase 2 not active, not 0.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field

# ─────────────────────────────────────────────
# ENUM LITERALS  (mirror TypeScript union types)
# ─────────────────────────────────────────────

RiskType = Literal[
    "strategy_unclear",
    "alignment_issue",
    "execution_issue",
    "placebo_productivity",
]

Severity = Literal["low", "medium", "high", "critical"]

BetStatus = Literal["detecting", "active", "paused", "validated", "killed"]

ScanStatus = Literal["ok", "error"]

ScanErrorCode = Literal["rate_limit", "auth_expired", "api_timeout", "empty_workspace"]

DeclarationSourceType = Literal["linear_project", "agent_inferred", "manual"]

ActionType = Literal[
    "clarify_bet",
    "add_hypothesis",
    "add_metric",
    "rescope",
    "kill_bet",
    "redesign_experiment",
    "pre_mortem_session",
    "align_team",
    "no_intervention",
    "jules_instrument_experiment",
    "jules_add_guardrails",
    "jules_refactor_blocker",
    "jules_scaffold_experiment",
]

InterventionStatus = Literal["pending", "accepted", "rejected", "dismissed"]

EscalationLevel = Literal[1, 2, 3, 4]

RejectionReasonCategory = Literal[
    "evidence_too_weak",
    "already_handled",
    "not_a_priority",
    "wrong_risk_type",
    "other",
]

# L1: founder earns trust first (draft only). L2: require approval (default). L3: low-risk auto-actions.
ControlLevel = Literal["draft_only", "require_approval", "autonomous_low_risk"]

ExperimentType = Literal[
    "interview", "ab_test", "fake_door", "prototype", "analytics", "survey"
]

ExperimentOutcome = Literal["confirmed", "refuted", "inconclusive", "abandoned"]

EvidenceType = Literal[
    "low_bet_coverage",
    "chronic_rollover",
    "missing_hypothesis",
    "missing_metric",
    "cross_team_thrash",
    "scope_creep",
    "bet_fragmentation",
    "strategy_doc_mismatch",
    "placebo_productivity",
    "kill_criteria_triggered",  # Feature 007: deadline passed, not marked met
]

TraceType = Literal[
    "bet_clustering",
    "risk_detection",
    "risk_classification",
    "intervention_selection",
    "linear_write",
]

HeuristicVersionStatus = Literal["candidate", "active", "reverted"]

PolicyDenialReason = Literal[
    "confidence_below_floor",
    "duplicate_suppression",
    "rate_cap",
    "jules_gate",
    "reversibility_check",
    "acknowledged_risk",
    "override_teach_suppression",
    "escalation_ladder",
]


# ─────────────────────────────────────────────
# VALUE OBJECTS
# ─────────────────────────────────────────────


class Metric(BaseModel):
    name: str
    target_value: float | str
    current_value: float | str | None = None
    unit: str

    model_config = {"frozen": True}


class BetHealthBaseline(BaseModel):
    expected_bet_coverage_pct: float
    expected_weekly_velocity: float
    hypothesis_required: bool
    metric_linked_required: bool

    model_config = {"frozen": True}


class DeclarationSource(BaseModel):
    type: DeclarationSourceType
    linear_project_id: str | None = None
    raw_artifact_refs: list[str] = Field(default_factory=list)

    model_config = {"frozen": True}


class AcknowledgedRisk(BaseModel):
    risk_type: RiskType
    acknowledged_at: str  # ISO 8601
    founder_note: str | None = None

    model_config = {"frozen": True}


class EvidenceIssue(BaseModel):
    id: str
    title: str
    status: str
    url: str

    model_config = {"frozen": True}


class LinearSignals(BaseModel):
    total_issues_analyzed: int
    bet_mapped_issues: int
    bet_coverage_pct: float
    rollover_count: int
    chronic_rollover_count: int
    blocked_count: int
    misc_ticket_pct: float
    hypothesis_present: bool
    metric_linked: bool
    metric_linked_source: str | None = None
    cross_team_thrash_signals: int
    scope_change_count: int
    read_window_days: int = 14  # always 14 — bounded Signal Engine reads
    placebo_productivity_score: float | None = None
    evidence_issues: list[EvidenceIssue] = Field(default_factory=list)  # top-10 issues for evidence citation

    model_config = {"frozen": True}


class Evidence(BaseModel):
    type: EvidenceType
    description: str
    linear_refs: list[str] = Field(default_factory=list)
    observed_value: float | str
    threshold_value: float | str
    period_days: int

    model_config = {"frozen": True}


class BlastRadiusPreview(BaseModel):
    affected_issue_count: int
    affected_assignee_ids: list[str] = Field(default_factory=list)
    affected_project_ids: list[str] = Field(default_factory=list)
    estimated_notification_count: int
    reversible: bool

    model_config = {"frozen": True}


class LinearActionCreateIssue(BaseModel):
    title: str
    description: str
    project_id: str | None = None
    label: str | None = None

    model_config = {"frozen": True}


class LinearActionDraftDocument(BaseModel):
    title: str
    content: str
    issue_id: str | None = None

    model_config = {"frozen": True}


class LinearAction(BaseModel):
    """Bounded write operations — only these 5 are permitted. Nothing else."""

    add_label: str | None = None
    add_comment: str | None = None
    create_issue: LinearActionCreateIssue | None = None
    update_status: str | None = None
    update_assignee: str | None = None
    draft_document: LinearActionDraftDocument | None = None

    model_config = {"frozen": True}


# ─────────────────────────────────────────────
# CORE ENTITIES  (map 1:1 to AlloyDB tables)
# ─────────────────────────────────────────────


# ─────────────────────────────────────────────
# FEATURE 007: KILL CRITERIA
# ─────────────────────────────────────────────

KillCriteriaAction = Literal["pivot", "kill", "extend"]
KillCriteriaStatus = Literal["pending", "triggered", "met", "waived"]


class KillCriteria(BaseModel):
    condition: str                    # "Ship to 3 paying users by May 1"
    deadline: str                     # ISO 8601 date (YYYY-MM-DD)
    committed_action: KillCriteriaAction
    status: KillCriteriaStatus = "pending"
    triggered_at: str | None = None
    met_at: str | None = None
    waived_at: str | None = None
    waived_reason: str | None = None

    model_config = {"frozen": True}


# ─────────────────────────────────────────────
# FEATURE 008: CONVICTION SCORE
# ─────────────────────────────────────────────

ConvictionLevel = Literal["strong", "developing", "nascent", "critical"]


class ConvictionDimension(BaseModel):
    name: str
    key: str
    points_earned: float
    points_max: float
    met: bool

    model_config = {"frozen": True}


class ConvictionScore(BaseModel):
    total: float           # 0–100
    level: ConvictionLevel
    dimensions: list[ConvictionDimension] = Field(default_factory=list)
    computed_at: str

    model_config = {"frozen": True}


# ─────────────────────────────────────────────
# FEATURE 009: WEEKLY FOUNDER BRIEF
# ─────────────────────────────────────────────


class BriefMostUrgentIntervention(BaseModel):
    id: str
    bet_name: str
    action_type: ActionType
    severity: Severity
    headline: str

    model_config = {"frozen": True}


class BriefBetSummary(BaseModel):
    bet_id: str
    bet_name: str
    conviction_delta: float | None = None
    conviction_level: ConvictionLevel
    conviction_total: float
    kill_criteria_status: KillCriteriaStatus | None = None
    kill_criteria_condition: str | None = None

    model_config = {"frozen": True}


class FounderBrief(BaseModel):
    workspace_id: str
    generated_at: str
    week_label: str
    bets_improving: list[BriefBetSummary] = Field(default_factory=list)
    bets_at_risk: list[BriefBetSummary] = Field(default_factory=list)
    pending_intervention_count: int = 0
    most_urgent_intervention: BriefMostUrgentIntervention | None = None
    weekly_question: str
    total_bets: int = 0
    avg_conviction: float | None = None
    scans_this_week: int = 0

    model_config = {"frozen": True}


# ─────────────────────────────────────────────
# FEATURE 010: PIVOT DIAGNOSIS
# ─────────────────────────────────────────────

PivotRecommendation = Literal["stay_course", "small_pivot", "large_pivot", "kill"]
PivotP = Literal["problem", "persona", "product", "positioning"]


class PivotPScore(BaseModel):
    p: PivotP
    label: str
    confidence: int | None = None     # 1–5; None when skipped
    founder_note: str = ""
    is_weakest: bool = False

    model_config = {"frozen": True}


class PivotDiagnosis(BaseModel):
    id: str
    intervention_id: str | None = None
    bet_id: str
    conducted_at: str
    scores: list[PivotPScore] = Field(default_factory=list)
    recommendation: PivotRecommendation
    recommendation_rationale: str
    weakest_p: PivotP

    model_config = {"frozen": True}


class Workspace(BaseModel):
    id: str
    linear_team_id: str
    strategy_doc_refs: list[str] = Field(default_factory=list)
    active_bet_ids: list[str] = Field(default_factory=list)
    control_level: ControlLevel = "draft_only"  # Governor check #7
    # Phase 6: GitHub repo URL — Governor jules_gate (check #4) reads this.
    # None → all Jules actions auto-denied until connected via Settings UI.
    github_repo: str | None = None
    created_at: str

    model_config = {"frozen": True}


class Bet(BaseModel):
    id: str
    workspace_id: str
    name: str
    target_segment: str
    problem_statement: str
    hypothesis: str
    success_metrics: list[Metric] = Field(default_factory=list)
    time_horizon: str  # ISO 8601 date
    declaration_source: DeclarationSource
    declaration_confidence: float
    status: BetStatus
    health_baseline: BetHealthBaseline
    acknowledged_risks: list[AcknowledgedRisk] = Field(default_factory=list)
    # Feature 007: pre-declared failure condition
    kill_criteria: KillCriteria | None = None
    linear_project_ids: list[str] = Field(default_factory=list)
    linear_issue_ids: list[str] = Field(default_factory=list)
    doc_refs: list[str] = Field(default_factory=list)
    created_at: str
    last_monitored_at: str | None = None  # null until first scan — never set to now() on declaration
    last_health_score: float | None = None  # null until first scan; populated from BetSnapshot
    completed_at: str | None = None

    model_config = {"frozen": True}


class BetSnapshot(BaseModel):
    id: str
    bet_id: str
    captured_at: str
    period_start: str
    period_end: str
    linear_signals: LinearSignals
    health_score: float  # 0–100
    risk_types_present: list[RiskType] = Field(default_factory=list)
    status: ScanStatus
    error_code: ScanErrorCode | None = None

    # Feature 008: conviction score — augments health_score with named dimensions
    conviction_score: ConvictionScore | None = None

    # Phase 2: null = not yet computed (Phase 2 not active). 0 = tested today. Never default to 0.
    hypothesis_staleness_days: int | None = None
    hypothesis_experiment_count: int = 0
    last_experiment_outcome: ExperimentOutcome | None = None

    # Phase 3: cross-workspace outcome signals
    similar_bet_outcome_pct: float | None = None
    outcome_pattern_source_count: int = 0

    # Phase 2: between-cycle cache control
    cache_valid_until: str | None = None

    model_config = {"frozen": True}


class PolicyDeniedEvent(BaseModel):
    id: str
    bet_id: str
    intervention_id: str
    denial_reason: PolicyDenialReason
    created_at: str

    model_config = {"frozen": True}


class RiskSignal(BaseModel):
    id: str
    bet_id: str
    snapshot_id: str
    risk_type: RiskType
    severity: Severity
    confidence: float  # 0–1
    evidence: list[Evidence] = Field(default_factory=list)
    headline: str
    explanation: str
    evidence_summary: str = ""  # one-line digest of raw Linear evidence shown in UI
    product_principle_refs: list[str] = Field(default_factory=list)
    status: Literal["open", "actioned", "resolved", "dismissed"] = "open"
    detected_by: str
    detected_at: str
    resolved_at: str | None = None

    model_config = {"frozen": True}


class Intervention(BaseModel):
    id: str
    risk_signal_id: str
    bet_id: str
    workspace_id: str = ""  # denormalized for fast workspace-scoped queries
    action_type: ActionType
    escalation_level: EscalationLevel
    title: str
    rationale: str
    product_principle_refs: list[str] = Field(default_factory=list)
    proposed_linear_action: LinearAction | None = None
    blast_radius: BlastRadiusPreview | None = None
    proposed_comment: str | None = None
    proposed_issue_title: str | None = None
    proposed_issue_description: str | None = None
    requires_double_confirm: bool = False
    confidence: float
    status: InterventionStatus = "pending"
    decided_at: str | None = None
    founder_note: str | None = None
    rejection_reason: RejectionReasonCategory | None = None
    # Feature 010: 4Ps pivot diagnosis — attached after conversational session
    pivot_diagnosis: PivotDiagnosis | None = None
    created_at: str

    model_config = {"frozen": True}


class Outcome(BaseModel):
    id: str
    intervention_id: str
    bet_id: str
    snapshot_before_id: str
    snapshot_after_id: str
    health_score_delta: float
    risk_resolved: bool
    founder_rating: Literal[1, 2, 3, 4, 5] | None = None
    measured_at: str

    model_config = {"frozen": True}


# ─────────────────────────────────────────────
# AUTORESEARCH + EVAL LAYER
# ─────────────────────────────────────────────


class AgentTrace(BaseModel):
    id: str
    workspace_id: str
    trace_type: TraceType
    agent_name: str
    # Hash: sha256(json.dumps({"bet_id": bet.id, "signals": linear_signals (exclude read_window_days),
    #   "heuristic_version": heuristic_version_id}, sort_keys=True))
    # MUST exclude timestamps, workspace_id, session metadata.
    input_context_hash: str
    output_summary: str
    output_ids: list[str] = Field(default_factory=list)
    # Phase 3: chain-of-thought before Pydantic output; enables post-hoc debugging
    classification_rationale: str | None = None
    heuristic_version_id: str
    eval_score: float | None = None
    eval_rubric: str | None = None
    human_accepted: bool | None = None
    latency_ms: int
    created_at: str

    model_config = {"frozen": True}


class RiskThresholds(BaseModel):
    low_bet_coverage_threshold: float = 0.5
    chronic_rollover_threshold: int = 2
    misc_ticket_threshold: float = 0.3
    cross_team_thrash_threshold: int = 3
    min_confidence_to_surface: float = 0.65  # Governor floor (check #1)
    intervention_rate_cap_days: int = 7
    placebo_productivity_threshold: float = 0.7
    auto_suppress_days: int = 14
    # After N suppressions for same (risk_type, action_type, reason) → escalate to AutoResearch
    max_suppress_count: int = 3

    model_config = {"frozen": True}


class InterventionWeight(BaseModel):
    action_type: ActionType
    weight: float

    model_config = {"frozen": True}


class HeuristicVersion(BaseModel):
    id: str
    version: str  # semver e.g. "1.0.0"
    status: HeuristicVersionStatus
    risk_thresholds: RiskThresholds = Field(default_factory=RiskThresholds)
    classification_prompt_fragment: str
    intervention_ranking_weights: list[InterventionWeight] = Field(default_factory=list)
    eval_score: float = 0.0
    acceptance_rate: float = 0.0
    resolution_rate: float = 0.0
    false_positive_rate: float = 0.0
    # Versioned Constitution: MAJOR never auto-promoted by AutoResearch
    version_type: Literal["MAJOR", "MINOR", "PATCH"] = "MINOR"
    requires_manual_review: bool = False
    git_commit_sha: str | None = None
    parent_version_id: str | None = None
    change_summary: str
    created_at: str
    activated_at: str | None = None
    reverted_at: str | None = None

    model_config = {"frozen": True}


class SuppressionRule(BaseModel):
    """Override & Teach: auto-suppress matching (risk_type, action_type, reason) after 2 rejections in 30d."""

    risk_type: RiskType
    action_type: ActionType
    rejection_reason: RejectionReasonCategory
    rejection_count: int
    first_rejected_at: str  # ISO 8601
    last_rejected_at: str  # ISO 8601
    suppressed_until: str  # ISO 8601 (last_rejected_at + auto_suppress_days)
    workspace_id: str

    model_config = {"frozen": True}


class BetRejection(BaseModel):
    id: str
    workspace_id: str
    raw_artifact_refs: list[str] = Field(default_factory=list)
    proposed_name: str
    rejection_reason: str | None = None
    rejected_at: str

    model_config = {"frozen": True}


class ProductHeuristic(BaseModel):
    id: str
    source: Literal["lenny", "shreyas", "tigers_elephants", "pmf_patterns", "custom"]
    risk_types: list[RiskType]
    principle: str
    example_pattern: str
    suggested_action: ActionType
    confidence_weight: float

    model_config = {"frozen": True}


# ─────────────────────────────────────────────
# PHASE 2 ENTITIES
# ─────────────────────────────────────────────


class HypothesisExperiment(BaseModel):
    id: str
    bet_id: str
    hypothesis_text: str
    experiment_type: ExperimentType
    outcome: ExperimentOutcome
    confidence_before: float
    confidence_after: float
    started_at: str
    completed_at: str | None = None
    created_by: Literal["founder", "agent_draft"]

    model_config = {"frozen": True}


class RejectionReasonCluster(BaseModel):
    id: str
    cluster_label: str
    intervention_types_affected: list[ActionType] = Field(default_factory=list)
    risk_types_affected: list[RiskType] = Field(default_factory=list)
    frequency: int = 0
    heuristic_change_candidates: list[str] = Field(default_factory=list)

    model_config = {"frozen": True}


class StartupFailurePattern(BaseModel):
    id: str
    failure_category: Literal[
        "no_market_need", "cash", "team", "competition", "timing", "execution"
    ]
    signal_fingerprint: list[str] = Field(default_factory=list)
    frequency_pct: float
    avg_time_to_failure_days: float | None = None
    source: Literal["cb_insights", "failory", "ideaproof", "internal_corpus"]
    embedding: list[float] = Field(default_factory=list)  # vector(768)

    model_config = {"frozen": True}


# ─────────────────────────────────────────────
# PHASE 3 ENTITIES
# ─────────────────────────────────────────────


class SignalStep(BaseModel):
    type: EvidenceType
    severity: Severity
    week: int

    model_config = {"frozen": True}


class InterventionStep(BaseModel):
    action_type: ActionType
    accepted: bool

    model_config = {"frozen": True}


class BetOutcomeRecord(BaseModel):
    id: str
    workspace_hash: str  # SHA256(workspace_id) — never reversible
    bet_archetype: str
    signal_sequence: list[SignalStep] = Field(default_factory=list)
    intervention_sequence: list[InterventionStep] = Field(default_factory=list)
    outcome: Literal["validated", "killed", "paused_long_term", "active"]
    risk_type_at_kill: RiskType | None = None
    embedding: list[float] = Field(default_factory=list)  # vector(768)

    model_config = {"frozen": True}


# ─────────────────────────────────────────────
# SEED DATA — HeuristicVersion v1.0.0 (Phase 1 static defaults)
# ─────────────────────────────────────────────
# Phase 1-3 workspaces use this. AutoResearch activates only after N=20 interactions.

DEFAULT_HEURISTIC_VERSION = HeuristicVersion(
    id="hv-v1-0-0",
    version="1.0.0",
    status="active",
    risk_thresholds=RiskThresholds(),
    classification_prompt_fragment=(
        "Classify risk using these evidence types: low_bet_coverage, chronic_rollover, "
        "missing_hypothesis, missing_metric, cross_team_thrash, scope_creep, "
        "bet_fragmentation, strategy_doc_mismatch, placebo_productivity. "
        "Frame findings as lost upside, not threat."
    ),
    intervention_ranking_weights=[
        InterventionWeight(action_type="clarify_bet", weight=0.9),
        InterventionWeight(action_type="add_hypothesis", weight=0.9),
        InterventionWeight(action_type="add_metric", weight=0.85),
        InterventionWeight(action_type="rescope", weight=0.8),
        InterventionWeight(action_type="align_team", weight=0.8),
        InterventionWeight(action_type="redesign_experiment", weight=0.7),
        InterventionWeight(action_type="pre_mortem_session", weight=0.65),
        InterventionWeight(action_type="kill_bet", weight=0.5),
    ],
    version_type="MAJOR",
    requires_manual_review=True,
    change_summary="Initial version — static defaults for Phase 1.",
    created_at=datetime.now(timezone.utc).isoformat(),
    activated_at=datetime.now(timezone.utc).isoformat(),
)
