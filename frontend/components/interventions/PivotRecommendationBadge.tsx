"use client";

import { type PivotRecommendation } from "@/lib/types";

const REC_CONFIG: Record<
  PivotRecommendation,
  { label: string; bgClass: string; textClass: string; icon: string }
> = {
  stay_course: {
    label: "Stay Course",
    bgClass: "bg-emerald-500/15",
    textClass: "text-emerald-400",
    icon: "→",
  },
  small_pivot: {
    label: "Small Pivot",
    bgClass: "bg-indigo-500/15",
    textClass: "text-indigo-400",
    icon: "↗",
  },
  large_pivot: {
    label: "Large Pivot",
    bgClass: "bg-amber-500/15",
    textClass: "text-amber-400",
    icon: "↺",
  },
  kill: {
    label: "Kill Bet",
    bgClass: "bg-red-500/15",
    textClass: "text-red-400",
    icon: "✕",
  },
};

interface PivotRecommendationBadgeProps {
  recommendation: PivotRecommendation;
  className?: string;
}

export function PivotRecommendationBadge({
  recommendation,
  className = "",
}: PivotRecommendationBadgeProps) {
  const config = REC_CONFIG[recommendation];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${config.bgClass} ${config.textClass} ${className}`}
    >
      <span aria-hidden="true">{config.icon}</span>
      {config.label}
    </span>
  );
}
