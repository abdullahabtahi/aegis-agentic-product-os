"use client";

import { Network, Brain, GitBranch, Gavel, Terminal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PipelineStage, PipelineStageName } from "@/lib/types";
import { PipelineStageCard } from "./PipelineStageCard";

const STAGES: { num: string; stageName: PipelineStageName; label: string; icon: LucideIcon }[] = [
  { num: "01", stageName: "signal_engine", label: "Signal Engine", icon: Network },
  { num: "02", stageName: "product_brain", label: "Product Brain", icon: Brain },
  { num: "03", stageName: "coordinator", label: "Coordinator", icon: GitBranch },
  { num: "04", stageName: "governor", label: "Governor", icon: Gavel },
  { num: "05", stageName: "executor", label: "Executor", icon: Terminal },
];

interface ConnectorProps {
  leftStage?: PipelineStage;
  rightStage?: PipelineStage;
}

function Connector({ leftStage, rightStage }: ConnectorProps) {
  const leftComplete = leftStage?.status === "complete";
  const rightComplete = rightStage?.status === "complete";
  const leftRunning = leftStage?.status === "running";
  const leftError = leftStage?.status === "error";

  let lineClass = "bg-slate-200";
  let dotClass = "bg-slate-300";

  if (leftError) {
    lineClass = "bg-red-200";
    dotClass = "bg-red-400";
  } else if (leftComplete && rightComplete) {
    lineClass = "bg-emerald-300";
    dotClass = "bg-emerald-400";
  } else if (leftComplete) {
    lineClass = "bg-emerald-300";
    dotClass = "bg-slate-300";
  }

  const isAnimating = leftRunning;

  return (
    <div className="flex items-center justify-center flex-1 mt-8">
      <div className="relative w-full flex items-center">
        <div className={`h-px flex-1 ${lineClass} transition-colors duration-500`} />
        <div className="relative flex items-center justify-center mx-1">
          <span className={`h-2 w-2 rounded-full ${dotClass} transition-colors duration-500`} />
          {isAnimating && (
            <span className="absolute h-2 w-2 rounded-full bg-indigo-400 animate-ping opacity-75" />
          )}
        </div>
        <div className={`h-px flex-1 ${lineClass} transition-colors duration-500`} />
      </div>
    </div>
  );
}

interface PipelineFlowRowProps {
  stages?: PipelineStage[];
}

export function PipelineFlowRow({ stages }: PipelineFlowRowProps) {
  const stageMap = new Map(stages?.map((s) => [s.name, s]));

  return (
    <div className="flex items-stretch">
      {STAGES.map((config, idx) => (
        <div key={config.stageName} className="flex items-stretch flex-1 min-w-0">
          <div className="flex-1">
            <PipelineStageCard
              num={config.num}
              stageName={config.stageName}
              label={config.label}
              icon={config.icon}
              stage={stageMap.get(config.stageName)}
            />
          </div>
          {idx < STAGES.length - 1 && (
            <Connector
              leftStage={stageMap.get(config.stageName)}
              rightStage={stageMap.get(STAGES[idx + 1].stageName)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
