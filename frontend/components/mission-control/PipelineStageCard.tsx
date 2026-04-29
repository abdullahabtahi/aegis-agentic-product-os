"use client";

import type { LucideIcon } from "lucide-react";
import type { PipelineStage, PipelineStageName } from "@/lib/types";

interface PipelineStageCardProps {
  num: string;
  stageName: PipelineStageName;
  label: string;
  icon: LucideIcon;
  stage?: PipelineStage;
}

function deriveElapsed(stage: PipelineStage): string | null {
  if (stage.status !== "complete") return null;
  if (!stage.started_at || !stage.completed_at) return null;
  const elapsed = (new Date(stage.completed_at).getTime() - new Date(stage.started_at).getTime()) / 1000;
  if (elapsed <= 0) return null;
  return `${elapsed.toFixed(1)}s`;
}

const STATUS_CONFIG = {
  running: {
    label: "RUNNING",
    cls: "text-indigo-600 bg-indigo-600/10",
    dot: "bg-indigo-500 animate-pulse",
  },
  complete: {
    label: "COMPLETE",
    cls: "text-emerald-600 bg-emerald-500/10",
    dot: "bg-emerald-500",
  },
  error: {
    label: "ERROR",
    cls: "text-red-600 bg-red-500/10",
    dot: "bg-red-500",
  },
  pending: {
    label: "IDLE",
    cls: "text-slate-500 bg-slate-200/50",
    dot: "bg-slate-300",
  },
} as const;

export function PipelineStageCard({ num, label, icon: Icon, stage }: PipelineStageCardProps) {
  const status = stage?.status ?? "pending";
  const { label: statusLabel, cls: statusClass, dot: dotClass } = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const elapsed = stage ? deriveElapsed(stage) : null;

  return (
    <div className="glass-panel flex flex-col items-center gap-2 rounded-2xl p-4 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/50 shadow-sm">
        <Icon size={20} className="text-[#112478]" strokeWidth={1.5} />
      </div>
      <div>
        <p className="mb-0.5 text-[11px] font-medium uppercase tracking-widest text-slate-400">
          Stage {num}
        </p>
        <h3 className="font-heading text-sm font-semibold text-[#1a1c1d]">{label}</h3>
        {elapsed && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{elapsed}</p>
        )}
      </div>
      <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold ${statusClass}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
        {statusLabel}
      </div>
    </div>
  );
}
