"use client";

/**
 * ActivityDrawer — Slide-in feed of all Aegis interventions.
 * Opened via the clock/activity icon in HeaderBar.
 * Design: same glassmorphic language as InboxDrawer.
 */

import { useEffect, useRef } from "react";
import { AnimatePresence, motion, type Transition } from "framer-motion";
import { X, Activity, ArrowRight, CheckCircle2, XCircle, Clock } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getInterventions } from "@/lib/api";
import { ACTION_LABELS } from "@/lib/constants";
import { timeAgo } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Intervention } from "@/lib/types";

interface ActivityDrawerProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
}

const SPRING: Transition = { type: "spring", stiffness: 380, damping: 35, mass: 0.8 };

const STATUS_DOT: Record<string, string> = {
  accepted: "bg-emerald-400",
  approved: "bg-emerald-400",
  complete: "bg-emerald-400",
  rejected: "bg-red-400",
  error: "bg-red-400",
  pending: "bg-amber-400 animate-pulse",
  awaiting_approval: "bg-amber-400 animate-pulse",
};

const ESCALATION_ACCENT: Record<number, string> = {
  1: "border-indigo-400/40 bg-indigo-500/5",
  2: "border-amber-400/40 bg-amber-500/5",
  3: "border-orange-400/40 bg-orange-500/5",
  4: "border-red-500/40 bg-red-500/5",
};

function StatusIcon({ status }: { status: string }) {
  if (status === "accepted" || status === "approved" || status === "complete") {
    return <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />;
  }
  if (status === "rejected" || status === "error") {
    return <XCircle size={13} className="text-red-400 shrink-0" />;
  }
  return <Clock size={13} className="text-amber-400 shrink-0" />;
}

function ActivityItem({ item, index }: { item: Intervention; index: number }) {
  const label = ACTION_LABELS[item.action_type as keyof typeof ACTION_LABELS] ?? item.action_type.replace(/_/g, " ");
  const accent = ESCALATION_ACCENT[item.escalation_level ?? 1] ?? ESCALATION_ACCENT[1];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
      className={cn(
        "relative flex gap-3 rounded-xl border p-3.5 transition-colors",
        accent,
      )}
    >
      {/* Status dot on left edge */}
      <div className="flex flex-col items-center pt-0.5 gap-1">
        <span className={cn("h-2 w-2 rounded-full shrink-0", STATUS_DOT[item.status] ?? "bg-slate-300")} />
        {/* Connector line — hidden on last item via CSS in parent */}
        <div className="w-px flex-1 bg-white/10 min-h-[8px]" />
      </div>

      <div className="flex-1 min-w-0">
        {/* Row 1: action + status icon */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[12px] font-semibold text-foreground/85 leading-tight">{label}</span>
          <StatusIcon status={item.status} />
        </div>

        {/* Row 2: direction name */}
        {item.bet_name && (
          <p className="text-[10px] text-foreground/45 mt-0.5 truncate">
            ↳ {item.bet_name}
          </p>
        )}

        {/* Row 3: rationale */}
        {item.rationale && (
          <p className="text-[11px] text-foreground/55 mt-1 line-clamp-2 leading-relaxed">
            {item.rationale}
          </p>
        )}
      </div>

      {/* Timestamp */}
      <span className="text-[9px] text-foreground/30 font-mono shrink-0 mt-0.5">
        {timeAgo(item.created_at)}
      </span>
    </motion.div>
  );
}

export function ActivityDrawer({ open, onClose, workspaceId }: ActivityDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const { data = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["activity-drawer", workspaceId],
    queryFn: () => getInterventions(workspaceId),
    staleTime: 15_000,
    refetchInterval: open ? 20_000 : false,
    enabled: !!workspaceId && open,
  });

  const items = [...data]
    .filter((i) => i.action_type !== "no_intervention")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 40);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) setTimeout(() => closeButtonRef.current?.focus(), 80);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="activity-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-slate-900/10 backdrop-blur-[2px]"
            aria-hidden="true"
            onClick={onClose}
          />

          <motion.aside
            key="activity-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Activity Log"
            initial={{ x: "100%", opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={SPRING}
            className="fixed right-4 top-4 bottom-4 z-50 flex w-[420px] flex-col overflow-hidden rounded-2xl border border-white/20 bg-white/80 shadow-2xl shadow-slate-900/15 backdrop-blur-2xl"
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-white/20 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 ring-1 ring-indigo-200/60">
                  <Activity className="h-3.5 w-3.5 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">Activity</h2>
                  <p className="text-[10px] text-slate-400 leading-none mt-0.5">
                    {isLoading ? "Loading…" : `${items.length} interventions`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => refetch()}
                  disabled={isFetching}
                  title="Refresh"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-40"
                >
                  <motion.svg
                    animate={{ rotate: isFetching ? 360 : 0 }}
                    transition={{ duration: 0.8, repeat: isFetching ? Infinity : 0, ease: "linear" }}
                    viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-3.5 w-3.5"
                  >
                    <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5" strokeLinecap="round"/>
                    <path d="M8 1v3l2-1.5L8 1Z" fill="currentColor" stroke="none"/>
                  </motion.svg>
                </button>
                <button
                  ref={closeButtonRef}
                  onClick={onClose}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Feed */}
            <div className="flex-1 overflow-y-auto p-4">
              {isLoading && (
                <div className="flex flex-col gap-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-16 rounded-xl bg-white/40 animate-pulse" />
                  ))}
                </div>
              )}

              {!isLoading && items.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-20 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 ring-1 ring-indigo-100">
                    <Activity className="h-5 w-5 text-indigo-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-500">No activity yet</p>
                  <p className="text-xs text-slate-400 max-w-[200px] leading-relaxed">
                    Interventions will appear here after Aegis scans your directions
                  </p>
                </div>
              )}

              {items.length > 0 && (
                <div className="flex flex-col gap-2">
                  {items.map((item, i) => (
                    <ActivityItem key={item.id} item={item} index={i} />
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="shrink-0 border-t border-white/20 px-5 py-3">
                <Link
                  href="/workspace/activity"
                  onClick={onClose}
                  className="flex items-center justify-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
                >
                  View full activity log
                  <ArrowRight size={12} />
                </Link>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
