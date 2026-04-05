/**
 * Data Schema — Continuous Pre-mortem / Risk Radar
 *
 * SOURCE OF TRUTH for all entities in the system.
 * Backend (Python/ADK): mirror these as Pydantic models in backend/models/schema.py
 * Storage: AlloyDB tables map 1:1 to top-level interfaces.
 * Agent context objects: assembled at runtime from persisted entities, never stored raw.
 *
 * Rules:
 * - Never add a field to implementation before adding it here first.
 * - Never mutate objects — always return new copies.
 * - All IDs are UUIDs (string).
 */

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────

export type RiskType =
  | "strategy_unclear"   // missing hypothesis, no metric, vague problem
  | "alignment_issue"    // work doesn't map to stated bet, cross-team thrash
  | "execution_issue"    // chronic rollovers, scope creep, blocked count rising

export type Severity = "low" | "medium" | "high" | "critical"

export type BetStatus =
  | "detecting"   // agent has drafted, awaiting founder confirmation
  | "active"      // confirmed, being monitored
  | "paused"      // monitoring paused by founder
  | "validated"   // bet succeeded, hypothesis confirmed
  | "killed"      // bet killed by founder or agent suggestion

export type DeclarationSourceType =
  | "linear_project"    // imported from a Linear project
  | "agent_inferred"    // clustered by agent from issues/docs
  | "manual"            // typed by founder directly

export type ActionType =
  | "clarify_bet"
  | "add_hypothesis"
  | "add_metric"
  | "rescope"
  | "kill_bet"
  | "redesign_experiment"
  | "pre_mortem_session"
  | "align_team"

export type InterventionStatus = "pending" | "accepted" | "rejected" | "dismissed"

export type EvidenceType =
  | "low_bet_coverage"       // < threshold % of work maps to this bet
  | "chronic_rollover"       // issues rolled over 2+ cycles
  | "missing_hypothesis"     // no hypothesis on any linked issue
  | "missing_metric"         // no success metric referenced
  | "cross_team_thrash"      // blocked/waiting signals suggesting misalignment
  | "scope_creep"            // scope_change_count above threshold
  | "bet_fragmentation"      // work spread too thin across unrelated areas
  | "strategy_doc_mismatch"  // Linear work doesn't match strategy doc contents

export type TraceType =
  | "bet_clustering"
  | "risk_detection"
  | "risk_classification"
  | "intervention_selection"
  | "linear_write"

export type HeuristicVersionStatus = "candidate" | "active" | "reverted"

// ─────────────────────────────────────────────
// VALUE OBJECTS
// ─────────────────────────────────────────────

export interface Metric {
  name: string
  target_value: number | string
  current_value?: number | string
  unit: string
}

export interface BetHealthBaseline {
  expected_bet_coverage_pct: number   // % of weekly work that should map to this bet
  expected_weekly_velocity: number    // rough expected issue throughput
  hypothesis_required: boolean
  metric_linked_required: boolean
}

export interface DeclarationSource {
  type: DeclarationSourceType
  linear_project_id?: string
  raw_artifact_refs: string[]         // what the agent clustered from
}

export interface AcknowledgedRisk {
  risk_type: RiskType
  acknowledged_at: string             // ISO 8601
  founder_note?: string
}

export interface LinearSignals {
  total_issues_analyzed: number
  bet_mapped_issues: number
  bet_coverage_pct: number            // key metric: are people actually working on this bet?
  rollover_count: number
  chronic_rollover_count: number      // rolled over 2+ cycles
  blocked_count: number
  misc_ticket_pct: number             // tickets with no clear problem/bet link
  hypothesis_present: boolean
  metric_linked: boolean
  cross_team_thrash_signals: number   // "waiting for X" comments, reassignments
  scope_change_count: number
}

export interface Evidence {
  type: EvidenceType
  description: string                 // human-readable, used in agent explanation
  linear_refs: string[]               // specific issue/project IDs cited
  observed_value: number | string
  threshold_value: number | string    // what it should be per BetHealthBaseline
  period_days: number                 // measurement window
}

export interface LinearAction {
  // Bounded write operations — only these are permitted. Nothing else.
  add_label?: string
  add_comment?: string
  create_issue?: {
    title: string
    description: string
    project_id?: string
    label?: string
  }
  update_status?: string
  update_assignee?: string
}

// ─────────────────────────────────────────────
// CORE ENTITIES  (map 1:1 to AlloyDB tables)
// ─────────────────────────────────────────────

export interface Workspace {
  id: string
  linear_team_id: string
  strategy_doc_refs: string[]         // Notion/doc URLs for Product Brain agent
  active_bet_ids: string[]
  created_at: string
}

export interface Bet {
  id: string
  workspace_id: string

  // Drafted by Product Brain agent, confirmed by founder
  name: string
  target_segment: string
  problem_statement: string
  hypothesis: string                  // "We believe [action] will result in [outcome] for [segment]"
  success_metrics: Metric[]
  time_horizon: string                // ISO 8601 date

  declaration_source: DeclarationSource
  declaration_confidence: number      // 0–1, shown visibly in Confirm UI step

  status: BetStatus
  health_baseline: BetHealthBaseline

  acknowledged_risks: AcknowledgedRisk[]  // prevents re-surfacing accepted noise

  // Linked artifacts
  linear_project_ids: string[]
  linear_issue_ids: string[]
  doc_refs: string[]

  created_at: string
  last_monitored_at: string
  completed_at?: string
}

export interface BetSnapshot {
  id: string
  bet_id: string
  captured_at: string
  period_start: string
  period_end: string
  linear_signals: LinearSignals
  health_score: number                // 0–100, derived from signals vs BetHealthBaseline
  risk_types_present: RiskType[]
}

export interface RiskSignal {
  id: string
  bet_id: string
  snapshot_id: string

  risk_type: RiskType
  severity: Severity
  confidence: number                  // 0–1, shown in UI

  evidence: Evidence[]

  // Founder-facing copy — written by Product Brain agent
  // Reframed as lost upside, never as threat (see product-principles.md)
  headline: string
  explanation: string
  product_principle_refs: string[]    // Lenny/Tigers-Elephants heuristic IDs cited

  status: "open" | "actioned" | "resolved" | "dismissed"
  detected_by: string                 // agent name
  detected_at: string
  resolved_at?: string
}

export interface Intervention {
  id: string
  risk_signal_id: string
  bet_id: string

  action_type: ActionType
  title: string
  rationale: string                   // grounded in cited product principle
  product_principle_refs: string[]

  proposed_linear_action?: LinearAction

  confidence: number

  status: InterventionStatus
  decided_at?: string
  founder_note?: string

  created_at: string
}

export interface Outcome {
  id: string
  intervention_id: string
  bet_id: string

  snapshot_before_id: string
  snapshot_after_id: string           // taken ~2 weeks after intervention
  health_score_delta: number          // positive = improved
  risk_resolved: boolean
  founder_rating?: 1 | 2 | 3 | 4 | 5

  measured_at: string
}

// ─────────────────────────────────────────────
// AUTORESEARCH + EVAL LAYER
// ─────────────────────────────────────────────

export interface AgentTrace {
  id: string
  workspace_id: string
  trace_type: TraceType
  agent_name: string

  input_context_hash: string          // hash of context object (full stored separately)
  output_summary: string
  output_ids: string[]                // IDs of created entities

  heuristic_version_id: string
  eval_score?: number                 // LLM-as-judge score 0–1
  eval_rubric?: string
  human_accepted?: boolean
  latency_ms: number

  created_at: string
}

export interface HeuristicVersion {
  id: string
  version: string                     // semver e.g. "1.3.0"
  status: HeuristicVersionStatus

  risk_thresholds: {
    low_bet_coverage_threshold: number      // default: 0.5
    chronic_rollover_threshold: number      // default: 2
    misc_ticket_threshold: number           // default: 0.3
    cross_team_thrash_threshold: number     // default: 3
  }
  classification_prompt_fragment: string
  intervention_ranking_weights: Array<{
    action_type: ActionType
    weight: number
  }>

  eval_score: number
  acceptance_rate: number
  resolution_rate: number
  false_positive_rate: number

  parent_version_id?: string
  change_summary: string
  created_at: string
  activated_at?: string
  reverted_at?: string
}

export interface BetRejection {
  id: string
  workspace_id: string
  raw_artifact_refs: string[]         // what the agent clustered
  proposed_name: string
  rejection_reason?: string
  rejected_at: string
  // Fed directly into HeuristicVersion training data for Detect stage tuning
}

export interface ProductHeuristic {
  id: string
  source: "lenny" | "shreyas" | "tigers_elephants" | "pmf_patterns" | "custom"
  risk_types: RiskType[]
  principle: string
  example_pattern: string
  suggested_action: ActionType
  confidence_weight: number           // tuned by AutoResearch per workspace
}

// ─────────────────────────────────────────────
// AGENT CONTEXT OBJECTS  (assembled at runtime, never persisted as-is)
// ─────────────────────────────────────────────

export interface ExecutionAgentContext {
  bet: Pick<Bet,
    | "id" | "name" | "hypothesis" | "success_metrics"
    | "time_horizon" | "health_baseline"
    | "linear_project_ids" | "linear_issue_ids"
  >
  recent_snapshots: BetSnapshot[]     // last 4 weeks for trend detection
  acknowledged_risks: AcknowledgedRisk[]
  monitoring_period_days: number      // default: 14
}

export interface ProductBrainAgentContext {
  bet: Pick<Bet,
    | "id" | "name" | "target_segment" | "problem_statement"
    | "hypothesis" | "success_metrics" | "time_horizon"
  >
  detected_signals: LinearSignals
  risk_type_hypothesis: RiskType      // Execution Agent's preliminary classification
  relevant_heuristics: ProductHeuristic[]
  strategy_doc_excerpts: string[]     // relevant excerpts from workspace strategy docs
}

export interface CoordinatorAgentContext {
  bet: Bet
  risk_signal: RiskSignal
  prior_interventions: Array<{
    intervention: Intervention
    outcome?: Outcome
  }>
  workspace_context: {
    other_active_bets: Pick<Bet, "id" | "name" | "status">[]
    recent_accepted_interventions: number
    recent_rejected_interventions: number
  }
  active_heuristic_version: string
}
