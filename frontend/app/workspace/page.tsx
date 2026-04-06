"use client";

/**
 * /workspace — Mission Control page.
 * Shows the React Flow pipeline canvas + Intervention Inbox side panel.
 */

import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { MissionControl } from "@/components/canvas/MissionControl";
import { InterventionInbox } from "@/components/interventions/InterventionInbox";
import { useAgentStateSync } from "@/hooks/useAgentStateSync";
import { useInterventionInbox } from "@/hooks/useInterventionInbox";
import { useJulesPlanApproval } from "@/hooks/useJulesPlanApproval";
import { ApprovalCard } from "@/components/interventions/ApprovalCard";
import { useWorkspaceState } from "@/hooks/useWorkspaceState";
import type { Intervention } from "@/lib/types";

export default function WorkspacePage() {
  const { workspaceId } = useWorkspaceState();
  const { state: agentState } = useAgentStateSync();
  // Single hook instance — owns all intervention state for this page
  const { pending, invalidateOnComplete } = useInterventionInbox(workspaceId);
  const { pendingPlan, confirmApproval } = useJulesPlanApproval();

  // Invalidate intervention list when pipeline reaches awaiting_founder_approval
  useEffect(() => {
    if (agentState.pipeline_status === "awaiting_founder_approval") {
      invalidateOnComplete();
    }
  }, [agentState.pipeline_status, invalidateOnComplete]);

  return (
    <AppShell
      pendingCount={pending.length}
      rightPanel={<InterventionInbox workspaceId={workspaceId} />}
    >
      <div className="h-full flex flex-col">
        {/* Page header — Perplexity information density */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-white/70 tracking-wide uppercase">
              Mission Control
            </span>
            {agentState.pipeline_status && (
              <span className="text-[10px] font-mono text-white/30 border border-white/8 px-1.5 py-0.5 rounded">
                {agentState.pipeline_status.replace(/_/g, " ")}
              </span>
            )}
          </div>
          {agentState.bet && (
            <span className="text-[11px] text-white/40">
              {agentState.bet.name}
            </span>
          )}
        </div>

        {/* Canvas */}
        <div className="flex-1 relative">
          <MissionControl agentState={agentState} />

          {/* Jules HITL approval overlay */}
          {pendingPlan && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20 p-6">
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
                  // Jules actions: id param is ignored — decision flows via CopilotKit respond()
                  onApprove={(_id) => confirmApproval(true)}
                  onReject={(_id) => confirmApproval(false)}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
