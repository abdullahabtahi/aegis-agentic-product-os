"use client";

import { type PivotDiagnosis } from "@/lib/types";
import { PivotRecommendationBadge } from "./PivotRecommendationBadge";
import { PivotScoreRow } from "./PivotScoreRow";

interface PivotDiagnosisCardProps {
  diagnosis: PivotDiagnosis;
  className?: string;
}

export function PivotDiagnosisCard({
  diagnosis,
  className = "",
}: PivotDiagnosisCardProps) {
  return (
    <div
      className={`rounded-xl bg-white/5 border border-white/10 overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
        <div>
          <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wide">
            4Ps Pivot Diagnosis
          </p>
          <p className="text-[10px] text-white/30 mt-0.5">
            {new Date(diagnosis.conducted_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        <PivotRecommendationBadge recommendation={diagnosis.recommendation} />
      </div>

      {/* P scores */}
      <div className="p-3 space-y-1.5">
        {diagnosis.scores.map((score) => (
          <PivotScoreRow key={score.p} score={score} />
        ))}
      </div>

      {/* Rationale footer */}
      <div className="px-4 py-3 border-t border-white/[0.08] bg-white/[0.02]">
        <p className="text-xs text-white/50 leading-relaxed">
          {diagnosis.recommendation_rationale}
        </p>
      </div>
    </div>
  );
}
