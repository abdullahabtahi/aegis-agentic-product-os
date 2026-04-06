"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "framer-motion";
import { NodeErrorBoundary } from "./NodeErrorBoundary";
import type { AgentNodeData } from "@/hooks/useMissionControlSync";
import { cn } from "@/lib/utils";

function AgentActivityNodeInner({ data, selected }: NodeProps) {
  const d = data as AgentNodeData;

  return (
    <div
      className={cn(
        "w-[150px] rounded-lg border p-3 text-xs transition-all",
        "bg-[#111118] border-white/8",
        selected && "border-[#4F7EFF]/60",
        d.active && "border-[#4F7EFF]/40 bg-[#4F7EFF]/5",
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-white/20" />
      <Handle type="source" position={Position.Right} className="!bg-white/20" />

      <div className="flex items-center gap-2">
        {/* Activity indicator */}
        {d.active ? (
          <motion.div
            className="w-2 h-2 rounded-full bg-[#4F7EFF] shrink-0"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          />
        ) : (
          <div className="w-2 h-2 rounded-full bg-white/15 shrink-0" />
        )}

        <span
          className={cn(
            "font-medium leading-tight",
            d.active ? "text-white" : "text-white/50",
          )}
        >
          {d.label}
        </span>
      </div>

      {d.checkpoint && (
        <div className="mt-1.5 text-[9px] font-mono text-white/25 truncate">
          {d.checkpoint.replace(/_/g, " ")}
        </div>
      )}
    </div>
  );
}

export const AgentActivityNode = memo(function AgentActivityNodeWrapper(
  props: NodeProps,
) {
  return (
    <NodeErrorBoundary nodeId={props.id}>
      <AgentActivityNodeInner {...props} />
    </NodeErrorBoundary>
  );
});
