"use client";

/**
 * /workspace — Agentic Command Center.
 *
 * Three-column layout: Left nav (AppShell) + Center Instrument Panel + Right Co-Pilot Rail.
 * All interactive decisions happen in the right CopilotChatRail via generative UI cards.
 */

import { useEffect, useCallback, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AgentWorkflowFeed } from "@/components/dashboard/AgentWorkflowFeed";
import { TelemetryMinimap } from "@/components/dashboard/TelemetryMinimap";
import { BetContextCard } from "@/components/dashboard/BetContextCard";
import { BetDeclarationDrawer } from "@/components/dashboard/BetDeclarationDrawer";
import { CopilotChatRail } from "@/components/chat/CopilotChatRail";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { useAgentStateSync } from "@/hooks/useAgentStateSync";
import { useInterventionInbox } from "@/hooks/useInterventionInbox";
import { useInterventionApproval } from "@/hooks/useInterventionApproval";
import { useJulesPlanApproval } from "@/hooks/useJulesPlanApproval";
import { useWorkspaceState } from "@/hooks/useWorkspaceState";
import { ApprovalCard } from "@/components/interventions/ApprovalCard";
import type { Intervention } from "@/lib/types";

export default function WorkspacePage() {
  const { workspaceId, activeBet } = useWorkspaceState();
  const { state: agentState } = useAgentStateSync();
  const { pending, invalidateOnComplete } = useInterventionInbox(workspaceId);
  const { approve, reject } = useInterventionApproval(workspaceId);
  const { pendingPlan, confirmApproval } = useJulesPlanApproval();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (agentState.pipeline_status === "awaiting_founder_approval") {
      invalidateOnComplete();
    }
  }, [agentState.pipeline_status, invalidateOnComplete]);

  const handleApprove = useCallback(
    (id: string) => {
      if (agentState.awaiting_approval_intervention) {
        approve.mutate(agentState.awaiting_approval_intervention.id ?? id);
      } else {
        approve.mutate(id);
      }
    },
    [agentState.awaiting_approval_intervention, approve]
  );

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

  const handleBetConfirm = useCallback((_description: string) => {
    // Phase 6: POST to /bets — for now, just close the drawer.
    // The description will be used by the agent to extract bet fields.
    setDrawerOpen(false);
  }, []);

  return (
    <AppShell pendingCount={pending.length}>
      <div className="h-full flex flex-col overflow-hidden">
        <ResizablePanelGroup orientation="horizontal" className="flex-1 overflow-hidden">
          {/* Center: Instrument Panel */}
          <ResizablePanel defaultSize={48} minSize={35}>
            <div className="h-full flex flex-col overflow-hidden">
              {/* Bet Context Card */}
              <BetContextCard
                activeBet={activeBet}
                agentState={agentState}
                workspaceId={workspaceId}
                onEditBet={() => setDrawerOpen(true)}
              />

              {/* Pipeline Trace */}
              <div className="flex-1 overflow-hidden">
                <AgentWorkflowFeed agentState={agentState} className="h-full" />
              </div>

              {/* Telemetry Minimap — bottom of center column */}
              <div className="shrink-0 border-t border-white/8">
                <TelemetryMinimap agentState={agentState} />
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle className="w-px bg-white/8 hover:bg-[#4F7EFF]/30 transition-colors" />

          {/* Right: Co-Pilot Rail */}
          <ResizablePanel defaultSize={52} minSize={30}>
            <CopilotChatRail
              agentState={agentState}
              workspaceId={workspaceId}
              onApprove={handleApprove}
              onReject={handleReject}
              className="h-full"
            />
          </ResizablePanel>
        </ResizablePanelGroup>

        {/* Jules HITL overlay (CopilotKit respond() path) */}
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

      <BetDeclarationDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onConfirm={handleBetConfirm}
      />
    </AppShell>
  );
}
