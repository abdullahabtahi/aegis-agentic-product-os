/**
 * Aegis frontend types — mirrors context/data-schema.ts for UI use.
 * Source of truth: context/data-schema.ts (backend schema).
 */

// Mirrors data-schema.ts RiskType exactly. EvidenceType values (missing_hypothesis,
// missing_metric) are NOT risk types — they are signal subtypes inside strategy_unclear.
export type RiskType =
  | "strategy_unclear"
  | "alignment_issue"
  | "execution_issue"
  | "placebo_productivity";

export type ControlLevel = "draft_only" | "require_approval" | "autonomous_low_risk";

export type Severity = "low" | "medium" | "high" | "critical";

// Mirrors data-schema.ts InterventionStatus exactly. "snoozed" is a local
// UI state (stored in localStorage via useInterventionInbox), never persisted
// to the backend. "auto_suppressed" maps to "dismissed" from Governor.
export type InterventionStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "dismissed";

export type ActionType =
  // L1
  | "clarify_bet"
  | "add_hypothesis"
  | "add_metric"
  // L2
  | "rescope"
  | "align_team"
  | "redesign_experiment"
  // L3
  | "pre_mortem_session"
  | "jules_instrument_experiment"
  | "jules_add_guardrails"
  | "jules_refactor_blocker"
  | "jules_scaffold_experiment"
  // L4
  | "kill_bet"
  // Special
  | "boardroom_verdict"
  | "no_intervention";

export type EscalationLevel = 1 | 2 | 3 | 4;

export interface Metric {
  name: string;
  target_value: number | string;
  current_value?: number | string | null;
  unit: string;
}

export interface BetHealthBaseline {
  expected_bet_coverage_pct: number;
  expected_weekly_velocity: number;
  hypothesis_required: boolean;
  metric_linked_required: boolean;
}

export interface DeclarationSource {
  type: "linear_project" | "agent_inferred" | "manual";
  linear_project_id?: string | null;
  raw_artifact_refs?: string[];
}

export type BetStatus = "detecting" | "active" | "paused" | "validated" | "killed" | "archived";

// ─────────────────────────────────────────────
// FEATURE 007: KILL CRITERIA
// ─────────────────────────────────────────────

export type KillCriteriaAction = "pivot" | "kill" | "extend";
export type KillCriteriaStatus = "pending" | "triggered" | "met" | "waived";

export interface KillCriteria {
  condition: string;
  deadline: string;           // ISO 8601 date (YYYY-MM-DD)
  committed_action: KillCriteriaAction;
  status: KillCriteriaStatus;
  triggered_at?: string | null;
  met_at?: string | null;
  waived_at?: string | null;
  waived_reason?: string | null;
}

// ─────────────────────────────────────────────
// FEATURE 008: CONVICTION SCORE
// ─────────────────────────────────────────────

export type ConvictionLevel = "strong" | "developing" | "nascent" | "critical";

export interface ConvictionDimension {
  name: string;
  key: string;
  points_earned: number;
  points_max: number;
  met: boolean;
}

export interface ConvictionScore {
  total: number;
  level: ConvictionLevel;
  dimensions: ConvictionDimension[];
  computed_at: string;
}

// ─────────────────────────────────────────────
// FEATURE 009: WEEKLY FOUNDER BRIEF
// ─────────────────────────────────────────────

export interface BriefBetSummary {
  bet_id: string;
  bet_name: string;
  conviction_delta: number | null;
  conviction_level: ConvictionLevel;
  conviction_total: number;
  kill_criteria_status?: KillCriteriaStatus;
  kill_criteria_condition?: string;
}

export interface FounderBrief {
  workspace_id: string;
  generated_at: string;
  week_label: string;
  bets_improving: BriefBetSummary[];
  bets_at_risk: BriefBetSummary[];
  pending_intervention_count: number;
  most_urgent_intervention?: {
    id: string;
    bet_name: string;
    action_type: ActionType;
    severity: Severity;
    headline: string;
  };
  weekly_question: string;
  total_bets: number;
  avg_conviction: number | null;
  scans_this_week: number;
}

// ─────────────────────────────────────────────
// FEATURE 010: PIVOT DIAGNOSIS
// ─────────────────────────────────────────────

export type PivotRecommendation = "stay_course" | "small_pivot" | "large_pivot" | "kill";
export type PivotP = "problem" | "persona" | "product" | "positioning";

export interface PivotPScore {
  p: PivotP;
  label: string;
  confidence: number | null;  // 1–5; null when skipped
  founder_note: string;
  is_weakest: boolean;
}

export interface PivotDiagnosis {
  id: string;
  intervention_id: string | null;
  bet_id: string;
  conducted_at: string;
  scores: PivotPScore[];
  recommendation: PivotRecommendation;
  recommendation_rationale: string;
  weakest_p: PivotP;
}

export interface Bet {
  id: string;
  workspace_id: string;
  name: string;
  target_segment: string | null;
  problem_statement: string | null;
  status: BetStatus;
  hypothesis: string | null;
  success_metrics: Metric[] | null;
  time_horizon: string | null;
  declaration_source: DeclarationSource;
  declaration_confidence: number;
  health_baseline: BetHealthBaseline;
  acknowledged_risks: AcknowledgedRisk[];
  linear_project_ids: string[];
  linear_issue_ids: string[];
  doc_refs: string[];
  // Feature 007: pre-declared failure condition
  kill_criteria?: KillCriteria | null;
  // Feature 008: conviction score (backend embeds latest snapshot value; falls back to client-derived)
  conviction_score?: ConvictionScore | null;
  created_at: string;
  last_monitored_at: string | null;  // null until first scan — never set on declaration
  last_health_score: number | null;  // null until first scan; populated from BetSnapshot
  completed_at?: string | null;
}

export interface AcknowledgedRisk {
  risk_type: RiskType;
  acknowledged_at: string;
  founder_note?: string;
}

export interface EvidenceIssue {
  id: string;
  title: string;
  status: string;
  url: string;
}

export interface BetSnapshot {
  id: string;
  bet_id: string;
  captured_at: string;
  period_start: string;
  period_end: string;
  health_score: number;
  risk_types_present: RiskType[];
  status: "ok" | "error";
  error_code?: string | null;
  // Feature 008: conviction score
  conviction_score?: ConvictionScore | null;
  hypothesis_staleness_days: number | null;
  hypothesis_experiment_count: number;
  last_experiment_outcome: string | null;
  similar_bet_outcome_pct: number | null;
  outcome_pattern_source_count: number;
}

export interface ProductPrincipleRef {
  id: string;
  name: string;
  source?: string | null;  // e.g. "Shreyas Doshi", "Lenny Rachitsky"
  excerpt?: string | null;
}

export interface RiskSignal {
  risk_type: RiskType;
  severity: Severity;
  confidence: number;
  headline?: string | null;
  explanation?: string | null;
  evidence_summary: string;
  linear_evidence: Record<string, unknown>;
  product_principle_refs?: ProductPrincipleRef[] | null;
}

export interface Intervention {
  id: string;
  bet_id: string;
  bet_name?: string;          // denormalized for inbox grouping display
  workspace_id: string;
  action_type: ActionType;
  escalation_level: EscalationLevel;
  title: string;
  rationale: string;
  confidence: number;
  status: InterventionStatus;
  /** Set by Governor reversibility check — frontend must NOT hardcode this. */
  requires_double_confirm?: boolean;
  risk_signal?: RiskSignal;
  proposed_comment?: string;
  proposed_issue_title?: string;
  proposed_issue_description?: string;
  blast_radius?: BlastRadiusPreview;
  // Feature 010: 4Ps pivot diagnosis
  pivot_diagnosis?: PivotDiagnosis | null;
  created_at: string;
  resolved_at?: string;
  denial_reason?: string;
}

// Mirrors data-schema.ts BlastRadiusPreview and models/schema.py BlastRadiusPreview.
// No "summary" field exists in the backend — removed. Blast radius details
// are surfaced via affected_assignee_ids/project_ids in the approval card.
export interface BlastRadiusPreview {
  affected_issue_count: number;
  affected_assignee_ids: string[];
  affected_project_ids: string[];
  estimated_notification_count: number;
  reversible: boolean;
}

// Mirrors models/responses.py GovernorDecision exactly.
// pipeline_status lives on AegisPipelineState, not inside GovernorDecision.
export interface GovernorDecision {
  approved: boolean;
  denial_reason?: string;        // PolicyDenialReason value when approved=false
  requires_double_confirm: boolean;
  blast_radius_attached: boolean;
}

// ─────────────────────────────────────────────
// PIPELINE STATE (AG-UI real-time emission)
// ─────────────────────────────────────────────

export type PipelineStageStatus = "pending" | "running" | "complete" | "error";

export type PipelineStageName =
  | "signal_engine"
  | "product_brain"
  | "coordinator"
  | "governor"
  | "executor";

export interface PipelineStage {
  name: PipelineStageName;
  status: PipelineStageStatus;
  started_at: string | null;
  completed_at: string | null;
}

export type PipelineStatus =
  | "idle"
  | "scanning"
  | "analyzing"
  | "awaiting_approval"
  | "approved"
  | "executing"
  | "complete"
  | "error";

// ─────────────────────────────────────────────
// SESSION & ARTIFACT (frontend history/artifacts UI)
// ─────────────────────────────────────────────

export interface SessionSummary {
  session_id: string;
  session_title: string | null;
  last_update_time: number;
  created_at: string;
  pipeline_status: PipelineStatus;
  tags: string[];
}

export interface ArtifactEntry {
  filename: string;
  session_id: string | null;
  versions: number[];
  latest_version: number;
  mime_type: string;
}

// ─────────────────────────────────────────────
// AG-UI PIPELINE STATE (synced via CopilotKit)
// ─────────────────────────────────────────────

export interface CynicAssessment {
  risk_type: string;
  severity: string;
  confidence: number;
  evidence_summary: string;
  key_concerns: string;
  perspective: "cynic";
}

export interface OptimistAssessment {
  risk_type: string;
  confidence: number;
  mitigating_factors: string;
  adjusted_severity: string;
  perspective: "optimist";
}

export interface PolicyCheck {
  check_name: string;
  passed: boolean;
  reason?: string | null;
}

/** AG-UI pipeline state synced from backend via CopilotKit */
export interface AegisPipelineState {
  bet?: Bet;
  workspace_id?: string;
  linear_signals?: Record<string, unknown>;
  bet_snapshot?: BetSnapshot;
  risk_signal_draft?: string;
  cynic_assessment?: CynicAssessment;
  optimist_assessment?: OptimistAssessment;
  policy_checks?: PolicyCheck[];
  intervention_proposal?: {
    action_type: ActionType;
    escalation_level: EscalationLevel;
    title: string;
    rationale: string;
    confidence: number;
    proposed_comment?: string;
    proposed_issue_title?: string;
    proposed_issue_description?: string;
  };
  governor_decision?: GovernorDecision;
  awaiting_approval_intervention?: Intervention;
  pipeline_status?: PipelineStatus;
  pipeline_checkpoint?: string;
  executor_result?: Record<string, unknown>;
  // New: pipeline stage tracking for inline progress card
  current_stage?: PipelineStageName;
  stages?: PipelineStage[];
  session_title?: string;
  control_level?: ControlLevel;
}

export interface WorkspaceStats {
  total_accepted: number;
  total_rejected: number;
  acceptance_rate: number;
  most_common_action?: ActionType;
}

export interface DiscoverBetsResponse {
  created: Bet[];
  skipped_duplicates: number;
  write_errors?: number;
}

export interface SuppressionRule {
  id: string;
  workspace_id: string;
  risk_type: RiskType;
  action_type: ActionType;
  rejection_reason: string;
  suppressed_at: string;
  suppressed_until: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────
// FEATURE 011: BOARDROOM
// ─────────────────────────────────────────────

export type BoardroomPhase = "setup" | "intro" | "live" | "deliberating" | "verdict";
export type BoardroomSessionStatus = "active" | "completed";
export type BoardroomSpeaker = "user" | "bear" | "bull" | "sage";
export type BoardroomRecommendation = "proceed" | "pause" | "pivot";

export interface BoardroomAdvisor {
  id: BoardroomSpeaker;
  name: string;
  role: string;
  tag: string;
  initials: string;
  avatarBg: string;
  accent: string;
  activeBg: string;
}

export interface BoardroomSession {
  id: string;
  workspace_id: string;
  bet_id: string | null;
  decision_question: string;
  key_assumption: string;
  status: BoardroomSessionStatus;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

export interface BoardroomTurn {
  id: string;
  session_id: string;
  speaker: BoardroomSpeaker;
  text: string;
  sequence_number: number;
  created_at: string;
}

export interface BoardroomVerdictRisk {
  text: string;
  severity: "low" | "medium" | "high";
}

export interface BoardroomVerdictExperiment {
  text: string;
  timeframe: string;
}

export interface BoardroomVerdict {
  id: string;
  session_id: string;
  bet_id: string | null;
  confidence_score: number;
  recommendation: BoardroomRecommendation;
  summary: string;
  key_risks: BoardroomVerdictRisk[];
  next_experiments: BoardroomVerdictExperiment[];
  bear_assessment: string | null;
  bull_assessment: string | null;
  sage_assessment: string | null;
  sage_voice_summary: string | null;
  intervention_id: string | null;
  created_at: string;
}

export interface BoardroomContext {
  betName: string;
  hypothesis: string;
  targetSegment: string;
  problemStatement: string;
  riskSignals: Array<{ risk_type: string; severity: string; description?: string }>;
  governorFlags: string[];
  decisionQuestion: string;
  keyAssumption: string;
}

export type BoardroomConnStatus = "connecting" | "live" | "reconnecting" | "error" | "idle";
