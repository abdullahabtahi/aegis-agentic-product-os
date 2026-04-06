"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NodeErrorBoundary } from "./NodeErrorBoundary";
import type { BetNodeData } from "@/hooks/useMissionControlSync";
import { SEVERITY_BG } from "@/lib/constants";
import type { Severity } from "@/lib/types";
import { cn } from "@/lib/utils";

function BetNodeInner({ data, selected }: NodeProps) {
  const d = data as BetNodeData;
  const severity = (d.riskSignal?.severity as Severity) ?? null;
  const hasRisk = !!d.riskSignal;

  return (
    <div
      className={cn(
        "min-w-[220px] max-w-[280px] rounded-lg border p-3 text-sm transition-all",
        "bg-[#111118] border-white/10",
        selected && "border-[#4F7EFF]/60 shadow-[0_0_0_1px_rgba(79,126,255,0.3)]",
        hasRisk && "border-amber-400/30",
      )}
    >
      <Handle type="source" position={Position.Bottom} className="!bg-[#4F7EFF]" />

      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-semibold text-white leading-tight truncate flex-1">
          {d.label}
        </span>
        <span
          className={cn(
            "shrink-0 text-[10px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-wide",
            d.status === "active"
              ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/20"
              : "bg-white/5 text-white/40 border-white/10",
          )}
        >
          {d.status}
        </span>
      </div>

      {/* Hypothesis */}
      <p className="text-[11px] text-white/50 line-clamp-2 mb-2">
        {d.hypothesis}
      </p>

      {/* Risk signal badge */}
      {d.riskSignal && severity && (
        <div
          className={cn(
            "text-[10px] px-2 py-1 rounded border font-mono",
            SEVERITY_BG[severity],
          )}
        >
          {d.riskSignal.risk_type.replace(/_/g, " ")} · {severity}
        </div>
      )}

      {/* Pipeline status */}
      {d.pipelineStatus && (
        <div className="mt-2 text-[10px] text-white/30 font-mono">
          {d.pipelineStatus.replace(/_/g, " ")}
        </div>
      )}
    </div>
  );
}

export const BetNode = memo(function BetNodeWrapper(props: NodeProps) {
  return (
    <NodeErrorBoundary nodeId={props.id}>
      <BetNodeInner {...props} />
    </NodeErrorBoundary>
  );
});
