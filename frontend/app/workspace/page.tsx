"use client";

/**
 * /workspace — Agentic Command Center.
 *
 * Pivoted from the React Flow MissionControl canvas to a premium split-screen
 * Agentic UI using the A2UI / AG-UI / CopilotKit pattern.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  Header: Bet info · Status · Scan Trigger                │
 *   ├────────────────────────┬─────────────────────────────────┤
 *   │                        │                                 │
 *   │  Agent Workflow Feed   │  Intervention Proposal          │
 *   │  (live ADK trace)      │  (HITL approve/reject)          │
 *   │                        │                                 │
 *   ├────────────────────────┴─────────────────────────────────┤
 *   │  [bottom-right] Telemetry Minimap (collapsible)          │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Data Contract:
 *   All state originates from AegisPipelineState via useAgentStateSync().
 *   Approve/Reject wires to: useInterventionApproval() (REST).
 *   Jules HITL wires to: useJulesPlanApproval() (CopilotKit respond()).
 */

import { useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AgentWorkflowFeed } from "@/components/dashboard/AgentWorkflowFeed";
import { InterventionProposal } from "@/components/dashboard/InterventionProposal";
import { TelemetryMinimap } from "@/components/dashboard/TelemetryMinimap";
import { ScanTrigger } from "@/components/dashboard/ScanTrigger";
import { useAgentStateSync } from "@/hooks/useAgentStateSync";
import { useInterventionInbox } from "@/hooks/useInterventionInbox";
import { useInterventionApproval } from "@/hooks/useInterventionApproval";
import { useJulesPlanApproval } from "@/hooks/useJulesPlanApproval";
import { useWorkspaceState } from "@/hooks/useWorkspaceState";
import { ApprovalCard } from "@/components/interventions/ApprovalCard";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Intervention } from "@/lib/types";

// ─────────────────────────────────────────────
// STATUS BADGE
// ─────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  awaiting_founder_approval:
    "bg-orange-500/10 text-orange-400 border-orange-500/20 animate-pulse",
  founder_approved:
    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  founder_rejected:
    "bg-red-500/10 text-red-400 border-red-500/20",
  executor_complete:
    "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
};

function PipelineStatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  const style =
    STATUS_STYLES[status] ?? "bg-white/5 text-white/30 border-white/10";
  return (
    <Badge className={cn("text-[9px] py-0 px-1.5 rounded border font-mono", style)}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

// ─────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────

export default function WorkspacePage() {
  const { workspaceId, activeBet } = useWorkspaceState();
  const { state: agentState } = useAgentStateSync();
  const { pending, invalidateOnComplete } = useInterventionInbox(workspaceId);
  const { approve, reject } = useInterventionApproval(workspaceId);
  const { pendingPlan, confirmApproval } = useJulesPlanApproval();

  // Invalidate intervention list when pipeline emits awaiting_founder_approval
  useEffect(() => {
    if (agentState.pipeline_status === "awaiting_founder_approval") {
      invalidateOnComplete();
    }
  }, [agentState.pipeline_status, invalidateOnComplete]);

  // Approve handler — prefers AG-UI state path when awaiting_approval_intervention is present
  const handleApprove = useCallback(
    (id: string) => {
      if (agentState.awaiting_approval_intervention) {
        // Wired via AG-UI state — server-side Governor already approved
        approve.mutate(agentState.awaiting_approval_intervention.id ?? id);
      } else {
        approve.mutate(id);
      }
    },
    [agentState.awaiting_approval_intervention, approve]
  );

  // Reject handler
  const handleReject = useCallback(
    (id: string) => {
      if (agentState.awaiting_approval_intervention) {
        reject.mutate({ id: agentState.awaiting_approval_intervention.id ?? id });
      } else {
        reject.mutate({ id });
      }
    },
    [agentState.awaiting_approval_intervention, reject]
  );

  return (
    <AppShell pendingCount={pending.length}>
      <div className="h-full flex flex-col overflow-hidden">
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/8 shrink-0">
          <div className="flex items-center gap-3">
            {/* Pulse indicator */}
            <div
              className={cn(
                "size-2 rounded-full transition-colors",
                agentState.pipeline_status === "awaiting_founder_approval"
                  ? "bg-orange-400 animate-pulse"
                  : agentState.pipeline_checkpoint
                    ? "bg-cyan-400 animate-pulse"
                    : "bg-white/15"
              )}
            />
            <span className="text-[11px] font-semibold tracking-widest uppercase text-white/60">
              Agent Command Center
            </span>
            <PipelineStatusBadge status={agentState.pipeline_status} />
          </div>

          <div className="flex items-center gap-3">
            {agentState.bet && (
              <span className="text-[11px] text-white/35 max-w-[220px] truncate">
                {agentState.bet.name}
              </span>
            )}
            <ScanTrigger
              bet={activeBet ?? agentState.bet}
              workspaceId={workspaceId}
            />
          </div>
        </div>

        {/* ── Main split-screen ───────────────────────────────────── */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Left: Agent Workflow Feed */}
          <div className="w-[45%] border-r border-white/8 overflow-hidden">
            <AgentWorkflowFeed agentState={agentState} className="h-full" />
          </div>

          {/* Right: Intervention Proposal */}
          <div className="flex-1 overflow-hidden">
            <InterventionProposal
              agentState={agentState}
              onApprove={handleApprove}
              onReject={handleReject}
              className="h-full"
            />
          </div>

          {/* Bottom-right: Telemetry Minimap */}
          <div className="absolute bottom-4 right-4 w-[280px] z-10">
            <TelemetryMinimap agentState={agentState} />
          </div>
        </div>

        {/* ── Jules HITL overlay (CopilotKit respond() path) ─────── */}
        {pendingPlan && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-30 p-6">
            <div className="w-full max-w-md">
              <ApprovalCard
                intervention={
                  {
                    id: "jules-plan",
                    action_type: pendingPlan.action_type,
                    escalation_level: 3,
                    title: pendingPlan.title,
                    rationale: pendingPlan.rationale,
                    status: "pending",
                    bet_id: "",
                    workspace_id: workspaceId,
                    confidence: 0.9,
                    proposed_issue_title: pendingPlan.proposed_issue_title,
                    proposed_issue_description:
                      pendingPlan.proposed_issue_description,
                    created_at: new Date().toISOString(),
                  } as Intervention
                }
                onApprove={(_id) => confirmApproval(true)}
                onReject={(_id) => confirmApproval(false)}
              />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
