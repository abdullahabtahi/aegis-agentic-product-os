"use client";

/**
 * TelemetryMinimap — Collapsed diagnostic pipeline view.
 *
 * Replaces the full-screen React Flow MissionControl canvas with a compact,
 * collapsible blueprint visualization of the 5-stage ADK pipeline:
 *   Signal Engine → Product Brain → Coordinator → Governor → Executor
 *
 * Transitions are derived entirely from AegisPipelineState.pipeline_checkpoint.
 * No ADK internal details are leaked — this view is for observability only.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { AegisPipelineState } from "@/lib/types";
import {
  Database,
  Brain,
  Users,
  Shield,
  Zap,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
} from "lucide-react";

// ─────────────────────────────────────────────
// PIPELINE STAGE DEFINITIONS
// ─────────────────────────────────────────────

type StageStatus = "idle" | "running" | "done" | "denied" | "skipped";

interface PipelineStage {
  id: string;
  label: string;
  sublabel: string;
  icon: React.ElementType;
  color: string;
  checkpoints: string[]; // checkpoints that mark this stage "done"
  runningAt: string[]; // checkpoints where this stage is "running"
}

const PIPELINE_STAGES: PipelineStage[] = [
  {
    id: "signal_engine",
    label: "Signal",
    sublabel: "Linear read",
    icon: Database,
    color: "text-blue-400",
    checkpoints: [
      "signal_engine_complete",
      "product_brain_complete",
      "coordinator_complete",
      "governor_complete",
      "awaiting_founder_approval",
      "founder_approved",
      "founder_rejected",
      "executor_complete",
    ],
    runningAt: [],
  },
  {
    id: "product_brain",
    label: "Brain",
    sublabel: "Debate",
    icon: Brain,
    color: "text-violet-400",
    checkpoints: [
      "product_brain_complete",
      "coordinator_complete",
      "governor_complete",
      "awaiting_founder_approval",
      "founder_approved",
      "founder_rejected",
      "executor_complete",
    ],
    runningAt: ["signal_engine_complete"],
  },
  {
    id: "coordinator",
    label: "Coord",
    sublabel: "Proposal",
    icon: Users,
    color: "text-cyan-400",
    checkpoints: [
      "coordinator_complete",
      "governor_complete",
      "awaiting_founder_approval",
      "founder_approved",
      "founder_rejected",
      "executor_complete",
    ],
    runningAt: ["product_brain_complete"],
  },
  {
    id: "governor",
    label: "Governor",
    sublabel: "8 checks",
    icon: Shield,
    color: "text-amber-400",
    checkpoints: [
      "governor_complete",
      "awaiting_founder_approval",
      "founder_approved",
      "founder_rejected",
      "executor_complete",
    ],
    runningAt: ["coordinator_complete"],
  },
  {
    id: "executor",
    label: "Executor",
    sublabel: "Linear write",
    icon: Zap,
    color: "text-emerald-400",
    checkpoints: ["executor_complete"],
    runningAt: ["founder_approved"],
  },
];

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function getStageStatus(
  stage: PipelineStage,
  checkpoint: string,
  governorDenied: boolean
): StageStatus {
  if (!checkpoint) return "idle";
  if (stage.checkpoints.includes(checkpoint)) {
    // Governor denied check
    if (
      stage.id === "executor" &&
      (checkpoint === "governor_complete" || checkpoint === "founder_rejected") &&
      governorDenied
    ) {
      return "skipped";
    }
    return "done";
  }
  if (stage.runningAt.includes(checkpoint)) return "running";
  // Check if HITL waiting (executor is blocked)
  if (
    stage.id === "executor" &&
    checkpoint === "awaiting_founder_approval"
  ) {
    return "idle";
  }
  return "idle";
}

// ─────────────────────────────────────────────
// STAGE NODE
// ─────────────────────────────────────────────

function StageNode({
  stage,
  status,
  isLast,
}: {
  stage: PipelineStage;
  status: StageStatus;
  isLast: boolean;
}) {
  const Icon = stage.icon;

  const ringColor = {
    idle: "ring-white/10",
    running: "ring-cyan-500/50",
    done: "ring-emerald-500/40",
    denied: "ring-red-500/40",
    skipped: "ring-white/6",
  }[status];

  const bgColor = {
    idle: "bg-white/3",
    running: "bg-cyan-500/10",
    done: "bg-emerald-500/10",
    denied: "bg-red-500/10",
    skipped: "bg-white/3 opacity-30",
  }[status];

  return (
    <div className="flex items-center gap-1">
      {/* Node */}
      <div className="flex flex-col items-center gap-1">
        <div
          className={cn(
            "size-8 rounded-lg ring-1 flex items-center justify-center transition-all duration-500",
            bgColor,
            ringColor
          )}
        >
          {status === "running" ? (
            <Loader2 className="size-3.5 text-cyan-400 animate-spin" />
          ) : status === "done" ? (
            <CheckCircle2 className="size-3.5 text-emerald-400" />
          ) : status === "denied" || status === "skipped" ? (
            <XCircle className="size-3.5 text-white/20" />
          ) : (
            <Icon className={cn("size-3.5", stage.color, "opacity-40")} />
          )}
        </div>
        <span
          className={cn(
            "text-[8px] font-semibold text-center leading-tight",
            status === "done"
              ? "text-white/60"
              : status === "running"
                ? "text-cyan-400"
                : "text-white/20"
          )}
        >
          {stage.label}
        </span>
      </div>

      {/* Connector */}
      {!isLast && (
        <div
          className={cn(
            "h-px w-6 rounded-full transition-all duration-700",
            status === "done" ? "bg-emerald-500/30" : "bg-white/8"
          )}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────

interface TelemetryMinimapProps {
  agentState: AegisPipelineState;
  className?: string;
}

export function TelemetryMinimap({
  agentState,
  className,
}: TelemetryMinimapProps) {
  const [expanded, setExpanded] = useState(false);

  const checkpoint = agentState.pipeline_checkpoint ?? "";
  const governorDenied =
    !!agentState.governor_decision &&
    !(agentState.governor_decision as { approved?: boolean }).approved;

  const stageStatuses = PIPELINE_STAGES.map((stage) => ({
    stage,
    status: getStageStatus(stage, checkpoint, governorDenied),
  }));

  const doneCount = stageStatuses.filter((s) => s.status === "done").length;
  const isRunning = stageStatuses.some((s) => s.status === "running");
  const isIdle = !checkpoint || checkpoint === "";

  return (
    <div
      className={cn(
        "rounded-xl ring-1 ring-white/10 bg-black/40 backdrop-blur-md overflow-hidden transition-all duration-300",
        className
      )}
    >
      {/* Header / Toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/4 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "size-1.5 rounded-full",
              isRunning
                ? "bg-cyan-400 animate-pulse"
                : doneCount > 0
                  ? "bg-emerald-400"
                  : "bg-white/20"
            )}
          />
          <span className="text-[9px] font-semibold uppercase tracking-widest text-white/40">
            Telemetry
          </span>
          {!isIdle && (
            <span className="text-[8px] font-mono text-white/25">
              {doneCount}/{PIPELINE_STAGES.length}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="size-3 text-white/30" />
        ) : (
          <ChevronUp className="size-3 text-white/30" />
        )}
      </button>

      {/* Pipeline diagram */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-white/6">
          {isIdle ? (
            <div className="flex items-center justify-center gap-1.5 py-2 opacity-30">
              <Circle className="size-3 text-white/30" />
              <span className="text-[9px] text-white/30">Pipeline idle</span>
            </div>
          ) : (
            <div className="flex items-center justify-center mt-2">
              {stageStatuses.map(({ stage, status }, i) => (
                <StageNode
                  key={stage.id}
                  stage={stage}
                  status={status}
                  isLast={i === PIPELINE_STAGES.length - 1}
                />
              ))}
            </div>
          )}

          {/* Checkpoint label */}
          {checkpoint && (
            <div className="mt-2 text-center">
              <span className="text-[8px] font-mono text-white/20 border border-white/6 px-1.5 py-0.5 rounded">
                {checkpoint.replace(/_/g, " ")}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
