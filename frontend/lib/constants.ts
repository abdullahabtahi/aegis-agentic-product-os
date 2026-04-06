import type { ActionType, EscalationLevel, RiskType, Severity } from "./types";

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export const ESCALATION_LABELS: Record<EscalationLevel, string> = {
  1: "L1 · Clarify",
  2: "L2 · Adjust",
  3: "L3 · Escalate",
  4: "L4 · Terminal",
};

export const ACTION_LABELS: Record<ActionType, string> = {
  clarify_bet: "Clarify Bet",
  add_hypothesis: "Add Hypothesis",
  add_metric: "Add Metric",
  rescope: "Rescope",
  align_team: "Align Team",
  redesign_experiment: "Redesign Experiment",
  pre_mortem_session: "Pre-Mortem Session",
  jules_instrument_experiment: "Jules: Instrument Experiment",
  jules_add_guardrails: "Jules: Add Guardrails",
  jules_refactor_blocker: "Jules: Refactor Blocker",
  jules_scaffold_experiment: "Jules: Scaffold Experiment",
  kill_bet: "Kill Bet",
  no_intervention: "No Intervention",
};

export const RISK_LABELS: Record<RiskType, string> = {
  strategy_unclear: "Strategy Unclear",
  missing_hypothesis: "Missing Hypothesis",
  missing_metric: "Missing Metric",
  execution_issue: "Execution Issue",
  alignment_issue: "Alignment Issue",
  low_confidence: "Low Confidence",
};

export const SEVERITY_COLORS: Record<Severity, string> = {
  low: "text-emerald-400",
  medium: "text-amber-400",
  high: "text-orange-400",
  critical: "text-red-400",
};

export const SEVERITY_BG: Record<Severity, string> = {
  low: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  medium: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  high: "bg-orange-400/10 text-orange-400 border-orange-400/20",
  critical: "bg-red-400/10 text-red-400 border-red-400/20",
};

/** Rate cap window — matches backend Governor */
export const RATE_CAP_DAYS = 7;

/** Auto-suppression: if same pattern rejected 2x in 30 days */
export const AUTO_SUPPRESS_THRESHOLD = 2;
export const AUTO_SUPPRESS_WINDOW_DAYS = 30;
