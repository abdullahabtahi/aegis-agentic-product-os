"use client";

/**
 * InterventionInbox — the right-panel surface for pending + resolved interventions.
 *
 * - Pending: ApprovalCards with optimistic UI
 * - Resolved: compact history list
 * - Auto-suppressed: SuppressionLog
 * - Snooze: localStorage-backed, 24h duration
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

export function InterventionInbox({
  workspaceId,
  className,
}: InterventionInboxProps) {
  const { pending, resolved, loading, error, snooze, refresh } =
    useInterventionInbox(workspaceId);
  const { approve, reject } = useInterventionApproval(workspaceId);

  const allResolved = resolved.filter(
    (i) => i.status === "accepted" || i.status === "rejected",
  );

  return (
    <div
      className={cn(
        "flex flex-col h-full overflow-hidden bg-[#0A0A0F]",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-2">
          <Bell className="w-3.5 h-3.5 text-white/40" />
          <span className="text-xs font-medium text-white/70">
            Intervention Inbox
          </span>
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
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {error && (
          <div className="text-xs text-red-400/70 text-center py-4">{error}</div>
        )}

        {/* Pending interventions */}
        {pending.length === 0 && !loading && (
          <div className="text-center py-8 text-[11px] text-white/20">
            No pending interventions
          </div>
        )}

        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {pending.map((intervention) => (
              <motion.div
                key={intervention.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
              >
                <ApprovalCard
                  intervention={intervention}
                  onApprove={(id) => approve.mutate(id)}
                  onReject={(id, reason) => reject.mutate({ id, reason })}
                  isPending={
                    approve.isPending || reject.isPending
                  }
                />
                {/* Snooze link */}
                <button
                  onClick={() => snooze(intervention.id)}
                  className="mt-1.5 ml-1 flex items-center gap-1 text-[10px] text-white/20 hover:text-white/40 transition-colors"
                >
                  <BellOff className="w-3 h-3" />
                  Snooze 24h
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Suppression log */}
        <SuppressionLog interventions={[...pending, ...resolved]} />

        {/* Resolved history */}
        {allResolved.length > 0 && (
          <div>
            <div className="text-[10px] font-mono text-white/25 uppercase tracking-wider mb-2">
              History ({allResolved.length})
            </div>
            <div className="space-y-1">
              {allResolved.map((i) => (
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
      <span className="text-white/50 flex-1 truncate">
        {ACTION_LABELS[i.action_type]}
      </span>
      <span className="text-[9px] text-white/20 font-mono shrink-0">
        {i.status}
      </span>
    </div>
  );
}
