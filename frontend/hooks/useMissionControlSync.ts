"use client";

/**
 * useMissionControlSync — builds initial React Flow nodes/edges and exposes
 * a stable syncFromState callback that merges AG-UI state into RF state.
 *
 * Key constraint (PR #1 req #7): merge data only — never reset position,
 * selected, or dragging so the user's canvas layout is preserved.
 *
 * This hook owns NO React Flow state itself — MissionControl owns it via
 * useNodesState/useEdgesState and passes setNodes/setEdges in.
 */

import { useCallback } from "react";
import type { Node, Edge } from "@xyflow/react";
import type { AegisPipelineState, RiskSignal } from "@/lib/types";

export type BetNodeData = {
  label: string;
  status: string;
  hypothesis: string;
  riskSignal?: RiskSignal;
  pipelineStatus?: string;
};

export type AgentNodeData = {
  label: string;
  stage: string;
  active: boolean;
  checkpoint?: string;
};

const AGENT_STAGES = [
  "signal_engine",
  "product_brain",
  "coordinator",
  "governor",
  "executor",
] as const;

function stageLabel(stage: string): string {
  const map: Record<string, string> = {
    signal_engine: "Signal Engine",
    product_brain: "Product Brain",
    coordinator: "Coordinator",
    governor: "Governor",
    executor: "Executor",
  };
  return map[stage] ?? stage;
}

function activeStageFromCheckpoint(checkpoint?: string): string {
  if (!checkpoint) return "signal_engine";
  const map: Record<string, string> = {
    coordinator_complete: "governor",
    governor_complete: "executor",
    awaiting_founder_approval: "governor",
    founder_approved: "executor",
    founder_rejected: "governor",
    executor_complete: "executor",
  };
  return map[checkpoint] ?? "signal_engine";
}

function tryParseRiskSignal(draft: string): RiskSignal | undefined {
  try {
    const parsed = JSON.parse(draft);
    if (parsed && parsed.risk_type) return parsed as RiskSignal;
  } catch {
    // draft may be a human-readable string from early pipeline stages
  }
  return undefined;
}

// ─── Stable initial values (created once, outside the hook) ───────────────

export const INITIAL_NODES: Node[] = AGENT_STAGES.map((stage, i) => ({
  id: `agent-${stage}`,
  type: "agentActivity",
  position: { x: 60 + i * 190, y: 160 },
  data: { label: stageLabel(stage), stage, active: false } as AgentNodeData,
}));

export const INITIAL_EDGES: Edge[] = AGENT_STAGES.slice(0, -1).map(
  (stage, i) => ({
    id: `e-${stage}-${AGENT_STAGES[i + 1]}`,
    source: `agent-${stage}`,
    target: `agent-${AGENT_STAGES[i + 1]}`,
    type: "riskEdge",
    animated: false,
  }),
);

// ─── Hook ─────────────────────────────────────────────────────────────────

interface SyncControls {
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
}

export function useMissionControlSync({ setNodes, setEdges }: SyncControls) {
  const syncFromState = useCallback(
    (state: AegisPipelineState) => {
      const activeStage = activeStageFromCheckpoint(state.pipeline_checkpoint);

      // Update agent nodes — merge data only, preserve position
      setNodes((prev) => {
        let changed = false;
        const next = prev.map((node) => {
          if (!node.id.startsWith("agent-")) return node;
          const d = node.data as AgentNodeData;
          const nowActive = d.stage === activeStage;
          if (d.active === nowActive && d.checkpoint === state.pipeline_checkpoint) {
            return node; // no change — return same ref
          }
          changed = true;
          return {
            ...node,
            data: {
              ...d,
              active: nowActive,
              checkpoint: state.pipeline_checkpoint,
            } as AgentNodeData,
          };
        });

        // Add / update bet node
        if (state.bet) {
          const riskSignal = state.risk_signal_draft
            ? tryParseRiskSignal(state.risk_signal_draft)
            : undefined;

          const betData: BetNodeData = {
            label: state.bet.name,
            status: state.bet.status,
            hypothesis: state.bet.hypothesis,
            riskSignal,
            pipelineStatus: state.pipeline_status,
          };

          const existingBetIdx = next.findIndex((n) => n.id === "bet-main");
          if (existingBetIdx === -1) {
            changed = true;
            next.unshift({
              id: "bet-main",
              type: "betNode",
              position: { x: 420, y: 20 },
              data: betData,
            });
          } else {
            const existing = next[existingBetIdx];
            // Only update if data actually changed
            const existingData = existing.data as BetNodeData;
            if (
              existingData.label !== betData.label ||
              existingData.status !== betData.status ||
              existingData.pipelineStatus !== betData.pipelineStatus ||
              existingData.riskSignal?.risk_type !== betData.riskSignal?.risk_type
            ) {
              changed = true;
              next[existingBetIdx] = {
                ...existing,          // preserve position/selected/dragging
                data: betData,
              };
            }
          }
        }

        return changed ? next : prev; // return same ref if nothing changed
      });

      // Update bet→signal_engine edge animation
      setEdges((prev) => {
        const hasBet = !!state.bet;
        const hasRisk = !!state.risk_signal_draft;
        const edgeId = "e-bet-signal";
        const existingEdge = prev.find((e) => e.id === edgeId);

        if (!hasBet && !existingEdge) return prev;

        if (hasBet && !existingEdge) {
          return [
            {
              id: edgeId,
              source: "bet-main",
              target: "agent-signal_engine",
              type: "riskEdge",
              animated: hasRisk,
            },
            ...prev,
          ];
        }

        if (existingEdge && existingEdge.animated === hasRisk) return prev; // no change

        return prev.map((e) =>
          e.id === edgeId ? { ...e, animated: hasRisk } : e,
        );
      });
    },
    [setNodes, setEdges],
  );

  return { syncFromState };
}
