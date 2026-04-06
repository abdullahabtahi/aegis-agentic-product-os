"use client";

/**
 * useJulesPlanApproval — CopilotKit HITL for Jules actions (L3).
 * Uses renderAndWaitForResponse to surface Jules plan for human confirmation
 * before execution.
 *
 * Jules actions: jules_instrument_experiment, jules_add_guardrails,
 *                jules_refactor_blocker, jules_scaffold_experiment
 */

import { useCopilotAction } from "@copilotkit/react-core";
import { useState } from "react";
import type { ActionType } from "@/lib/types";

const JULES_ACTIONS = new Set<ActionType>([
  "jules_instrument_experiment",
  "jules_add_guardrails",
  "jules_refactor_blocker",
  "jules_scaffold_experiment",
]);

export function isJulesAction(actionType: ActionType): boolean {
  return JULES_ACTIONS.has(actionType);
}

interface JulesPlanPayload {
  action_type: ActionType;
  title: string;
  rationale: string;
  proposed_issue_title?: string;
  proposed_issue_description?: string;
  bet_name: string;
}

interface ApprovalState {
  pending: JulesPlanPayload | null;
  resolve: ((approved: boolean) => void) | null;
}

export function useJulesPlanApproval() {
  const [approval, setApproval] = useState<ApprovalState>({
    pending: null,
    resolve: null,
  });

  useCopilotAction({
    name: "approve_jules_plan",
    description:
      "Request human approval before Jules executes a code change. " +
      "Called when Governor approves a Jules L3 intervention.",
    parameters: [
      { name: "action_type", type: "string", required: true },
      { name: "title", type: "string", required: true },
      { name: "rationale", type: "string", required: true },
      { name: "proposed_issue_title", type: "string", required: false },
      { name: "proposed_issue_description", type: "string", required: false },
      { name: "bet_name", type: "string", required: true },
    ],
    renderAndWaitForResponse: ({ args, respond }) => {
      const payload = args as unknown as JulesPlanPayload;
      setApproval({
        pending: payload,
        resolve: (approved: boolean) => {
          respond({ approved });
          setApproval({ pending: null, resolve: null });
        },
      });
      // Return null — the ApprovalCard component renders via approval state
      return null;
    },
  });

  const confirmApproval = (approved: boolean) => {
    approval.resolve?.(approved);
  };

  return {
    pendingPlan: approval.pending,
    confirmApproval,
    hasPendingPlan: approval.pending !== null,
  };
}
