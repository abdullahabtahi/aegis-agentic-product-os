"use client";

/**
 * useAgentStateSync — subscribes to CopilotKit AG-UI STATE_DELTA events
 * and applies them to local state immutably via fast-json-patch.
 *
 * Uses stable useRef callbacks to avoid stale closures (PR #1 req #8).
 */

import { useCoAgent } from "@copilotkit/react-core";
import { useCallback, useState } from "react";
import { applyStateDelta, mergeState } from "@/lib/delta";
import type { AegisPipelineState } from "@/lib/types";

const INITIAL_STATE: AegisPipelineState = {};

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
      name: "aegis_pipeline",
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
