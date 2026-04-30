"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Activity, RefreshCw, AlertTriangle, CheckCircle2, XCircle, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useWorkspaceId } from "@/hooks/useWorkspaceId";
import { getInterventions } from "@/lib/api";
import { ACTION_LABELS } from "@/lib/constants";
import { timeAgo } from "@/lib/utils";
import type { Intervention } from "@/lib/types";
import { cn } from "@/lib/utils";

/* ─── Design tokens ─── */
const ESCALATION_ACCENT: Record<number, { border: string; bg: string; glow: string }> = {
  1: { border: "border-indigo-400/30", bg: "bg-indigo-500/5", glow: "shadow-indigo-500/10" },
  2: { border: "border-amber-400/35", bg: "bg-amber-500/6", glow: "shadow-amber-500/10" },
  3: { border: "border-orange-400/40", bg: "bg-orange-500/7", glow: "shadow-orange-500/10" },
  4: { border: "border-red-500/45", bg: "bg-red-500/8", glow: "shadow-red-500/10" },
};

const STATUS_DOT: Record<string, string> = {
  accepted: "bg-emerald-400",
  approved: "bg-emerald-400",
  complete: "bg-emerald-400",
  rejected: "bg-red-400",
  error: "bg-red-400",
  pending: "bg-amber-400",
  awaiting_approval: "bg-amber-400",
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  accepted:          { label: "Accepted",          color: "text-emerald-400" },
  approved:          { label: "Approved",          color: "text-emerald-400" },
  complete:          { label: "Complete",          color: "text-emerald-400" },
  rejected:          { label: "Rejected",          color: "text-red-400" },
  error:             { label: "Error",             color: "text-red-400" },
  pending:           { label: "Pending",           color: "text-amber-400" },
  awaiting_approval: { label: "Awaiting Approval", color: "text-amber-400" },
  dismissed:         { label: "Dismissed",         color: "text-slate-400" },
};

function StatusIcon({ status }: { status: string }) {
  if (["accepted", "approved", "complete"].includes(status))
    return <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />;
  if (["rejected", "error"].includes(status))
    return <XCircle size={14} className="text-red-400 shrink-0" />;
  return <Clock size={14} className="text-amber-400 shrink-0 animate-pulse" />;
}

/* ─── Group items by date ─── */
function groupByDate(items: Intervention[]): Array<{ date: string; entries: Intervention[] }> {
  const map = new Map<string, Intervention[]>();
  for (const item of items) {
    const d = new Date(item.created_at);
    const label =
      isToday(d) ? "Today" :
      isYesterday(d) ? "Yesterday" :
      d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    const bucket = map.get(label) ?? [];
    bucket.push(item);
    map.set(label, bucket);
  }
  return Array.from(map.entries()).map(([date, entries]) => ({ date, entries }));
}

function isToday(d: Date) {
  const t = new Date();
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
}

function isYesterday(d: Date) {
  const y = new Date(); y.setDate(y.getDate() - 1);
  return d.getDate() === y.getDate() && d.getMonth() === y.getMonth() && d.getFullYear() === y.getFullYear();
}

/* ─── Timeline card ─── */
function ActivityCard({ item, index, onClick }: { item: Intervention; index: number; onClick: () => void }) {
  const accent = ESCALATION_ACCENT[item.escalation_level ?? 1] ?? ESCALATION_ACCENT[1];
  const label = ACTION_LABELS[item.action_type as keyof typeof ACTION_LABELS] ?? item.action_type.replace(/_/g, " ");
  const statusInfo = STATUS_LABEL[item.status];

  return (
    <motion.button
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.035, duration: 0.3, ease: "easeOut" }}
      onClick={onClick}
      className={cn(
        "group relative w-full text-left rounded-2xl border px-5 py-4 shadow-sm transition-all duration-200",
        "hover:scale-[1.005] hover:shadow-md",
        accent.border, accent.bg, accent.glow,
        "backdrop-blur-sm",
      )}
    >
      {/* Top row: action label + status */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className={cn("h-2 w-2 rounded-full shrink-0 mt-0.5", STATUS_DOT[item.status] ?? "bg-slate-300")} />
          <span className="text-sm font-semibold text-foreground/85 leading-snug truncate">{label}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusIcon status={item.status} />
          {statusInfo && (
            <span className={cn("text-[11px] font-medium", statusInfo.color)}>{statusInfo.label}</span>
          )}
        </div>
      </div>

      {/* Direction name */}
      {item.bet_name && (
        <p className="text-xs text-foreground/40 mt-1.5 font-medium">
          ↳ {item.bet_name}
        </p>
      )}

      {/* Rationale */}
      {item.rationale && (
        <p className="text-[12px] text-foreground/55 mt-2 line-clamp-2 leading-relaxed">
          {item.rationale}
        </p>
      )}

      {/* Footer: escalation + time */}
      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-white/10">
        <span className="text-[10px] text-foreground/30 font-mono uppercase tracking-wider">
          L{item.escalation_level ?? 1} · Escalation
        </span>
        <span className="text-[10px] text-foreground/30 font-mono">
          {timeAgo(item.created_at)}
        </span>
      </div>
    </motion.button>
  );
}

/* ─── Page ─── */
export default function ActivityPage() {
  const router = useRouter();
  const workspaceId = useWorkspaceId();

  const { data = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["activity", workspaceId],
    queryFn: () => getInterventions(workspaceId),
    staleTime: 15_000,
    refetchInterval: 30_000,
    enabled: !!workspaceId,
  });

  const items = [...data]
    .filter((i) => i.action_type !== "no_intervention")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const groups = groupByDate(items);

  return (
    <div className="h-full flex flex-col">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 ring-1 ring-indigo-200/60">
            <Activity className="h-4 w-4 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground/85 leading-tight">Activity Log</h1>
            <p className="text-[11px] text-foreground/40 mt-0.5">
              {isLoading ? "Loading…" : `${items.length} total intervention${items.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          title="Refresh"
          className="flex h-8 w-8 items-center justify-center rounded-xl text-foreground/40 hover:bg-white/30 hover:text-foreground/70 transition-colors disabled:opacity-40"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
        </button>
      </div>

      {/* Divider */}
      <div className="mx-6 h-px bg-white/15 shrink-0" />

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <AnimatePresence mode="popLayout">
          {/* Error state */}
          {isError && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-3 py-20 text-center"
            >
              <AlertTriangle className="h-8 w-8 text-red-400" />
              <p className="text-sm font-medium text-foreground/60">Failed to load activity</p>
              <button
                onClick={() => refetch()}
                className="text-xs text-indigo-500 hover:text-indigo-600 underline transition-colors"
              >
                Retry
              </button>
            </motion.div>
          )}

          {/* Skeleton */}
          {isLoading && !isError && (
            <motion.div key="skeleton" className="flex flex-col gap-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-24 rounded-2xl bg-white/20 animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
              ))}
            </motion.div>
          )}

          {/* Empty state */}
          {!isLoading && !isError && items.length === 0 && (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-4 py-24 text-center"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-indigo-50 ring-2 ring-indigo-100">
                <Activity className="h-7 w-7 text-indigo-400" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground/60">No activity yet</p>
                <p className="text-sm text-foreground/35 mt-1 max-w-xs mx-auto leading-relaxed">
                  Interventions will appear here after Aegis scans your directions
                </p>
              </div>
            </motion.div>
          )}

          {/* Timeline grouped by date */}
          {!isLoading && !isError && groups.length > 0 && (
            <motion.div key="content" className="flex flex-col gap-6 pb-6">
              {groups.map((group) => (
                <div key={group.date}>
                  {/* Date separator */}
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-[11px] font-semibold text-foreground/35 uppercase tracking-widest whitespace-nowrap">
                      {group.date}
                    </span>
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-[10px] text-foreground/25 font-mono tabular-nums">
                      {group.entries.length} event{group.entries.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="flex flex-col gap-2.5">
                    {group.entries.map((item, index) => (
                      <ActivityCard
                        key={item.id}
                        item={item}
                        index={index}
                        onClick={() => item.bet_id && router.push(`/workspace/directions/${item.bet_id}`)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
