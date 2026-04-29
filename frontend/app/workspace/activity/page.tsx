"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Activity, RefreshCw, AlertTriangle } from "lucide-react";
import { useWorkspaceId } from "@/hooks/useWorkspaceId";
import { getInterventions } from "@/lib/api";
import { StatusBadge } from "@/components/interventions/StatusBadge";
import { ACTION_LABELS } from "@/lib/constants";
import type { Intervention } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function ActivityPage() {
  const router = useRouter();
  const workspaceId = useWorkspaceId();

  const { data = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["activity", workspaceId],
    queryFn: () => getInterventions(workspaceId),
    staleTime: 15_000,
    refetchInterval: 30_000,
    enabled: workspaceId !== "default_workspace",
  });

  // Filter no_intervention records — internal only, not founder-facing
  const items = [...data]
    .filter((i) => i.action_type !== "no_intervention")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-white/30" />
          <span className="text-xs font-semibold text-white/60 tracking-wide uppercase">
            Activity Log
          </span>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-white/25 hover:text-white/50 transition-colors"
          aria-label="Refresh"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isError && (
          <div className="flex items-center gap-2 text-red-400/70 text-xs py-8 justify-center">
            <AlertTriangle className="w-4 h-4" />
            <span>Failed to load activity.</span>
            <button onClick={() => refetch()} className="underline hover:no-underline">Retry</button>
          </div>
        )}

        {!isError && !isLoading && items.length === 0 && (
          <div className="text-center py-16 space-y-2">
            <Activity className="w-8 h-8 text-white/10 mx-auto" />
            <p className="text-[11px] text-white/20">No activity yet</p>
            <p className="text-[10px] text-white/12">Interventions will appear here as Aegis monitors your bets</p>
          </div>
        )}

        {items.length > 0 && (
          <div className="space-y-1">
            {items.map((i) => (
              <ActivityRow
                key={i.id}
                item={i}
                onClick={() => i.bet_id && router.push(`/workspace/directions/${i.bet_id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityRow({ item: i, onClick }: { item: Intervention; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 py-2.5 px-3 rounded-lg border border-white/5 bg-white/2 hover:bg-white/4 transition-colors text-left"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-medium text-white/70">
            {ACTION_LABELS[i.action_type] ?? i.action_type.replace(/_/g, " ")}
          </span>
          {i.bet_name && (
            <span className="text-[10px] text-white/25 truncate">{i.bet_name}</span>
          )}
          <StatusBadge status={i.status} />
        </div>
        {i.rationale && (
          <p className="text-[10px] text-white/30 mt-0.5 line-clamp-1">{i.rationale}</p>
        )}
      </div>
      <span className="text-[9px] text-white/15 font-mono shrink-0 mt-0.5">
        {new Date(i.created_at).toLocaleDateString()}
      </span>
    </button>
  );
}
