"use client";

/**
 * AgentStateDebug - Temporary component to visualize agent state
 * DELETE THIS after debugging state sync
 */

import { useAgentStateSync } from "@/hooks/useAgentStateSync";
import { Card } from "@/components/ui/card";

export function AgentStateDebug() {
  const { state: agentState, agentState: rawCopilotState } = useAgentStateSync();

  return (
    <Card className="p-4 max-w-2xl max-h-96 overflow-auto">
      <h3 className="font-bold text-lg mb-2">Agent State Debug</h3>

      <div className="space-y-4">
        <div>
          <h4 className="font-semibold text-sm">CopilotKit Raw State:</h4>
          <pre className="text-xs bg-black/5 p-2 rounded overflow-auto max-h-32">
            {JSON.stringify(rawCopilotState, null, 2)}
          </pre>
        </div>

        <div>
          <h4 className="font-semibold text-sm">Merged State:</h4>
          <pre className="text-xs bg-black/5 p-2 rounded overflow-auto max-h-32">
            {JSON.stringify(agentState, null, 2)}
          </pre>
        </div>

        <div>
          <h4 className="font-semibold text-sm">Key Fields:</h4>
          <ul className="text-xs space-y-1">
            <li>pipeline_status: {agentState.pipeline_status || 'undefined'}</li>
            <li>risk_signal_draft: {typeof agentState.risk_signal_draft}</li>
            <li>intervention_proposal: {typeof agentState.intervention_proposal}</li>
            <li>awaiting_approval_intervention: {typeof agentState.awaiting_approval_intervention}</li>
          </ul>
        </div>
      </div>
    </Card>
  );
}
