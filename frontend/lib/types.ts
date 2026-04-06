/**
 * Aegis frontend types — mirrors context/data-schema.ts for UI use.
 * Source of truth: context/data-schema.ts (backend schema).
 */

export type RiskType =
  | "strategy_unclear"
  | "missing_hypothesis"
  | "missing_metric"
  | "execution_issue"
  | "alignment_issue"
  | "low_confidence";

export type Severity = "low" | "medium" | "high" | "critical";

export type InterventionStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "auto_suppressed"
  | "snoozed";

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

export interface Bet {
  id: string;
  workspace_id: string;
  name: string;
  status: "active" | "paused" | "killed" | "completed";
  hypothesis: string;
  success_metrics: string[];
  time_horizon: string;
  acknowledged_risks: AcknowledgedRisk[];
  linear_project_ids: string[];
  created_at: string;
  last_monitored_at?: string;
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

export interface RiskSignal {
  risk_type: RiskType;
  severity: Severity;
  confidence: number;
  evidence_summary: string;
  linear_evidence: Record<string, unknown>;
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

export interface BlastRadius {
  affected_issue_count: number;
  reversible: boolean;
  summary: string;
}

export interface GovernorDecision {
  approved: boolean;
  denial_reason?: string;
  pipeline_status: string;
  double_confirm_required?: boolean;
  blast_radius?: BlastRadius;
}

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
  pipeline_status?: string;
  pipeline_checkpoint?: string;
  executor_result?: Record<string, unknown>;
}

export interface WorkspaceStats {
  total_accepted: number;
  total_rejected: number;
  acceptance_rate: number;
  most_common_action?: ActionType;
}
