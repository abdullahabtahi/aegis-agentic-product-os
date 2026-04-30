"use client";

/**
 * KillCriteriaCard — surfaces the founder's pre-declared kill criteria on
 * the direction detail page. Spec 007 FR-KC-03.
 *
 * Glassmorphic panel; red accent when triggered, emerald when met,
 * indigo when monitoring, slate when waived.
 */

import { Target, AlertTriangle, CheckCircle2, MinusCircle } from "lucide-react";
import { type KillCriteria } from "@/lib/types";
import { KillCriteriaStatusBadge } from "./KillCriteriaStatusBadge";

const ACTION_LABELS: Record<KillCriteria["committed_action"], string> = {
  pivot: "Pivot — adjust strategy and continue",
  kill: "Kill — shut down this direction entirely",
  extend: "Extend — reassess with a new timeline",
};

interface KillCriteriaCardProps {
  killCriteria: KillCriteria;
}

export function KillCriteriaCard({ killCriteria }: KillCriteriaCardProps) {
  const { condition, deadline, committed_action, status, triggered_at, met_at, waived_at } = killCriteria;

  const accentClass =
    status === "triggered"
      ? "border-red-300 bg-red-50/40"
      : status === "met"
      ? "border-emerald-300 bg-emerald-50/40"
      : status === "waived"
      ? "border-slate-300 bg-slate-50/40"
      : "border-indigo-200 bg-indigo-50/30";

  const Icon =
    status === "triggered"
      ? AlertTriangle
      : status === "met"
      ? CheckCircle2
      : status === "waived"
      ? MinusCircle
      : Target;

  const iconColor =
    status === "triggered"
      ? "text-red-500"
      : status === "met"
      ? "text-emerald-500"
      : status === "waived"
      ? "text-slate-400"
      : "text-indigo-500";

  const decidedAt =
    status === "triggered" ? triggered_at : status === "met" ? met_at : status === "waived" ? waived_at : undefined;

  return (
    <div className={`glass-panel rounded-2xl p-5 space-y-3 border ${accentClass}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Icon size={14} className={iconColor} />
          Kill Criteria
        </h2>
        <KillCriteriaStatusBadge status={status} deadline={deadline} />
      </div>

      <p className="text-[12px] leading-relaxed text-slate-700 italic">
        &ldquo;{condition}&rdquo;
      </p>

      <div className="grid grid-cols-2 gap-3 pt-1">
        <div className="rounded-lg border border-slate-200/60 bg-white/50 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Deadline</p>
          <p className="text-xs font-mono font-semibold text-slate-700 mt-0.5">
            {new Date(deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200/60 bg-white/50 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">If unmet</p>
          <p className="text-xs font-semibold text-slate-700 mt-0.5">
            {ACTION_LABELS[committed_action]}
          </p>
        </div>
      </div>

      {decidedAt && (
        <p className="text-[10px] text-slate-400 pt-1">
          {status === "triggered" && "Triggered "}
          {status === "met" && "Marked met "}
          {status === "waived" && "Waived "}
          {new Date(decidedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
