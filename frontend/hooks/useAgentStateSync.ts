"use client";

/**
 * useAgentStateSync — subscribes to CopilotKit AG-UI STATE_DELTA events
 * and applies them to local state immutably via fast-json-patch.
 *
 * Uses stable useRef callbacks to avoid stale closures (PR #1 req #8).
 *
 * IMPORTANT: Seeds workspace_id into the AG-UI session so backend tools
 * (query_linear_issues, get_intervention_history, etc.) can access it
 * from tool_context.state immediately — without waiting for a direction
 * to be declared first.
 */

import { useCoAgent } from "@copilotkit/react-core";
import { useCallback, useState } from "react";
import { applyStateDelta, mergeState } from "@/lib/delta";
import type { AegisPipelineState } from "@/lib/types";

const DEFAULT_WORKSPACE_ID =
  process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID ?? "ws-agentic-os";

const INITIAL_STATE: AegisPipelineState = {
  workspace_id: DEFAULT_WORKSPACE_ID,
};

export function useAgentStateSync() {
  const [localState, setLocalState] = useState<AegisPipelineState>(INITIAL_STATE);

  const handleStateDelta = useCallback((delta: unknown[]) => {
    setLocalState((prev) => applyStateDelta(prev, delta as never));
  }, []);

  const handleStateSnapshot = useCallback((snapshot: AegisPipelineState) => {
    setLocalState((prev) => mergeState(prev, snapshot));
  }, []);

  const { state: agentState, setState: setAgentState } =
    useCoAgent<AegisPipelineState>({
      name: "aegis",
      initialState: INITIAL_STATE,
    });

  // Merge CopilotKit agent state into local state when it changes
  // CopilotKit handles AG-UI protocol; we keep a local copy for React Flow
  const mergedState: AegisPipelineState = { ...agentState, ...localState };

  return {
    state: mergedState,
    agentState,
    setAgentState,
    handleStateDelta,
    handleStateSnapshot,
  };
}
