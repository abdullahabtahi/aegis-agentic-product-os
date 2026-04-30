"use client";

/**
 * KillCriteriaTriggeredAlert — banner shown above the directions list when
 * one or more bets have a triggered kill criteria. Spec 007 FR-KC-04.
 *
 * Founder pre-declared a condition that has now expired without being met.
 * Drives them to the direction detail page to act on their own commitment.
 */

import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { type Bet } from "@/lib/types";

interface KillCriteriaTriggeredAlertProps {
  bets: Bet[];
}

export function KillCriteriaTriggeredAlert({ bets }: KillCriteriaTriggeredAlertProps) {
  const triggered = bets.filter(
    (b) => b.kill_criteria && b.kill_criteria.status === "triggered",
  );

  if (triggered.length === 0) return null;

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50/70 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle size={15} className="text-red-500 shrink-0" />
        <h3 className="text-sm font-semibold text-red-900">
          {triggered.length === 1
            ? "1 direction has hit its kill criteria"
            : `${triggered.length} directions have hit their kill criteria`}
        </h3>
      </div>
      <p className="text-xs text-red-800/80 leading-relaxed">
        You pre-committed to a decision when the deadline passed.
        Review each direction and follow through on your own commitment.
      </p>
      <ul className="space-y-1 pt-1">
        {triggered.map((bet) => (
          <li key={bet.id}>
            <Link
              href={`/workspace/directions/${bet.id}`}
              className="group flex items-center justify-between gap-2 rounded-lg border border-red-200/70 bg-white/70 px-3 py-2 hover:bg-white transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-800 truncate">
                  {bet.name}
                </p>
                {bet.kill_criteria?.condition && (
                  <p className="text-[11px] text-slate-500 italic truncate">
                    &ldquo;{bet.kill_criteria.condition}&rdquo;
                  </p>
                )}
              </div>
              <ChevronRight size={14} className="text-red-400 group-hover:text-red-600 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
