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
  | "strategy_unclear"      // missing hypothesis, no metric, vague problem
  | "alignment_issue"       // work doesn't map to stated bet, cross-team thrash
  | "execution_issue"       // chronic rollovers, scope creep, blocked count rising
  | "placebo_productivity"  // high ticket velocity but none mapped to active bets (L/N/O signal)

export type Severity = "low" | "medium" | "high" | "critical"

export type BetStatus =
  | "detecting"      // agent has drafted, awaiting founder confirmation
  | "active"         // confirmed, being monitored
  | "paused"         // monitoring paused by founder
  | "validated"      // bet succeeded, hypothesis confirmed
  | "killed"         // bet killed by founder or agent suggestion

export type ScanStatus = "ok" | "error"

export type ScanErrorCode =
  | "rate_limit"        // Linear API rate limit hit
  | "auth_expired"      // Linear auth token expired
  | "api_timeout"       // Linear API timeout
  | "empty_workspace"   // No issues found in bounded window

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
  | "no_intervention"            // governor suppressed or confidence below floor
  | "jules_instrument_experiment"
  | "jules_add_guardrails"
  | "jules_refactor_blocker"
  | "jules_scaffold_experiment"

export type InterventionStatus = "pending" | "accepted" | "rejected" | "dismissed"

export type EscalationLevel = 1 | 2 | 3 | 4
// Level 1: clarify_bet, add_hypothesis, add_metric
// Level 2: rescope, align_team, redesign_experiment
// Level 3: pre_mortem_session, jules_* actions
// Level 4: kill_bet

export type RejectionReasonCategory =
  | "evidence_too_weak"    // signals not convincing enough
  | "already_handled"      // founder already addressed this outside Aegis
  | "not_a_priority"       // real risk, but wrong time
  | "wrong_risk_type"      // misclassified by Product Brain
  | "other"

// Workspace-level autonomy gradient — Governor checks this before every Executor call
// L1: founder earns trust first. L2: default. L3: low-risk auto-actions permitted.
export type ControlLevel = "draft_only" | "require_approval" | "autonomous_low_risk"

export type ExperimentType =
  | "interview" | "ab_test" | "fake_door" | "prototype" | "analytics" | "survey"

export type ExperimentOutcome =
  | "confirmed" | "refuted" | "inconclusive" | "abandoned"

export type EvidenceType =
  | "low_bet_coverage"       // < threshold % of work maps to this bet
  | "chronic_rollover"       // issues rolled over 2+ cycles
  | "missing_hypothesis"     // no hypothesis on any linked issue
  | "missing_metric"         // no success metric referenced
  | "cross_team_thrash"      // blocked_by/blocks relations crossing team boundaries
  | "scope_creep"            // scope_change_count above threshold
  | "bet_fragmentation"      // work spread too thin across unrelated areas
  | "strategy_doc_mismatch"  // Linear work doesn't match strategy doc contents
  | "placebo_productivity"   // high ticket close rate but few/none are bet-mapped

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
  bet_coverage_pct: number             // key metric: are people actually working on this bet?
  rollover_count: number
  chronic_rollover_count: number       // rolled over 2+ cycles
  blocked_count: number
  misc_ticket_pct: number              // tickets with no clear problem/bet link
  hypothesis_present: boolean
  metric_linked: boolean               // true if regex finds numeric target or metric pattern in any issue description
  metric_linked_source?: string        // which issue ID contained the metric pattern (for evidence citation)
  cross_team_thrash_signals: number    // count of blocked_by/blocks relations crossing team boundaries (from Linear relations graph, NOT comments)
  scope_change_count: number
  read_window_days: number             // always 14 for bounded Signal Engine reads
  placebo_productivity_score?: number  // pct of closed issues in window that are NOT bet-mapped (L/N/O signal)
}

export interface Evidence {
  type: EvidenceType
  description: string                 // human-readable, used in agent explanation
  linear_refs: string[]               // specific issue/project IDs cited
  observed_value: number | string
  threshold_value: number | string    // what it should be per BetHealthBaseline
  period_days: number                 // measurement window
}

export interface BlastRadiusPreview {
  affected_issue_count: number
  affected_assignee_ids: string[]
  affected_project_ids: string[]
  estimated_notification_count: number
  reversible: boolean                  // false for kill_bet; shown as extra AlertDialog warning
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
  draft_document?: {
    // Creates a Linear Document (not a direct edit) for founder review
    // Used for high-visibility actions: kill_bet draft, pre-mortem template, redesign_experiment
    title: string
    content: string      // Markdown, pre-filled by agent
    issue_id?: string    // linked issue if applicable
  }
}

// ─────────────────────────────────────────────
// CORE ENTITIES  (map 1:1 to AlloyDB tables)
// ─────────────────────────────────────────────

export interface Workspace {
  id: string
  linear_team_id: string
  strategy_doc_refs: string[]         // Notion/doc URLs for Product Brain agent
  active_bet_ids: string[]
  control_level: ControlLevel         // autonomy setting — Governor enforces this (7th policy check)
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
  health_score: number                // 0–100, derived from signals vs BetHealthBaseline; null on error
  risk_types_present: RiskType[]
  status: ScanStatus                  // "ok" | "error" — always set; UI shows scan freshness
  error_code?: ScanErrorCode          // set if status === "error"

  // Hypothesis lifecycle signals (Phase 2 — requires HypothesisExperiment table)
  hypothesis_staleness_days: number           // days since last experiment on this bet
  hypothesis_experiment_count: number         // total experiments run
  last_experiment_outcome: ExperimentOutcome | null

  // Cross-workspace outcome signals (Phase 3 — requires BetOutcomeRecord corpus)
  similar_bet_outcome_pct: number | null      // % of similar bets that ended validated vs killed
  outcome_pattern_source_count: number        // how many BetOutcomeRecords matched

  // Between-cycle cache control (Phase 2 — Signal Engine skips recompute if valid)
  cache_valid_until?: string                  // ISO 8601; set by Signal Engine after webhook check
}

// Persisted when Governor denies an intervention — audit trail for AutoResearch
export interface PolicyDeniedEvent {
  id: string
  bet_id: string
  intervention_id: string             // the denied Intervention record
  denial_reason:
    | "confidence_below_floor"
    | "duplicate_suppression"
    | "rate_cap"
    | "jules_gate"
    | "reversibility_check"
    | "acknowledged_risk"
    | "override_teach_suppression"    // founder rejected same (risk_type, action_type) twice in auto_suppress_days window
    | "escalation_ladder"             // lighter intervention not yet attempted
  created_at: string
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
  escalation_level: EscalationLevel   // 1–4; enforced by Coordinator escalation ladder
  title: string
  rationale: string                   // grounded in cited product principle
  product_principle_refs: string[]

  proposed_linear_action?: LinearAction
  blast_radius?: BlastRadiusPreview   // set by Governor for Level 3–4 or Jules actions

  confidence: number

  status: InterventionStatus
  decided_at?: string
  founder_note?: string
  rejection_reason?: RejectionReasonCategory  // set on rejection; feeds Governor suppress loop

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

  // Phase 3: chain-of-thought before Pydantic output; enables post-hoc debugging + RejectionReasonCluster NLP
  classification_rationale?: string

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
    low_bet_coverage_threshold: number        // default: 0.5
    chronic_rollover_threshold: number        // default: 2
    misc_ticket_threshold: number             // default: 0.3
    cross_team_thrash_threshold: number       // default: 3 (relation count, not comment count)
    min_confidence_to_surface: number         // default: 0.65 (Governor floor)
    intervention_rate_cap_days: number        // default: 7 (max 1 intervention per bet per N days)
    placebo_productivity_threshold: number    // default: 0.7 (if 70%+ of closed tickets unmapped → flag)
    auto_suppress_days: number                // default: 14 (Override & Teach suppression window)
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

  // Versioned Constitution governance (MAJOR = safety change, MINOR = addition, PATCH = tweak)
  // MAJOR changes (e.g., raising min_confidence_to_surface > 0.8, removing a risk type)
  // require manual review — AutoResearch can NEVER auto-promote a MAJOR version.
  version_type: "MAJOR" | "MINOR" | "PATCH"
  requires_manual_review: boolean
  git_commit_sha?: string                  // link to versioned artifact in git

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
// PHASE 2 ENTITIES
// ─────────────────────────────────────────────

// Tracks whether a bet's hypothesis has been experimentally tested
// Enables Signal Engine to detect hypothesis_staleness_days
export interface HypothesisExperiment {
  id: string
  bet_id: string
  hypothesis_text: string
  experiment_type: ExperimentType
  outcome: ExperimentOutcome
  confidence_before: number           // 0–1
  confidence_after: number            // 0–1
  started_at: string
  completed_at: string | null
  created_by: "founder" | "agent_draft"
}

// Groups rejection patterns for AutoResearch to learn new failure modes
// NLP extraction from Intervention.founder_note → cluster → tune HeuristicVersion
export interface RejectionReasonCluster {
  id: string
  cluster_label: string               // e.g. "already_handled", "wrong_risk_type", "bad_timing"
  intervention_types_affected: ActionType[]
  risk_types_affected: RiskType[]
  frequency: number                   // when >= 5 → candidate for Incident-to-Eval synthesis
  heuristic_change_candidates: string[] // suggested HeuristicVersion.change_summary diffs
}

// Startup failure pattern corpus from IdeaProof DB + internal data (Phase 2 one-time ingest)
export interface StartupFailurePattern {
  id: string
  failure_category: "no_market_need" | "cash" | "team" | "competition" | "timing" | "execution"
  signal_fingerprint: string[]        // matches EvidenceType values
  frequency_pct: number
  avg_time_to_failure_days: number | null
  source: "cb_insights" | "failory" | "ideaproof" | "internal_corpus"
  embedding: number[]                 // vector(768) for pgvector similarity search
}

// ─────────────────────────────────────────────
// PHASE 3 ENTITIES
// ─────────────────────────────────────────────

// Anonymized cross-workspace outcome corpus — opt-in only
// workspace_hash is SHA256(workspace_id), never reversible
export interface BetOutcomeRecord {
  id: string
  workspace_hash: string              // SHA256(workspace_id) — privacy-safe
  bet_archetype: string               // embedding cluster label, not raw bet name
  signal_sequence: Array<{ type: EvidenceType; severity: Severity; week: number }>
  intervention_sequence: Array<{ action_type: ActionType; accepted: boolean }>
  outcome: "validated" | "killed" | "paused_long_term" | "active"
  risk_type_at_kill: RiskType | null
  embedding: number[]                 // vector(768) for pgvector similarity search
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
