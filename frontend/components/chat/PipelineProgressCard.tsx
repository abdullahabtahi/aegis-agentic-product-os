"use client";

/**
 * PipelineProgressCard — Inline collapsible card showing 5-stage pipeline progress.
 * Renders inside the CommandBar message area when a pipeline scan is active.
 */

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Radio,
  CheckCircle2,
  Circle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import type {
  PipelineStatus,
  PipelineStageName,
  PipelineStage,
} from "@/lib/types";

interface PipelineProgressCardProps {
  status: PipelineStatus;
  stages?: PipelineStage[];
}

const STAGE_LABELS: Record<PipelineStageName, string> = {
  signal_engine: "Signal Engine",
  product_brain: "Product Brain",
  coordinator: "Coordinator",
  governor: "Governor",
  executor: "Executor",
};

const STATUS_LABELS: Record<PipelineStatus, string> = {
  idle: "Idle",
  scanning: "Scanning signals...",
  analyzing: "Analyzing risks...",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  executing: "Executing action...",
  complete: "Complete",
  error: "Error",
};

function StageIcon({ status }: { status: string }) {
  switch (status) {
    case "complete":
      return <CheckCircle2 size={14} className="text-emerald-500" />;
    case "running":
      return <Loader2 size={14} className="animate-spin text-indigo-500" />;
    case "error":
      return <AlertCircle size={14} className="text-red-500" />;
    default:
      return <Circle size={14} className="text-slate-300" />;
  }
}

export function PipelineProgressCard({
  status,
  stages,
}: PipelineProgressCardProps) {
  const [expanded, setExpanded] = useState(true);

  const completedCount = stages?.filter((s) => s.status === "complete").length ?? 0;
  const totalStages = stages?.length ?? 5;

  return (
    <div className="glass-panel overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/10"
      >
        <div className="flex items-center gap-2.5">
          <Radio
            size={16}
            className={
              status === "error"
                ? "text-red-500"
                : status === "complete"
                  ? "text-emerald-500"
                  : "animate-pulse text-indigo-500"
            }
          />
          <span className="text-sm font-medium text-foreground/85">
            {STATUS_LABELS[status] ?? status}
          </span>
          <span className="text-xs text-muted-foreground">
            {completedCount}/{totalStages} stages
          </span>
        </div>
        {expanded ? (
          <ChevronUp size={16} className="text-muted-foreground" />
        ) : (
          <ChevronDown size={16} className="text-muted-foreground" />
        )}
      </button>

      {/* Expanded stage list */}
      {expanded && stages && (
        <div className="border-t border-white/15 px-4 py-3">
          <div className="flex flex-col gap-2">
            {stages.map((stage) => (
              <div
                key={stage.name}
                className="flex items-center gap-2.5"
              >
                <StageIcon status={stage.status} />
                <span
                  className={`text-xs ${
                    stage.status === "running"
                      ? "font-medium text-foreground/90"
                      : stage.status === "complete"
                        ? "text-foreground/60"
                        : "text-muted-foreground"
                  }`}
                >
                  {STAGE_LABELS[stage.name]}
                </span>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-500"
              style={{ width: `${(completedCount / totalStages) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
