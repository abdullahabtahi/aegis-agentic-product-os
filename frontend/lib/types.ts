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

export type BetStatus = "detecting" | "active" | "paused" | "validated" | "killed";

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
  created_at: string;
  last_monitored_at: string | null;
  completed_at?: string | null;
}

export interface AcknowledgedRisk {
  risk_type: RiskType;
  acknowledged_at: string;
  note?: string;
}

export interface EvidenceIssue {
  id: string;
  title: string;
  status: string;
  url: string;
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
  blast_radius?: BlastRadius;
  created_at: string;
  resolved_at?: string;
  denial_reason?: string;
}

// Mirrors data-schema.ts BlastRadiusPreview and models/schema.py BlastRadiusPreview.
// No "summary" field exists in the backend — removed. Blast radius details
// are surfaced via affected_assignee_ids/project_ids in the approval card.
export interface BlastRadius {
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

/** AG-UI pipeline state synced from backend via CopilotKit */
export interface AegisPipelineState {
  bet?: Bet;
  workspace_id?: string;
  linear_signals?: Record<string, unknown>;
  bet_snapshot?: Record<string, unknown>;
  risk_signal_draft?: string;
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
