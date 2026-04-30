"use client";

/**
 * useAgentStateSync — bridges CopilotKit AG-UI agent state to React.
 *
 * IMPORTANT: Seeds workspace_id into the AG-UI session so backend tools
 * (query_linear_issues, get_intervention_history, etc.) can access it
 * from tool_context.state immediately — without waiting for a direction
 * to be declared first.
 *
 * agentState (from CopilotKit/AG-UI) always wins over local defaults so
 * pipeline stage updates from the backend are never masked.
 */

import { useCoAgent } from "@copilotkit/react-core";
import type { AegisPipelineState } from "@/lib/types";

const DEFAULT_WORKSPACE_ID =
  process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID ?? "ws-agentic-os";

const INITIAL_STATE: AegisPipelineState = {
  workspace_id: DEFAULT_WORKSPACE_ID,
};

export function useAgentStateSync() {
  const { state: agentState, setState: setAgentState } =
    useCoAgent<AegisPipelineState>({
      name: "aegis",
      initialState: INITIAL_STATE,
    });

  // agentState IS the source of truth — local defaults only fill missing keys
  const mergedState: AegisPipelineState = { ...INITIAL_STATE, ...agentState };

  return {
    state: mergedState,
    agentState,
    setAgentState,
  };
}
