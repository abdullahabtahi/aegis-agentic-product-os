"use client";

/**
 * useMissionControlSync — manages React Flow nodes/edges derived from AG-UI state.
 *
 * Key constraint (PR #1 req #7): when STATE_DELTA arrives, merge node DATA only.
 * Never reset position, selected, or dragging — preserves user canvas layout.
 */

import { useCallback, useState } from "react";
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
];

function buildInitialNodes(): Node[] {
  return AGENT_STAGES.map((stage, i) => ({
    id: `agent-${stage}`,
    type: "agentActivity",
    position: { x: 80 + i * 200, y: 160 },
    data: { label: stageLabel(stage), stage, active: false } as AgentNodeData,
  }));
}

function buildInitialEdges(): Edge[] {
  return AGENT_STAGES.slice(0, -1).map((stage, i) => ({
    id: `e-${stage}-${AGENT_STAGES[i + 1]}`,
    source: `agent-${stage}`,
    target: `agent-${AGENT_STAGES[i + 1]}`,
    type: "riskEdge",
    animated: false,
  }));
}

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

function activeStageFromCheckpoint(checkpoint?: string): string | null {
  if (!checkpoint) return "signal_engine";
  const map: Record<string, string> = {
    coordinator_complete: "governor",
    governor_complete: "executor",
    awaiting_founder_approval: "governor",
    founder_approved: "executor",
    founder_rejected: "governor",
    executor_complete: "executor",
  };
  return map[checkpoint] ?? null;
}

export function useMissionControlSync() {
  const [nodes, setNodes] = useState<Node[]>(() => buildInitialNodes());
  const [edges, setEdges] = useState<Edge[]>(() => buildInitialEdges());
  const [betNode, setBetNode] = useState<Node | null>(null);

  // Merge DATA only — preserve position/selected/dragging (PR #1 req #7)
  const syncFromState = useCallback((state: AegisPipelineState) => {
    const activeStage = activeStageFromCheckpoint(state.pipeline_checkpoint);

    setNodes((prev) =>
      prev.map((node) => {
        if (!node.id.startsWith("agent-")) return node;
        const stage = (node.data as AgentNodeData).stage;
        return {
          ...node,
          data: {
            ...node.data,
            active: stage === activeStage,
            checkpoint: state.pipeline_checkpoint,
          } as AgentNodeData,
        };
      }),
    );

    if (state.bet) {
      const riskSignal = state.risk_signal_draft
        ? tryParseRiskSignal(state.risk_signal_draft)
        : undefined;

      setBetNode((prev) => ({
        id: "bet-main",
        type: "betNode",
        position: prev?.position ?? { x: 460, y: 20 },
        // preserve position if already placed, else center
        selected: prev?.selected,
        dragging: prev?.dragging,
        data: {
          label: state.bet!.name,
          status: state.bet!.status,
          hypothesis: state.bet!.hypothesis,
          riskSignal,
          pipelineStatus: state.pipeline_status,
        } as BetNodeData,
      }));
    }
  }, []);

  // Combine bet node into final nodes list
  const allNodes = betNode ? [betNode, ...nodes] : nodes;

  const betEdges: Edge[] = betNode
    ? [
        {
          id: "e-bet-signal",
          source: "bet-main",
          target: "agent-signal_engine",
          type: "riskEdge",
          animated: !!betNode.data.riskSignal,
        },
      ]
    : [];

  return {
    nodes: allNodes,
    edges: [...betEdges, ...edges],
    setNodes,
    setEdges,
    syncFromState,
  };
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
