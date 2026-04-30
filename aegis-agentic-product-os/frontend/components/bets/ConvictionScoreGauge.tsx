"use client";

import { type ConvictionScore } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ConvictionScoreGaugeProps {
  score: ConvictionScore;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const LEVEL_COLORS = {
  strong: "text-emerald-500 stroke-emerald-500",
  developing: "text-amber-500 stroke-amber-500",
  nascent: "text-slate-400 stroke-slate-400",
  critical: "text-red-500 stroke-red-500",
};

const SIZES = {
  sm: { ring: 16, stroke: 2, text: "text-[10px]" },
  md: { ring: 20, stroke: 3, text: "text-sm" },
  lg: { ring: 28, stroke: 4, text: "text-xl" },
};

export function ConvictionScoreGauge({
  score,
  size = "md",
  className = "",
}: ConvictionScoreGaugeProps) {
  const { ring, stroke, text } = SIZES[size];
  const colorClass = LEVEL_COLORS[score.level] || LEVEL_COLORS.nascent;
  
  const r = ring;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score.total / 100) * circumference;

  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      <svg
        className="-rotate-90"
        width={(ring + stroke) * 2}
        height={(ring + stroke) * 2}
        viewBox={`0 0 ${(ring + stroke) * 2} ${(ring + stroke) * 2}`}
      >
        {/* Background circle */}
        <circle
          cx={ring + stroke}
          cy={ring + stroke}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-white/10"
        />
        {/* Progress circle */}
        <circle
          cx={ring + stroke}
          cy={ring + stroke}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className={cn(colorClass, "transition-all duration-500")}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span
        className={cn(
          "absolute font-mono font-bold text-white/90",
          text
        )}
      >
        {Math.round(score.total)}
      </span>
    </div>
  );
}
