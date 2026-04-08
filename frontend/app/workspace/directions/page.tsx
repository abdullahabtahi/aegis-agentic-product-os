"use client";

/**
 * Directions — list of all strategic bets being monitored by Aegis.
 *
 * Shows: health score, status, risk count, time horizon, pending interventions.
 * Each card links to /workspace/directions/[id] for the full detail view.
 */

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Target, AlertTriangle, CheckCircle2, Clock,
  ChevronRight, Zap, Plus, RefreshCw,
} from "lucide-react";
import { listBets } from "@/lib/api";
import {
  BET_STATUS_LABELS, BET_STATUS_STYLES, healthColor,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Bet, BetStatus, RiskType } from "@/lib/types";
import { BetDeclarationModal } from "@/components/bets/BetDeclarationModal";

const WORKSPACE_ID = "default_workspace";

const RISK_ACCENT: Record<RiskType, string> = {
  strategy_unclear: "border-l-red-400",
  alignment_issue: "border-l-amber-400",
  execution_issue: "border-l-orange-400",
  placebo_productivity: "border-l-violet-400",
};

function HealthBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      {/* Track — visible on light bg */}
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200/80">
        <div
          className={cn("h-full rounded-full transition-all duration-500", healthColor(score))}
          style={{ width: `${score}%` }}
        />
      </div>
      {/* Score — min 12px, contrasting on light bg */}
      <span className="w-8 text-right font-mono text-xs text-slate-400">{score}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: BetStatus }) {
  return (
    <span className={cn(
      "rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
      BET_STATUS_STYLES[status],
    )}>
      {BET_STATUS_LABELS[status]}
    </span>
  );
}

function BetCard({ bet }: { bet: Bet }) {
  // Derive a visual health score from available fields
  // In live data this will come from BetSnapshot; fallback to declaration_confidence
  const healthScore = Math.round((bet.declaration_confidence ?? 0.8) * 100);

  return (
    <Link href={`/workspace/directions/${bet.id}`}>
      <div className={cn(
        "group glass-panel rounded-2xl border-l-4 p-5 transition-all duration-200",
        "hover:bg-white/60 hover:shadow-lg hover:shadow-indigo-500/10 cursor-pointer",
        "border-l-indigo-500/50",
      )}>
        {/* Header row */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Primary text — high contrast */}
            <h3 className="font-heading text-sm font-semibold text-slate-900 truncate group-hover:text-slate-700 transition-colors">
              {bet.name}
            </h3>
            {bet.target_segment && (
              <p className="mt-0.5 text-xs text-slate-500">{bet.target_segment}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={bet.status} />
            <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
          </div>
        </div>

        {/* Problem statement */}
        {bet.problem_statement && (
          <p className="mb-3 text-xs leading-relaxed text-slate-500 line-clamp-2">
            {bet.problem_statement}
          </p>
        )}

        {/* Health bar */}
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Health</span>
          </div>
          <HealthBar score={healthScore} />
        </div>

        {/* Footer metadata — min 12px, contrasting colours */}
        <div className="flex items-center gap-4 text-xs text-slate-400">
          {bet.time_horizon && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {bet.time_horizon}
            </span>
          )}
          {bet.hypothesis ? (
            <span className="flex items-center gap-1 text-emerald-700">
              <CheckCircle2 className="h-3 w-3" />
              Hypothesis set
            </span>
          ) : (
            <span className="flex items-center gap-1 text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              No hypothesis
            </span>
          )}
          {bet.success_metrics && bet.success_metrics.length > 0 && (
            <span className="flex items-center gap-1 text-sky-700">
              <Target className="h-3 w-3" />
              {bet.success_metrics.length} metric{bet.success_metrics.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function EmptyState({ onDeclare }: { onDeclare: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 ring-1 ring-indigo-500/20">
        <Zap size={28} className="text-indigo-600" />
      </div>
      <h2 className="font-heading text-lg font-semibold text-slate-800">No strategic directions yet</h2>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
        Declare your first direction and Aegis will run a continuous pre-mortem — scanning for strategy drift, misalignment, and execution blockers.
      </p>
      <button
        onClick={onDeclare}
        className="mt-6 flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-500 hover:shadow-indigo-500/30 active:scale-95"
      >
        <Plus size={16} />
        Declare a direction
      </button>
    </div>
  );
}

// ─── Status filter tabs ───────────────────────────────────────────────────────

const FILTER_TABS: { label: string; value: BetStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Detecting", value: "detecting" },
  { label: "Paused", value: "paused" },
  { label: "Validated", value: "validated" },
  { label: "Killed", value: "killed" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DirectionsPage() {
  const [filter, setFilter] = useState<BetStatus | "all">("all");
  const [showDeclareModal, setShowDeclareModal] = useState(false);

  const { data: bets = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["bets", WORKSPACE_ID, filter],
    queryFn: () => listBets(WORKSPACE_ID, filter === "all" ? undefined : filter),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const visibleBets = bets;

  return (
    <div className="flex flex-col gap-5 pb-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          {/* High-contrast heading for light glassmorphic bg */}
          <h1 className="font-heading text-xl font-bold text-slate-900">Strategic Directions</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {isLoading ? "Loading…" : `${bets.length} direction${bets.length !== 1 ? "s" : ""} being monitored`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Refresh — min 44×44px touch target */}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white/60 text-slate-400 transition-all hover:bg-white/80 hover:text-slate-600",
              isFetching && "animate-spin",
            )}
            aria-label="Refresh directions"
          >
            <RefreshCw size={15} />
          </button>
          <button
            onClick={() => setShowDeclareModal(true)}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 transition-all hover:bg-indigo-500 active:scale-95"
          >
            <Plus size={15} />
            New direction
          </button>
        </div>
      </div>

      {/* Filter tabs — only shown when there is data to filter */}
      {!isLoading && bets.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          {FILTER_TABS.map((tab) => {
            const count = tab.value === "all" ? bets.length : bets.filter((b) => b.status === tab.value).length;
            return (
              <button
                key={tab.value}
                onClick={() => setFilter(tab.value)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-medium transition-all",
                  filter === tab.value
                    ? "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-700",
                )}
              >
                {tab.label}
                {count > 0 && (
                  <span className={cn(
                    "rounded-full px-1.5 py-0 text-[10px] font-bold leading-4",
                    filter === tab.value ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-500",
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="glass-panel h-36 animate-pulse rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <AlertTriangle size={24} className="text-red-500" />
          <p className="text-sm text-slate-600">Could not load directions — is the backend running?</p>
          <button onClick={() => refetch()} className="mt-2 text-xs text-indigo-600 hover:text-indigo-500 underline">
            Retry
          </button>
        </div>
      ) : visibleBets.length === 0 ? (
        <EmptyState onDeclare={() => setShowDeclareModal(true)} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {visibleBets.map((bet) => (
            <BetCard key={bet.id} bet={bet} />
          ))}
        </div>
      )}

      {/* Declare modal */}
      <BetDeclarationModal
        open={showDeclareModal}
        workspaceId={WORKSPACE_ID}
        onClose={() => setShowDeclareModal(false)}
        onBetDeclared={() => {
          setShowDeclareModal(false);
          refetch();
        }}
      />
    </div>
  );
}
