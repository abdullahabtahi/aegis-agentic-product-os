"use client";

import { useCoAgent } from "@copilotkit/react-core";
import { useCopilotChatInternal } from "@copilotkit/react-core";
import { randomId } from "@copilotkit/shared";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@/hooks/useWorkspaceId";
import { getWorkspace } from "@/lib/api";
import type { AegisPipelineState, ControlLevel } from "@/lib/types";

const LEVELS: Array<{
  value: ControlLevel;
  label: string;
  badge: string;
  description: string;
}> = [
  {
    value: "draft_only",
    label: "Draft Only",
    badge: "L1",
    description:
      "Aegis drafts all interventions. You review and approve every action before anything touches Linear.",
  },
  {
    value: "require_approval",
    label: "Require Approval",
    badge: "L2",
    description:
      "Low-escalation actions (L1/L2) are auto-applied. L3+ actions always require your approval.",
  },
  {
    value: "autonomous_low_risk",
    label: "Autonomous Low Risk",
    badge: "L3",
    description:
      "Aegis handles routine L1 actions autonomously. High-risk and L3+ actions still require approval.",
  },
];

export default function SettingsPage() {
  const workspaceId = useWorkspaceId();
  const { state, setState } = useCoAgent<AegisPipelineState>({ name: "aegis" });
  const { sendMessage } = useCopilotChatInternal();

  // Hydrate from DB on mount (survives page reload)
  const { data: ws } = useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: () => getWorkspace(workspaceId),
    staleTime: 60_000,
    enabled: workspaceId !== "default_workspace",
  });

  // Prefer AG-UI state (live), fall back to DB value, then default
  const current: ControlLevel =
    (state?.control_level as ControlLevel) ??
    (ws?.control_level as ControlLevel) ??
    "draft_only";

  function handleSelect(level: ControlLevel) {
    if (level === current) return;
    // Optimistically update AG-UI state so UI reflects immediately
    setState((prev) => ({ ...prev, control_level: level }));
    // Trigger adjust_autonomy tool via the agent
    sendMessage({ id: randomId(), role: "user", content: `Set autonomy level to ${level}` });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-foreground/90">Autonomy Settings</h1>
          <p className="text-sm text-foreground/50">
            Control how much Aegis acts on your behalf.
          </p>
        </div>
        <div className="space-y-3">
          {LEVELS.map((l) => {
            const isActive = current === l.value;
            return (
              <button
                key={l.value}
                onClick={() => handleSelect(l.value)}
                className={[
                  "w-full rounded-xl border p-4 text-left transition-all",
                  isActive
                    ? "border-indigo-500/60 bg-indigo-500/10"
                    : "border-white/8 bg-white/3 hover:border-white/15 hover:bg-white/5",
                ].join(" ")}
              >
                <div className="flex items-center gap-3">
                  <span className="rounded-md bg-indigo-500/15 px-2 py-0.5 text-xs font-bold text-indigo-400">
                    {l.badge}
                  </span>
                  <span className="text-sm font-medium text-foreground/90">{l.label}</span>
                  {isActive && (
                    <span className="ml-auto text-xs text-indigo-400">Active</span>
                  )}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-foreground/50">
                  {l.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>
  );
}
