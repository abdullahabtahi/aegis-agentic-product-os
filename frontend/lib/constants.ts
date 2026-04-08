import type { ActionType, BetStatus, EscalationLevel, RiskType, Severity } from "./types";

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

// Mirrors data-schema.ts RiskType. Evidence subtypes (missing_hypothesis,
// missing_metric) are surfaced inside strategy_unclear evidence, not as
// separate risk type labels.
export const RISK_LABELS: Record<RiskType, string> = {
  strategy_unclear: "Strategy Unclear",
  alignment_issue: "Alignment Issue",
  execution_issue: "Execution Issue",
  placebo_productivity: "Placebo Productivity",
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

export const BET_STATUS_LABELS: Record<BetStatus, string> = {
  detecting: "Detecting",
  active: "Active",
  paused: "Paused",
  validated: "Validated",
  killed: "Killed",
};

export const BET_STATUS_STYLES: Record<BetStatus, string> = {
  detecting: "bg-indigo-400/10 text-indigo-400 border-indigo-400/20",
  active: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  paused: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  validated: "bg-sky-400/10 text-sky-400 border-sky-400/20",
  killed: "bg-slate-400/10 text-slate-400 border-slate-400/20",
};

/** Health score → colour class (for progress bars and indicators) */
export function healthColor(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-red-500";
}

/** Rate cap window — matches backend Governor */
export const RATE_CAP_DAYS = 7;

/** Auto-suppression: if same pattern rejected 2x in 30 days */
export const AUTO_SUPPRESS_THRESHOLD = 2;
export const AUTO_SUPPRESS_WINDOW_DAYS = 30;
