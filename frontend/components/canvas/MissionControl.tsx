"use client";

/**
 * MissionControl — React Flow canvas showing the Aegis pipeline.
 *
 * Owns all RF state (nodes/edges) to avoid the split-ownership infinite loop.
 * syncFromState merges data only — positions are never reset (PR #1 req #7).
 * Client-only mount guard prevents SSR hydration mismatch from ReactFlow.
 */

import { useCallback, useEffect, useState } from "react";
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
import {
  useMissionControlSync,
  INITIAL_NODES,
  INITIAL_EDGES,
} from "@/hooks/useMissionControlSync";

// Defined outside component so references are stable across renders
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
  // Gate: don't render ReactFlow during SSR — prevents hydration mismatch
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Single owner of all RF state
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(INITIAL_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(INITIAL_EDGES);

  // Pass setters into the hook — hook never owns state itself
  const { syncFromState } = useMissionControlSync({ setNodes, setEdges });

  // Sync on every agentState change
  useEffect(() => {
    syncFromState(agentState);
  }, [agentState, syncFromState]);

  const onConnect = useCallback(() => {
    // Canvas is read-only — no manual connections
  }, []);

  if (!mounted) {
    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{ background: "#0A0A0F" }}
      >
        <span className="text-xs text-white/20 font-mono">Loading canvas…</span>
      </div>
    );
  }

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

        {/* SVG arrow marker — inside ReactFlow so it's client-only */}
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
