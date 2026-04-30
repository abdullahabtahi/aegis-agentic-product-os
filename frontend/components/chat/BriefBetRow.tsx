"use client";

import { type BriefBetSummary } from "@/lib/types";

const LEVEL_COLORS: Record<string, string> = {
  strong: "text-emerald-400",
  developing: "text-indigo-400",
  nascent: "text-amber-400",
  critical: "text-red-400",
};

interface BriefBetRowProps {
  summary: BriefBetSummary;
}

export function BriefBetRow({ summary }: BriefBetRowProps) {
  const levelColor = LEVEL_COLORS[summary.conviction_level] ?? "text-white/60";
  const delta = summary.conviction_delta;
  const deltaText =
    delta == null ? null : delta > 0 ? `+${delta}` : `${delta}`;
  const deltaColor =
    delta == null ? "" : delta > 0 ? "text-emerald-400" : "text-red-400";

  return (
    <div className="flex items-center justify-between py-1.5 text-xs">
      <span className="text-white/70 truncate flex-1 min-w-0 mr-2">
        {summary.bet_name}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`font-semibold ${levelColor}`}>
          {summary.conviction_level.charAt(0).toUpperCase() +
            summary.conviction_level.slice(1)}{" "}
          {Math.round(summary.conviction_total)}
        </span>
        {deltaText && (
          <span className={`tabular-nums ${deltaColor}`}>{deltaText}</span>
        )}
        {summary.kill_criteria_status === "triggered" && (
          <span className="rounded-full bg-red-500/20 text-red-400 px-1.5 py-0.5 text-[10px] font-medium">
            Kill criteria hit
          </span>
        )}
      </div>
    </div>
  );
}
