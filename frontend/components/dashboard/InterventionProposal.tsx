"use client";

/**
 * InterventionProposal — Right panel of the Agentic Command Center.
 *
 * The Human-in-the-Loop decision surface. Renders when the ADK Governor
 * approves an intervention and sets pipeline_status = "awaiting_founder_approval".
 *
 * Data flow: AegisPipelineState.awaiting_approval_intervention → this component.
 * Decisions flow back via: onApprove() / onReject() callbacks.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import type { AegisPipelineState, ActionType } from "@/lib/types";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Crosshair,
  Layers,
  Swords,
  Compass,
  Zap,
  ShieldAlert,
  TrendingUp,
  Clock,
} from "lucide-react";

// ─────────────────────────────────────────────
// ACTION TYPE METADATA
// ─────────────────────────────────────────────

const ACTION_META: Record<
  ActionType,
  { label: string; icon: React.ElementType; color: string; level: string }
> = {
  clarify_bet: {
    label: "Clarify Bet",
    icon: Compass,
    color: "text-blue-400",
    level: "L1 — Low Impact",
  },
  add_hypothesis: {
    label: "Add Hypothesis",
    icon: Crosshair,
    color: "text-cyan-400",
    level: "L1 — Low Impact",
  },
  add_metric: {
    label: "Add Metric",
    icon: TrendingUp,
    color: "text-cyan-400",
    level: "L1 — Low Impact",
  },
  rescope: {
    label: "Rescope Bet",
    icon: Layers,
    color: "text-amber-400",
    level: "L2 — Moderate Impact",
  },
  align_team: {
    label: "Align Team",
    icon: Swords,
    color: "text-amber-400",
    level: "L2 — Moderate Impact",
  },
  redesign_experiment: {
    label: "Redesign Experiment",
    icon: Zap,
    color: "text-violet-400",
    level: "L2 — Moderate Impact",
  },
  pre_mortem_session: {
    label: "Pre-Mortem Session",
    icon: ShieldAlert,
    color: "text-orange-400",
    level: "L3 — High Impact",
  },
  jules_instrument_experiment: {
    label: "Jules: Instrument Experiment",
    icon: Zap,
    color: "text-violet-400",
    level: "L3 — High Impact",
  },
  jules_add_guardrails: {
    label: "Jules: Add Guardrails",
    icon: ShieldAlert,
    color: "text-violet-400",
    level: "L3 — High Impact",
  },
  jules_refactor_blocker: {
    label: "Jules: Refactor Blocker",
    icon: Layers,
    color: "text-violet-400",
    level: "L3 — High Impact",
  },
  jules_scaffold_experiment: {
    label: "Jules: Scaffold Experiment",
    icon: Zap,
    color: "text-violet-400",
    level: "L3 — High Impact",
  },
  kill_bet: {
    label: "Kill Bet",
    icon: XCircle,
    color: "text-red-400",
    level: "L4 — Critical",
  },
  no_intervention: {
    label: "No Action",
    icon: CheckCircle2,
    color: "text-white/40",
    level: "—",
  },
};

// ─────────────────────────────────────────────
// RISK TYPE DISPLAY
// ─────────────────────────────────────────────

const RISK_COLORS: Record<string, string> = {
  strategy_unclear: "bg-blue-500/10 text-blue-300 border-blue-500/20",
  alignment_issue: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  execution_issue: "bg-orange-500/10 text-orange-300 border-orange-500/20",
  placebo_productivity: "bg-violet-500/10 text-violet-300 border-violet-500/20",
};

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
};

// ─────────────────────────────────────────────
// CONFIDENCE BAR
// ─────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 80
      ? "bg-emerald-500"
      : pct >= 65
        ? "bg-cyan-500"
        : "bg-amber-500";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-white/8 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] font-mono text-white/50">{pct}%</span>
    </div>
  );
}

// ─────────────────────────────────────────────
// EMPTY STATE
// ─────────────────────────────────────────────

function NoProposal({ pipelineStatus }: { pipelineStatus?: string }) {
  const isRunning =
    pipelineStatus && pipelineStatus !== "awaiting_founder_approval";

  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 select-none">
      <div className="relative">
        <div className="size-16 rounded-2xl bg-white/4 ring-1 ring-white/8 flex items-center justify-center">
          <ShieldAlert className="size-7 text-white/20" />
        </div>
        {isRunning && (
          <div className="absolute -top-1 -right-1 size-3 rounded-full bg-cyan-500 animate-pulse" />
        )}
      </div>
      <div className="text-center space-y-1">
        <p className="text-[12px] font-medium text-white/40">
          {isRunning ? "Agent is reasoning…" : "No intervention pending"}
        </p>
        <p className="text-[10px] text-white/20 max-w-[160px] leading-relaxed">
          {isRunning
            ? "Governor will surface a proposal if confidence ≥ 65%"
            : "Trigger a scan to begin the Detect → Draft → Confirm loop"}
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// DOUBLE CONFIRM DIALOG
// ─────────────────────────────────────────────

function DoubleConfirmBanner({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-4 z-10 p-6">
      <AlertTriangle className="size-10 text-orange-400" />
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-white">Confirm destructive action</p>
        <p className="text-[11px] text-white/50 max-w-[200px] leading-relaxed">
          This action is high-visibility and may affect your entire team. Are you sure?
        </p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onCancel} className="border-white/10">
          Cancel
        </Button>
        <Button size="sm" onClick={onConfirm} className="bg-red-500/80 hover:bg-red-500 text-white border-0">
          Yes, proceed
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────

interface InterventionProposalProps {
  agentState: AegisPipelineState;
  onApprove: (interventionId: string) => void;
  onReject: (interventionId: string) => void;
  className?: string;
}

export function InterventionProposal({
  agentState,
  onApprove,
  onReject,
  className,
}: InterventionProposalProps) {
  const [showDoubleConfirm, setShowDoubleConfirm] = useState(false);
  const [deciding, setDeciding] = useState<"approve" | "reject" | null>(null);

  const intervention = agentState.awaiting_approval_intervention;
  const riskDraftRaw =
    typeof agentState.risk_signal_draft === "object" &&
    agentState.risk_signal_draft !== null
      ? (agentState.risk_signal_draft as Record<string, unknown>)
      : null;

  // Typed derivations — string casts happen once here, not in JSX
  const riskDraft = riskDraftRaw
    ? {
        headline: riskDraftRaw.headline != null ? String(riskDraftRaw.headline) : undefined,
        explanation: riskDraftRaw.explanation != null ? String(riskDraftRaw.explanation) : undefined,
        risk_type: riskDraftRaw.risk_type != null ? String(riskDraftRaw.risk_type) : undefined,
        severity: riskDraftRaw.severity != null ? String(riskDraftRaw.severity) : undefined,
        confidence: typeof riskDraftRaw.confidence === "number" ? riskDraftRaw.confidence : undefined,
      }
    : null;

  const isAwaiting =
    agentState.pipeline_status === "awaiting_founder_approval";
  const isDecided =
    agentState.pipeline_checkpoint === "founder_approved" ||
    agentState.pipeline_checkpoint === "founder_rejected";

  const hasProposal = isAwaiting && intervention;

  const meta = intervention
    ? ACTION_META[intervention.action_type] ?? ACTION_META.no_intervention
    : null;

  const handleApprove = () => {
    if (!intervention) return;
    if (intervention.requires_double_confirm || intervention.action_type === "kill_bet") {
      setShowDoubleConfirm(true);
      return;
    }
    setDeciding("approve");
    onApprove(intervention.id ?? "");
  };

  const handleReject = () => {
    if (!intervention) return;
    setDeciding("reject");
    onReject(intervention.id ?? "");
  };

  const handleConfirmDestructive = () => {
    if (!intervention) return;
    setShowDoubleConfirm(false);
    setDeciding("approve");
    onApprove(intervention.id ?? "");
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "size-1.5 rounded-full",
              isAwaiting
                ? "bg-orange-400 animate-pulse"
                : "bg-white/20"
            )}
          />
          <span className="text-[11px] font-semibold tracking-widest uppercase text-white/50">
            Intervention Proposal
          </span>
        </div>
        {isAwaiting && (
          <Badge className="text-[9px] py-0 px-1.5 bg-orange-500/10 text-orange-400 border-orange-500/20 animate-pulse">
            ACTION REQUIRED
          </Badge>
        )}
        {isDecided && (
          <Badge
            className={cn(
              "text-[9px] py-0 px-1.5",
              agentState.pipeline_checkpoint === "founder_approved"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-red-500/10 text-red-400 border-red-500/20"
            )}
          >
            {agentState.pipeline_checkpoint === "founder_approved"
              ? "APPROVED"
              : "REJECTED"}
          </Badge>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 pt-4">
        {!hasProposal ? (
          <NoProposal pipelineStatus={agentState.pipeline_status} />
        ) : (
          <div className="space-y-3 relative">
            {/* Double confirm overlay */}
            {showDoubleConfirm && (
              <DoubleConfirmBanner
                onConfirm={handleConfirmDestructive}
                onCancel={() => setShowDoubleConfirm(false)}
              />
            )}

            {/* Risk signal headline - "Lost Upside" framing */}
            {riskDraft?.headline && (
              <div className="rounded-xl bg-white/3 ring-1 ring-white/8 p-4">
                <p className="text-[10px] font-semibold tracking-widest uppercase text-white/30 mb-1">
                  Signal Detected
                </p>
                <p className="text-[13px] font-semibold text-white leading-snug">
                  {riskDraft.headline}
                </p>
                {riskDraft.explanation && (
                  <p className="text-[11px] text-white/50 mt-2 leading-relaxed">
                    {riskDraft.explanation}
                  </p>
                )}
              </div>
            )}

            {/* Risk type + severity badges */}
            <div className="flex flex-wrap gap-1.5">
              {riskDraft?.risk_type && (
                <Badge
                  className={cn(
                    "text-[9px] px-2 py-0.5 rounded-full border",
                    RISK_COLORS[riskDraft.risk_type] ??
                      "bg-white/10 text-white/40 border-white/10"
                  )}
                >
                  {riskDraft.risk_type.replace(/_/g, " ")}
                </Badge>
              )}
              {riskDraft?.severity && (
                <Badge
                  className={cn(
                    "text-[9px] px-2 py-0.5 rounded-full border",
                    SEVERITY_COLORS[riskDraft.severity] ??
                      "bg-white/10 text-white/40 border-white/10"
                  )}
                >
                  {riskDraft.severity} severity
                </Badge>
              )}
              {intervention.escalation_level && (
                <Badge className="text-[9px] px-2 py-0.5 rounded-full border bg-white/5 text-white/30 border-white/10">
                  L{intervention.escalation_level}
                </Badge>
              )}
            </div>

            {/* Intervention card */}
            <Card className="bg-white/4 ring-1 ring-white/10 rounded-xl">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  {meta && (
                    <div className="size-7 rounded-lg bg-white/5 flex items-center justify-center">
                      <meta.icon className={cn("size-3.5", meta.color)} />
                    </div>
                  )}
                  <div>
                    <CardTitle className="text-[12px] text-white">
                      {intervention.title}
                    </CardTitle>
                    <CardDescription className="text-[10px] mt-0">
                      {meta?.level}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-[11px] text-white/50 leading-relaxed">
                  {intervention.rationale}
                </p>

                {/* Confidence */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-semibold uppercase tracking-widest text-white/30">
                      Agent confidence
                    </span>
                  </div>
                  <ConfidenceBar value={intervention.confidence} />
                </div>

                {/* Blast radius */}
                {intervention.blast_radius && (
                  <div className="rounded-lg bg-orange-500/5 ring-1 ring-orange-500/15 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <AlertTriangle className="size-3 text-orange-400" />
                      <span className="text-[9px] font-semibold uppercase tracking-widest text-orange-400/70">
                        Blast Radius
                      </span>
                    </div>
                    <p className="text-[10px] text-white/40">
                      {intervention.blast_radius.affected_issue_count} issues affected ·{" "}
                      {intervention.blast_radius.reversible ? "Reversible" : "Irreversible"}
                    </p>
                  </div>
                )}

                {/* Proposed linear action */}
                {(intervention.proposed_issue_title || intervention.proposed_comment) && (
                  <div className="rounded-lg bg-white/3 ring-1 ring-white/8 p-3 space-y-1">
                    <span className="text-[9px] font-semibold uppercase tracking-widest text-white/30">
                      Proposed Linear Action
                    </span>
                    {intervention.proposed_issue_title && (
                      <p className="text-[11px] text-white/60 font-medium">
                        {intervention.proposed_issue_title}
                      </p>
                    )}
                    {intervention.proposed_comment && (
                      <p className="text-[10px] text-white/40 leading-relaxed">
                        {intervention.proposed_comment}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Timestamp */}
            <div className="flex items-center gap-1.5 px-1">
              <Clock className="size-3 text-white/20" />
              <span className="text-[9px] text-white/20 font-mono">
                Proposed at {new Date(intervention.created_at).toLocaleTimeString()}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {hasProposal && !isDecided && (
        <div className="px-4 py-3 border-t border-white/8 shrink-0 space-y-2">
          <Button
            className="w-full bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/20 transition-all"
            variant="ghost"
            disabled={deciding !== null}
            onClick={handleApprove}
          >
            {deciding === "approve" ? (
              <span className="flex items-center gap-2">
                <span className="size-3 rounded-full border-2 border-emerald-400/40 border-t-emerald-400 animate-spin" />
                Approving…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5" />
                Approve
              </span>
            )}
          </Button>
          <Button
            className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/15 transition-all"
            variant="ghost"
            disabled={deciding !== null}
            onClick={handleReject}
          >
            {deciding === "reject" ? (
              <span className="flex items-center gap-2">
                <span className="size-3 rounded-full border-2 border-red-400/40 border-t-red-400 animate-spin" />
                Rejecting…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <XCircle className="size-3.5" />
                Reject
              </span>
            )}
          </Button>
          <p className="text-[9px] text-center text-white/20">
            Human-in-the-loop validation · Governor check passed
          </p>
        </div>
      )}
    </div>
  );
}
