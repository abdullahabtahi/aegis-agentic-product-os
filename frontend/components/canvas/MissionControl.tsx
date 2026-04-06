"use client";

/**
 * MissionControl — React Flow canvas showing the Aegis pipeline.
 *
 * Syncs with AG-UI state via useMissionControlSync.
 * Position preservation: only node.data is updated on STATE_DELTA (PR #1 req #7).
 */

import { useCallback, useEffect } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { BetNode } from "./BetNode";
import { AgentActivityNode } from "./AgentActivityNode";
import { RiskEdge } from "./RiskEdge";
import type { AegisPipelineState } from "@/lib/types";
import { useMissionControlSync } from "@/hooks/useMissionControlSync";

const NODE_TYPES = {
  betNode: BetNode,
  agentActivity: AgentActivityNode,
};

const EDGE_TYPES = {
  riskEdge: RiskEdge,
};

interface MissionControlProps {
  agentState: AegisPipelineState;
}

export function MissionControl({ agentState }: MissionControlProps) {
  const { nodes: syncedNodes, edges: syncedEdges, syncFromState } =
    useMissionControlSync();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(syncedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(syncedEdges);

  // Sync from AG-UI state — position-preserving merge
  useEffect(() => {
    syncFromState(agentState);
  }, [agentState, syncFromState]);

  // Apply synced nodes/edges from hook — preserve positions by merging data only
  useEffect(() => {
    setNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      return syncedNodes.map((next) => {
        const existing = prevById.get(next.id);
        if (!existing) return next;
        // Preserve layout state; update data only
        return {
          ...existing,
          data: next.data,
        };
      });
    });
    setEdges(syncedEdges);
  }, [syncedNodes, syncedEdges, setNodes, setEdges]);

  const onConnect = useCallback(() => {
    // Canvas is read-only — no manual connections
  }, []);

  return (
    <div className="w-full h-full" style={{ background: "#0A0A0F" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
        className="aegis-canvas"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="rgba(255,255,255,0.04)"
        />
        <Controls
          style={{
            background: "#111118",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 8,
          }}
        />
        <MiniMap
          style={{
            background: "#111118",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
          nodeColor={(n) =>
            n.type === "betNode" ? "#4F7EFF" : "rgba(255,255,255,0.2)"
          }
        />

        {/* SVG arrow marker */}
        <svg style={{ position: "absolute", width: 0, height: 0 }}>
          <defs>
            <marker
              id="arrow"
              markerWidth="6"
              markerHeight="6"
              refX="5"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L6,3 z" fill="rgba(255,255,255,0.2)" />
            </marker>
          </defs>
        </svg>
      </ReactFlow>
    </div>
  );
}
