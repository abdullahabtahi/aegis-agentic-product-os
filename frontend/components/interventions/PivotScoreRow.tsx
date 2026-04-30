"use client";

import { type PivotPScore } from "@/lib/types";

interface PivotScoreRowProps {
  score: PivotPScore;
}

export function PivotScoreRow({ score }: PivotScoreRowProps) {
  return (
    <div
      className={`flex items-start gap-3 py-2 px-3 rounded-lg text-xs ${
        score.is_weakest
          ? "bg-amber-500/10 border border-amber-500/20"
          : "bg-white/[0.03]"
      }`}
    >
      {/* Label */}
      <div className="w-24 shrink-0">
        <span
          className={`font-semibold ${
            score.is_weakest ? "text-amber-300" : "text-white/70"
          }`}
        >
          {score.label}
        </span>
        {score.is_weakest && (
          <span className="ml-1 text-[10px] text-amber-400/70">weakest</span>
        )}
      </div>

      {/* 5-dot confidence scale */}
      <div
        className="flex items-center gap-1 shrink-0"
        aria-label={`Confidence: ${score.confidence ?? "skipped"} out of 5`}
      >
        {[1, 2, 3, 4, 5].map((dot) => (
          <span
            key={dot}
            className={`text-[10px] ${
              score.confidence == null
                ? "text-white/15"
                : dot <= score.confidence
                  ? score.is_weakest
                    ? "text-amber-400"
                    : "text-indigo-400"
                  : "text-white/15"
            }`}
          >
            {dot <= (score.confidence ?? 0) ? "●" : "○"}
          </span>
        ))}
        {score.confidence == null && (
          <span className="text-[10px] text-white/25 ml-1">–</span>
        )}
      </div>

      {/* Founder note */}
      {score.founder_note && (
        <p className="text-white/40 italic truncate flex-1 min-w-0 leading-relaxed">
          &ldquo;{score.founder_note}&rdquo;
        </p>
      )}
    </div>
  );
}
