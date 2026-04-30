"use client";

import { type ConvictionScore } from "@/lib/types";
import { ConvictionLabel } from "./ConvictionLabel";

interface ConvictionScoreGaugeProps {
  score: ConvictionScore;
  className?: string;
}

const LEVEL_STROKE: Record<string, string> = {
  strong:     "#10b981",
  developing: "#6366f1",
  nascent:    "#f59e0b",
  critical:   "#ef4444",
};

export function ConvictionScoreGauge({ score, className = "" }: ConvictionScoreGaugeProps) {
  // SVG semicircle arc: r=40, center=(50,50), starts at left (π), ends at right (0)
  const r = 40;
  const cx = 50;
  const cy = 50;
  const circumference = Math.PI * r; // half-circle
  const clampedTotal = Math.max(0, Math.min(100, score.total));
  const progress = (clampedTotal / 100) * circumference;
  const strokeColor = LEVEL_STROKE[score.level] ?? "#6366f1";

  return (
    <div className={`flex flex-col items-center gap-4 ${className}`}>
      {/* Gauge */}
      <div className="relative w-28 h-16">
        <svg viewBox="0 0 100 60" className="w-full h-full overflow-visible">
          {/* Background track */}
          <path
            d={`M ${cx - r},${cy} A ${r},${r} 0 0,1 ${cx + r},${cy}`}
            fill="none"
            stroke="rgba(0,0,0,0.08)"
            strokeWidth="8"
            strokeLinecap="round"
          />
          {/* Progress arc */}
          <path
            d={`M ${cx - r},${cy} A ${r},${r} 0 0,1 ${cx + r},${cy}`}
            fill="none"
            stroke={strokeColor}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${progress} ${circumference}`}
            style={{ transition: "stroke-dasharray 0.5s ease" }}
          />
        </svg>
        {/* Score label centred inside */}
        <div className="absolute inset-0 flex items-end justify-center pb-0.5">
          <span className="text-xl font-bold text-slate-800">{Math.round(clampedTotal)}</span>
        </div>
      </div>

      <ConvictionLabel score={score} />

      {/* Dimension breakdown */}
      <ul className="w-full space-y-1">
        {score.dimensions.map((dim) => (
          <li key={dim.key} className="flex items-center justify-between text-xs">
            <span
              className={`flex items-center gap-1.5 ${
                dim.met ? "text-slate-700" : "text-slate-400"
              }`}
            >
              <span className="text-[10px]">{dim.met ? "✓" : "○"}</span>
              {dim.name}
            </span>
            <span
              className={`tabular-nums ${
                dim.met ? "text-slate-600" : "text-slate-400"
              }`}
            >
              {dim.points_earned}/{dim.points_max}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
