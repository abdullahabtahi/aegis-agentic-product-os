"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BellOff, RefreshCw, Bell, ChevronDown, Clock } from "lucide-react";
import { useInterventionApproval } from "@/hooks/useInterventionApproval";
import { useInterventionInbox } from "@/hooks/useInterventionInbox";
import { ApprovalCard } from "./ApprovalCard";
import { SuppressionLog } from "./SuppressionLog";
import { ACTION_LABELS } from "@/lib/constants";
import { timeAgo } from "@/lib/utils";
import type { Intervention } from "@/lib/types";
import { cn } from "@/lib/utils";

interface InterventionInboxProps {
  workspaceId: string;
  className?: string;
}

function groupByBet(interventions: Intervention[]): Map<string, { betName: string; items: Intervention[] }> {
  const map = new Map<string, { betName: string; items: Intervention[] }>();
  for (const i of interventions) {
    const key = i.bet_id || "unknown";
    if (!map.has(key)) {
      map.set(key, { betName: i.bet_name ?? i.bet_id ?? "Unknown Direction", items: [] });
    }
    map.get(key)!.items.push(i);
  }
  return map;
}

const STATUS_CONFIG: Record<string, { dot: string; label: string; pill: string }> = {
  accepted:          { dot: "bg-emerald-400",  label: "Accepted",  pill: "bg-emerald-500/12 text-emerald-600 border-emerald-500/25" },
  approved:          { dot: "bg-emerald-400",  label: "Approved",  pill: "bg-emerald-500/12 text-emerald-600 border-emerald-500/25" },
  complete:          { dot: "bg-emerald-400",  label: "Complete",  pill: "bg-emerald-500/12 text-emerald-600 border-emerald-500/25" },
  rejected:          { dot: "bg-red-400",      label: "Rejected",  pill: "bg-red-500/10 text-red-500 border-red-400/25" },
  error:             { dot: "bg-red-400",      label: "Error",     pill: "bg-red-500/10 text-red-500 border-red-400/25" },
  pending:           { dot: "bg-amber-400",    label: "Pending",   pill: "bg-amber-500/12 text-amber-600 border-amber-400/25" },
  awaiting_approval: { dot: "bg-amber-400",    label: "Awaiting",  pill: "bg-amber-500/12 text-amber-600 border-amber-400/25" },
  dismissed:         { dot: "bg-slate-300",    label: "Dismissed", pill: "bg-slate-100 text-slate-500 border-slate-200" },
};

function HistoryRow({ item: i }: { item: Intervention }) {
  const cfg = STATUS_CONFIG[i.status] ?? { dot: "bg-slate-300", label: i.status, pill: "bg-slate-100 text-slate-500 border-slate-200" };
  const label = ACTION_LABELS[i.action_type as keyof typeof ACTION_LABELS] ?? i.action_type.replace(/_/g, " ");

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="group flex items-center gap-3 rounded-xl border border-slate-200/40 bg-white/40 px-3.5 py-2.5 hover:bg-white/70 transition-colors"
    >
      <span className={cn("h-2 w-2 rounded-full shrink-0", cfg.dot)} />

      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-slate-700 truncate">{label}</p>
        {i.bet_name && (
          <p className="text-[10px] text-slate-400 truncate mt-0.5">↳ {i.bet_name}</p>
        )}
      </div>

      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-semibold border", cfg.pill)}>
          {cfg.label}
        </span>
        <span className="text-[9px] text-slate-300 font-mono flex items-center gap-0.5">
          <Clock className="h-2 w-2" />{timeAgo(i.created_at)}
        </span>
      </div>
    </motion.div>
  );
}

export function InterventionInbox({ workspaceId, className }: InterventionInboxProps) {
  const { pending, resolved, loading, error, snooze, refresh } = useInterventionInbox(workspaceId);
  const { approve, reject } = useInterventionApproval(workspaceId);
  const [historyOpen, setHistoryOpen] = useState(true);

  const pendingByBet = groupByBet(pending);
  const resolvedList = resolved.filter(
    (i) => i.status === "accepted" || i.status === "rejected" || i.status === "dismissed",
  );

  const executingApproveId = approve.isPending ? approve.variables : null;
  const executingRejectId = reject.isPending ? reject.variables?.id : null;

  return (
    <div className={cn("flex flex-col h-full overflow-hidden", className)}>
      {/* Sub-header */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-200/40 shrink-0 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <Bell className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Inbox</span>
          {pending.length > 0 && (
            <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-amber-500/15 text-amber-600 text-[9px] font-bold border border-amber-400/25">
              {pending.length}
            </span>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          title="Refresh"
          className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition-colors disabled:opacity-40"
        >
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {/* Error */}
        {error && (
          <div className="mx-4 mt-4 rounded-xl border border-red-200/60 bg-red-50/60 px-4 py-3 text-xs text-red-500">
            {error}
          </div>
        )}

        {/* Pending section */}
        <div className="px-4 pt-4">
          {pending.length === 0 && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-3 py-12 text-center"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 ring-2 ring-emerald-100">
                <Bell className="h-5 w-5 text-emerald-400" />
              </div>
              <p className="text-sm font-semibold text-slate-500">No pending approvals</p>
              <p className="text-xs text-slate-400 leading-relaxed max-w-[200px]">
                Aegis is monitoring your directions and will flag decisions here
              </p>
            </motion.div>
          )}

          {loading && pending.length === 0 && (
            <div className="flex flex-col gap-3 pb-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-28 rounded-2xl bg-slate-100/60 animate-pulse" />
              ))}
            </div>
          )}

          {/* Grouped pending interventions */}
          <AnimatePresence mode="popLayout">
            {Array.from(pendingByBet.entries()).map(([betId, { betName, items }]) => (
              <motion.div
                key={betId}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mb-5"
              >
                {/* Bet group chip */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200/60 bg-indigo-50/80 px-2.5 py-1 text-[10px] font-semibold text-indigo-600 uppercase tracking-wide">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                    {betName}
                  </span>
                  <span className="text-[9px] font-mono text-slate-300 ml-auto">{items.length} pending</span>
                </div>

                <div className="space-y-2.5">
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
                          exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
                        >
                          <ApprovalCard
                            intervention={intervention}
                            onApprove={(id) => approve.mutate(id)}
                            onReject={(id, reason) => reject.mutate({ id, reason })}
                            isExecuting={isExecuting}
                          />
                          <button
                            onClick={() => snooze(intervention.id)}
                            className="mt-1.5 ml-1 flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            <BellOff className="h-3 w-3" />
                            Snooze 24h
                          </button>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Suppression log */}
        <div className="px-4">
          <SuppressionLog interventions={[...pending, ...resolved]} />
        </div>

        {/* History section */}
        {resolvedList.length > 0 && (
          <div className="px-4 pb-6">
            <button
              onClick={() => setHistoryOpen((v) => !v)}
              className="flex w-full items-center gap-2 py-3 group"
            >
              <div className="flex-1 h-px bg-slate-200/60" />
              <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-widest whitespace-nowrap group-hover:text-slate-600 transition-colors">
                History ({resolvedList.length})
                <ChevronDown className={cn("h-3 w-3 transition-transform", historyOpen && "rotate-180")} />
              </span>
              <div className="flex-1 h-px bg-slate-200/60" />
            </button>

            <AnimatePresence>
              {historyOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-2">
                    {resolvedList.map((i) => (
                      <HistoryRow key={i.id} item={i} />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
