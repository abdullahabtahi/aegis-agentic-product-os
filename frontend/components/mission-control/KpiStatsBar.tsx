"use client";

import Link from "next/link";
import type { Bet, Intervention } from "@/lib/types";

interface KpiStatsBarProps {
  bets: Bet[];
  interventions: Intervention[];
  lastScan: string | null;
  loading: boolean;
  timeAgo: (iso: string) => string;
}

function SkeletonKpi() {
  return (
    <div className="flex flex-col gap-1">
      <div className="animate-pulse bg-slate-100 rounded h-6 w-12" />
      <div className="animate-pulse bg-slate-100 rounded h-3 w-20" />
    </div>
  );
}

export function KpiStatsBar({ bets, interventions, lastScan, loading, timeAgo }: KpiStatsBarProps) {
  const totalDirections = bets.length;
  const resolved = interventions.filter((i) => i.status !== "pending");
  const accepted = resolved.filter((i) => i.status === "accepted").length;
  const rejected = resolved.filter((i) => i.status === "rejected").length;
  const approvalRate = accepted + rejected >= 2
    ? Math.round((accepted / (accepted + rejected)) * 100)
    : null;

  return (
    <div className="glass-panel rounded-2xl px-6 py-4 grid grid-cols-4 gap-4 divide-x divide-white/40">
      {/* Total Directions */}
      <Link href="/workspace/directions" className="flex flex-col gap-0.5 group cursor-pointer pr-4">
        {loading ? <SkeletonKpi /> : (
          <>
            <span className="text-lg font-semibold text-[#1a1c1d] group-hover:text-indigo-700 transition-colors">
              {totalDirections}
            </span>
            <span className="text-xs text-muted-foreground">Total Directions</span>
          </>
        )}
      </Link>

      {/* Interventions Resolved */}
      <Link href="/workspace/inbox" className="flex flex-col gap-0.5 group cursor-pointer px-4">
        {loading ? <SkeletonKpi /> : (
          <>
            <span className="text-lg font-semibold text-[#1a1c1d] group-hover:text-indigo-700 transition-colors">
              {resolved.length}
            </span>
            <span className="text-xs text-muted-foreground">Interventions Resolved</span>
          </>
        )}
      </Link>

      {/* Approval Rate */}
      <div className="flex flex-col gap-0.5 px-4">
        {loading ? <SkeletonKpi /> : (
          <>
            <span className="text-lg font-semibold text-[#1a1c1d]">
              {approvalRate !== null ? `${approvalRate}%` : "—"}
            </span>
            <span className="text-xs text-muted-foreground">Approval Rate</span>
          </>
        )}
      </div>

      {/* Last Scan */}
      <div className="flex flex-col gap-0.5 pl-4">
        {loading ? <SkeletonKpi /> : (
          <>
            <span className="text-lg font-semibold text-[#1a1c1d]">
              {lastScan ? timeAgo(lastScan) : "Never"}
            </span>
            <span className="text-xs text-muted-foreground">Last Scan</span>
          </>
        )}
      </div>
    </div>
  );
}
