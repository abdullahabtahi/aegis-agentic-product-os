import type { ActionType, BetStatus, EscalationLevel, PipelineStageName, RiskType, Severity } from "./types";
import {
  Network, Brain, GitBranch, Gavel, Terminal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8080";

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
  boardroom_verdict: "Boardroom Verdict",
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
  low: "text-emerald-700",
  medium: "text-amber-700",
  high: "text-orange-700",
  critical: "text-red-600",
};

export const SEVERITY_BG: Record<Severity, string> = {
  low: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  high: "bg-orange-50 text-orange-700 border-orange-200",
  critical: "bg-red-50 text-red-600 border-red-200",
};

export const BET_STATUS_LABELS: Record<BetStatus, string> = {
  detecting: "Detecting",
  active: "Active",
  paused: "Paused",
  validated: "Validated",
  killed: "Killed",
  archived: "Archived",
};

export const BET_STATUS_STYLES: Record<BetStatus, string> = {
  detecting: "bg-indigo-50 text-indigo-700 border-indigo-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  paused: "bg-amber-50 text-amber-700 border-amber-200",
  validated: "bg-sky-50 text-sky-700 border-sky-200",
  killed: "bg-slate-100 text-slate-600 border-slate-200",
  archived: "rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide border-slate-300 text-slate-400 bg-slate-50",
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

// ─────────────────────────────────────────────
// PIPELINE STAGE CONFIG (shared across pages)
// ─────────────────────────────────────────────

export interface PipelineStageConfig {
  num: string;
  key: PipelineStageName;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const PIPELINE_STAGES: PipelineStageConfig[] = [
  { num: "1", key: "signal_engine",  label: "Signal Engine",  icon: Network,   description: "Reads 14-day Linear window, computes 9 risk signals" },
  { num: "2", key: "product_brain",  label: "Product Brain",  icon: Brain,     description: "Cynic ↔ Optimist debate → Synthesis classification" },
  { num: "3", key: "coordinator",    label: "Coordinator",    icon: GitBranch, description: "Picks escalation level & action type for the risk" },
  { num: "4", key: "governor",       label: "Governor",       icon: Gavel,     description: "8 deterministic policy checks — no LLM, hard rules" },
  { num: "5", key: "executor",       label: "Executor",       icon: Terminal,  description: "Posts Linear comment, creates issue, or awaits approval" },
];

export const PIPELINE_STATUS_CONFIG = {
  running:  { label: "RUNNING",  cls: "text-indigo-600 bg-indigo-600/10",   dot: "bg-indigo-500 animate-pulse" },
  complete: { label: "COMPLETE", cls: "text-emerald-600 bg-emerald-500/10", dot: "bg-emerald-500" },
  error:    { label: "ERROR",    cls: "text-red-600 bg-red-500/10",         dot: "bg-red-500" },
  pending:  { label: "IDLE",     cls: "text-slate-500 bg-slate-200/50",     dot: "bg-slate-300" },
} as const;

