"use client";

import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";

export const RiskEdge = memo(function RiskEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  animated,
  label,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: animated ? "#4F7EFF" : "rgba(255,255,255,0.12)",
          strokeWidth: animated ? 1.5 : 1,
          strokeDasharray: animated ? "4 3" : undefined,
        }}
        markerEnd="url(#arrow)"
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
            className="text-[9px] font-mono text-white/30 bg-[#0A0A0F] px-1 rounded"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
