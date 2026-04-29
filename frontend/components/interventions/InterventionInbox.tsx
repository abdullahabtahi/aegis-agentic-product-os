"use client";

/**
 * InterventionInbox — grouped by bet for high information density.
 *
 * Layout (per Jules review):
 *   BET: MOBILE ONBOARDING REDESIGN
 *     → [ApprovalCard] Align Team · High
 *   BET: STRIPE INTEGRATION
 *     → [ApprovalCard] Add Metric · Medium
 *
 * This lets founders triage by the bet they care about most, rather
 * than scrolling a flat chronological stream.
 */

import { AnimatePresence, motion } from "framer-motion";
import { Bell, BellOff, RefreshCw } from "lucide-react";
import { useInterventionApproval } from "@/hooks/useInterventionApproval";
import { useInterventionInbox } from "@/hooks/useInterventionInbox";
import { ApprovalCard } from "./ApprovalCard";
import { SuppressionLog } from "./SuppressionLog";
import { ACTION_LABELS } from "@/lib/constants";
import type { Intervention } from "@/lib/types";
import { cn } from "@/lib/utils";

interface InterventionInboxProps {
  workspaceId: string;
  className?: string;
}

/** Group an array of interventions by bet_id, preserving insertion order of bets. */
function groupByBet(interventions: Intervention[]): Map<string, { betName: string; items: Intervention[] }> {
  const map = new Map<string, { betName: string; items: Intervention[] }>();
  for (const i of interventions) {
    const key = i.bet_id || "unknown";
    if (!map.has(key)) {
      map.set(key, { betName: i.bet_name ?? i.bet_id ?? "Unknown Bet", items: [] });
    }
    map.get(key)!.items.push(i);
  }
  return map;
}

export function InterventionInbox({ workspaceId, className }: InterventionInboxProps) {
  const { pending, resolved, loading, error, snooze, refresh } =
    useInterventionInbox(workspaceId);
  const { approve, reject } = useInterventionApproval(workspaceId);

  const pendingByBet = groupByBet(pending);
  const resolvedList = resolved.filter(
    (i) => i.status === "accepted" || i.status === "rejected",
  );

  // Track which mutation is currently in-flight for per-card loading state
  const executingApproveId = approve.isPending ? approve.variables : null;
  const executingRejectId = reject.isPending ? reject.variables?.id : null;

  return (
    <div className={cn("flex flex-col h-full overflow-hidden bg-[#0A0A0F]", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-2">
          <Bell className="w-3.5 h-3.5 text-white/40" />
          <span className="text-xs font-medium text-white/70">Inbox</span>
          {pending.length > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-[#4F7EFF]/20 text-[#4F7EFF]">
              {pending.length}
            </span>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="text-white/25 hover:text-white/50 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        {error && (
          <p className="text-xs text-red-400/70 text-center py-4">{error}</p>
        )}

        {pending.length === 0 && !loading && (
          <div className="text-center py-10 text-[11px] text-white/20 space-y-2">
            <p>No pending approvals</p>
            <p className="text-[10px] text-white/15">Aegis is monitoring your directions</p>
          </div>
        )}

        {/* Grouped pending interventions */}
        {Array.from(pendingByBet.entries()).map(([betId, { betName, items }]) => (
          <div key={betId}>
            {/* Bet group header */}
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="text-[9px] font-mono tracking-widest text-white/25 uppercase">
                bet
              </span>
              <span className="text-[11px] font-semibold text-white/60 uppercase tracking-wide truncate">
                {betName}
              </span>
              <span className="ml-auto text-[9px] font-mono text-white/20">
                {items.length}
              </span>
            </div>

            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {items.map((intervention) => {
                  const isExecuting =
                    executingApproveId === intervention.id ||
                    executingRejectId === intervention.id;
                  return (
                    <motion.div
                      key={intervention.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                    >
                      <ApprovalCard
                        intervention={intervention}
                        onApprove={(id) => approve.mutate(id)}
                        onReject={(id, reason) => reject.mutate({ id, reason })}
                        isExecuting={isExecuting}
                      />
                      <button
                        onClick={() => snooze(intervention.id)}
                        className="mt-1 ml-1 flex items-center gap-1 text-[10px] text-white/20 hover:text-white/40 transition-colors"
                      >
                        <BellOff className="w-3 h-3" />
                        Snooze 24h
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        ))}

        {/* Auto-suppression log — inline, compact */}
        <SuppressionLog interventions={[...pending, ...resolved]} />

        {/* Resolved history */}
        {resolvedList.length > 0 && (
          <div>
            <div className="text-[9px] font-mono text-white/20 uppercase tracking-widest mb-2 px-1">
              History ({resolvedList.length})
            </div>
            <div className="space-y-0.5">
              {resolvedList.map((i) => (
                <ResolvedRow key={i.id} intervention={i} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ResolvedRow({ intervention: i }: { intervention: Intervention }) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded text-[11px] hover:bg-white/3 transition-colors">
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full shrink-0",
          i.status === "accepted" ? "bg-emerald-400" : "bg-white/20",
        )}
      />
      <span className="text-white/40 flex-1 truncate">
        {ACTION_LABELS[i.action_type]}
      </span>
      {i.bet_name && (
        <span className="text-[9px] text-white/20 truncate max-w-[80px]">
          {i.bet_name}
        </span>
      )}
      <span className="text-[9px] text-white/15 font-mono shrink-0">
        {i.status}
      </span>
    </div>
  );
}
