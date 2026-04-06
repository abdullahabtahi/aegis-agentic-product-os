"use client";

import { CopilotChat } from "@copilotkit/react-ui";
import { useCopilotReadable, useCopilotAction } from "@copilotkit/react-core";
import { cn } from "@/lib/utils";
import { QuickActionChips } from "@/components/chat/QuickActionChips";
import { InlineApprovalCard } from "@/components/chat/InlineApprovalCard";
import { InlineRiskSignalCard } from "@/components/chat/InlineRiskSignalCard";
import { InlineReasoningCard } from "@/components/chat/InlineReasoningCard";
import type {
  AegisPipelineState,
  ActionType,
  EscalationLevel,
  RiskType,
  Severity,
} from "@/lib/types";
import "@copilotkit/react-ui/styles.css";

interface CopilotChatRailProps {
  agentState: AegisPipelineState;
  workspaceId: string;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  className?: string;
}

export function CopilotChatRail({
  agentState,
  workspaceId,
  onApprove,
  onReject,
  className,
}: CopilotChatRailProps) {
  const isAwaitingApproval =
    agentState.pipeline_status === "awaiting_founder_approval";

  // Defensively parse risk_signal_draft — typed as string but may carry JSON
  const riskDraft =
    typeof agentState.risk_signal_draft === "string" &&
    agentState.risk_signal_draft.startsWith("{")
      ? (() => {
          try {
            return JSON.parse(agentState.risk_signal_draft) as Record<
              string,
              unknown
            >;
          } catch {
            return null;
          }
        })()
      : null;

  // Inject current agent state as grounded context for the co-pilot
  useCopilotReadable({
    description: "Current Aegis pipeline state and active bet context",
    value: {
      bet_name: agentState.bet?.name ?? null,
      workspace_id: workspaceId,
      pipeline_status: agentState.pipeline_status ?? null,
      pipeline_checkpoint: agentState.pipeline_checkpoint ?? null,
      risk_type: riskDraft
        ? (riskDraft.risk_type as string | null) ?? null
        : null,
      confidence: riskDraft
        ? (riskDraft.confidence as number | null) ?? null
        : null,
      intervention_action:
        agentState.intervention_proposal?.action_type ?? null,
    },
  });

  // Generative UI: request_founder_approval → InlineApprovalCard
  useCopilotAction(
    {
      name: "request_founder_approval",
      description:
        "Request the founder to approve or reject a proposed intervention",
      parameters: [
        { name: "intervention_title", type: "string", description: "Title of the intervention" },
        { name: "action_type", type: "string", description: "Type of action being proposed" },
        { name: "escalation_level", type: "number", description: "Escalation level (1-3)" },
        { name: "rationale", type: "string", description: "Rationale for the intervention" },
        { name: "confidence", type: "number", description: "Model confidence score (0-1)" },
        { name: "risk_type", type: "string", description: "Type of risk detected", required: false },
        { name: "severity", type: "string", description: "Severity level", required: false },
        {
          name: "requires_double_confirm",
          type: "boolean",
          description: "Whether double confirmation is required",
          required: false,
        },
      ],
      render: ({ args, status }) => {
        if (status === "inProgress") return <></>;
        return (
          <InlineApprovalCard
            intervention_title={String(args.intervention_title ?? "")}
            action_type={args.action_type as ActionType}
            escalation_level={
              Number(args.escalation_level ?? 1) as EscalationLevel
            }
            rationale={String(args.rationale ?? "")}
            confidence={Number(args.confidence ?? 0)}
            risk_type={args.risk_type as string | undefined}
            severity={args.severity as string | undefined}
            requires_double_confirm={Boolean(args.requires_double_confirm)}
            onApprove={() =>
              onApprove(
                agentState.awaiting_approval_intervention?.id ?? "pending"
              )
            }
            onReject={() =>
              onReject(
                agentState.awaiting_approval_intervention?.id ?? "pending"
              )
            }
          />
        );
      },
    },
    [agentState.awaiting_approval_intervention, onApprove, onReject]
  );

  // Generative UI: emit_risk_signal → InlineRiskSignalCard
  useCopilotAction(
    {
      name: "emit_risk_signal",
      description: "Emit a structured risk signal to the founder",
      parameters: [
        { name: "risk_type", type: "string", description: "Type of risk" },
        { name: "severity", type: "string", description: "Severity level" },
        {
          name: "confidence",
          type: "number",
          description: "Confidence score (0-1)",
        },
        {
          name: "evidence_summary",
          type: "string",
          description: "Summary of supporting evidence",
        },
        {
          name: "headline",
          type: "string",
          description: "Short headline",
          required: false,
        },
      ],
      render: ({ args, status }) => {
        if (status === "inProgress") return <></>;
        return (
          <InlineRiskSignalCard
            risk_type={args.risk_type as RiskType}
            severity={args.severity as Severity}
            confidence={Number(args.confidence ?? 0)}
            evidence_summary={String(args.evidence_summary ?? "")}
            headline={args.headline as string | undefined}
          />
        );
      },
    },
    []
  );

  // Generative UI: show_reasoning → InlineReasoningCard
  useCopilotAction(
    {
      name: "show_reasoning",
      description:
        "Show the Product Brain internal reasoning (cynic, optimist, synthesis)",
      parameters: [
        {
          name: "cynic_view",
          type: "string",
          description: "Cynic perspective",
          required: false,
        },
        {
          name: "optimist_view",
          type: "string",
          description: "Optimist perspective",
          required: false,
        },
        {
          name: "synthesis",
          type: "string",
          description: "Synthesis view",
          required: false,
        },
        {
          name: "risk_type",
          type: "string",
          description: "Associated risk type",
          required: false,
        },
      ],
      render: ({ args, status }) => {
        if (status === "inProgress") return <></>;
        return (
          <InlineReasoningCard
            cynic_view={args.cynic_view as string | undefined}
            optimist_view={args.optimist_view as string | undefined}
            synthesis={args.synthesis as string | undefined}
            risk_type={args.risk_type as string | undefined}
          />
        );
      },
    },
    []
  );

  return (
    <div
      className={cn(
        "flex flex-col h-full overflow-hidden",
        isAwaitingApproval &&
          "ring-1 ring-orange-500/30 ring-inset animate-pulse",
        className
      )}
    >
      <CopilotChat
        className="flex-1 overflow-hidden"
        instructions="You are Aegis, an agentic product co-pilot for founders. You have access to the current pipeline state and Linear evidence. Be specific. Cite evidence. Reference product principles by name when explaining risk signals. Speak in terms of lost upside, not problems."
        labels={{
          title: "Co-Pilot",
          initial: "Ask about this signal…",
          placeholder: "Ask about this signal…",
        }}
      />
      {/* QuickActionChips rendered as sibling below CopilotChat — CopilotChat does not accept a Footer/Input injection prop */}
      <QuickActionChips agentState={agentState} />
    </div>
  );
}
