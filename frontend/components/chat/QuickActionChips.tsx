"use client";

import { useCopilotChat } from "@copilotkit/react-core";
import { TextMessage, Role } from "@copilotkit/runtime-client-gql";
import type { AegisPipelineState } from "@/lib/types";

interface QuickActionChipsProps {
  agentState: AegisPipelineState;
}

const CHIPS = [
  {
    label: "Why this signal?",
    message:
      "Explain why you flagged this risk, citing the specific Linear evidence and the product principle you used.",
  },
  {
    label: "Show the evidence",
    message:
      "List the specific Linear issues that triggered this signal.",
  },
  {
    label: "Alternatives?",
    message:
      "What are the other interventions you considered? Show the top 2 alternatives to your recommendation.",
  },
  {
    label: "I've already handled this",
    message:
      "The founder says this has already been handled. Acknowledge it, log it as acknowledged risk, and confirm no further action needed.",
  },
] as const;

export function QuickActionChips({ agentState }: QuickActionChipsProps) {
  const { appendMessage } = useCopilotChat();

  const hasRiskSignal =
    agentState.risk_signal_draft !== undefined &&
    agentState.risk_signal_draft !== null &&
    agentState.risk_signal_draft !== "";

  if (!hasRiskSignal) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-3 pb-2">
      {CHIPS.map((chip) => (
        <button
          key={chip.label}
          onClick={() =>
            appendMessage(
              new TextMessage({
                id: `chip-${Date.now()}-${chip.label}`,
                role: Role.User,
                content: chip.message,
              })
            )
          }
          className="text-[11px] px-2.5 py-1 rounded-full border border-white/10 bg-white/3 text-white/50 hover:text-white/80 hover:border-white/20 hover:bg-white/8 transition-all"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
