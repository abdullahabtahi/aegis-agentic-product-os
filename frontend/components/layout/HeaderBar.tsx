"use client";

/**
 * HeaderBar — Floating glassmorphic header bar.
 * Shows breadcrumb/page title, live pipeline status, and notification bell.
 *
 * The notification bell opens InboxDrawer — a slide-in approval panel.
 * Badge count and pulse ring communicate urgency without a page navigation.
 */

import { useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Activity } from "lucide-react";
import { useAgentStateSync } from "@/hooks/useAgentStateSync";
import { useWorkspaceId } from "@/hooks/useWorkspaceId";
import { getInterventions } from "@/lib/api";
import { InboxDrawer } from "@/components/interventions/InboxDrawer";
import { ActivityDrawer } from "@/components/activity/ActivityDrawer";
import { cn } from "@/lib/utils";
import type { PipelineStatus } from "@/lib/types";

const PAGE_TITLES: Record<string, string> = {
  "/workspace": "Home",
  "/workspace/chat": "Chat",
  "/workspace/mission-control": "Mission Control",
  "/workspace/directions": "Directions",
  "/workspace/activity": "Activity",
  "/workspace/settings": "Settings",
  "/workspace/inbox": "Inbox",
};

function resolvePageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.startsWith("/workspace/directions/")) return "Direction";
  if (pathname.startsWith("/workspace/boardroom/")) return "Boardroom";
  return "Aegis";
}

const STATUS_CONFIG: Record<PipelineStatus, { label: string; dot: string }> = {
  idle: { label: "Pipeline Idle", dot: "bg-slate-400" },
  scanning: { label: "Scanning...", dot: "bg-indigo-500 animate-pulse" },
  analyzing: { label: "Analyzing...", dot: "bg-indigo-500 animate-pulse" },
  awaiting_approval: { label: "Awaiting Approval", dot: "bg-amber-500 animate-pulse" },
  approved: { label: "Approved", dot: "bg-emerald-500" },
  executing: { label: "Executing...", dot: "bg-indigo-500 animate-pulse" },
  complete: { label: "Complete", dot: "bg-emerald-500" },
  error: { label: "Error", dot: "bg-red-500" },
};

export function HeaderBar() {
  const pathname = usePathname();
  const pageTitle = resolvePageTitle(pathname);
  const { state } = useAgentStateSync();
  const workspaceId = useWorkspaceId();
  const [inboxOpen, setInboxOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);

  const handleBellClick = useCallback(() => { setActivityOpen(false); setInboxOpen((v) => !v); }, []);
  const handleInboxClose = useCallback(() => setInboxOpen(false), []);
  const handleActivityClick = useCallback(() => { setInboxOpen(false); setActivityOpen((v) => !v); }, []);
  const handleActivityClose = useCallback(() => setActivityOpen(false), []);

  const status = state.pipeline_status ?? "idle";
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle;
  const isUrgent = status === "awaiting_approval";

  // Live pending count for badge — always enabled so badge works even before
  // workspace_id is emitted by the agent (falls back to "default_workspace")
  const { data: interventions = [] } = useQuery({
    queryKey: ["interventions", workspaceId, "header-badge"],
    queryFn: () => getInterventions(workspaceId),
    staleTime: 15_000,
    refetchInterval: 15_000,
    enabled: !!workspaceId,
  });

  const pendingCount = interventions.filter(
    (i) => i.status === "pending",
  ).length;

  return (
    <>
      <header className="glass-panel-subtle flex h-14 shrink-0 items-center justify-between rounded-2xl px-5">
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-lg font-semibold text-foreground/90" suppressHydrationWarning>
            {pageTitle}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Pipeline status pill */}
          <div className="flex h-8 items-center gap-2 rounded-lg bg-white/20 px-3 text-xs font-medium text-foreground/70">
            <span className={`h-2 w-2 rounded-full ${config.dot}`} />
            {config.label}
          </div>

          {/* Activity log button */}
          <button
            onClick={handleActivityClick}
            aria-label="Activity log"
            aria-expanded={activityOpen}
            className={cn(
              "relative flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
              activityOpen
                ? "bg-indigo-100 text-indigo-700 shadow-sm"
                : "bg-white/30 text-slate-500 hover:bg-white/60 hover:text-slate-700 hover:scale-105",
            )}
          >
            <Activity className="h-[18px] w-[18px]" strokeWidth={activityOpen ? 2.5 : 1.75} />
          </button>

          {/* Notification bell */}
          <NotificationBell
            pendingCount={pendingCount}
            isUrgent={isUrgent}
            isOpen={inboxOpen}
            onClick={handleBellClick}
          />
        </div>
      </header>

      <ActivityDrawer
        open={activityOpen}
        onClose={handleActivityClose}
        workspaceId={workspaceId}
      />

      {/* Inbox drawer — rendered at this level so it overlays the full content area */}
      <InboxDrawer
        open={inboxOpen}
        onClose={handleInboxClose}
        workspaceId={workspaceId}
        pendingCount={pendingCount}
      />
    </>
  );
}

interface NotificationBellProps {
  pendingCount: number;
  isUrgent: boolean;
  isOpen: boolean;
  onClick: () => void;
}

function NotificationBell({ pendingCount, isUrgent, isOpen, onClick }: NotificationBellProps) {
  const hasPending = pendingCount > 0;

  return (
    <button
      onClick={onClick}
      aria-label={
        hasPending
          ? `Open approvals — ${pendingCount} pending`
          : "Open approvals"
      }
      aria-expanded={isOpen}
      className={cn(
        "relative flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
        isOpen
          ? "bg-indigo-100 text-indigo-700 shadow-sm"
          : "bg-white/30 text-slate-500 hover:bg-white/60 hover:text-slate-700 hover:scale-105",
      )}
    >
      {/* Urgent pulse ring */}
      {isUrgent && (
        <span
          className="absolute inset-0 rounded-xl ring-2 ring-amber-400/60 animate-pulse"
          aria-hidden="true"
        />
      )}

      <Bell
        className={cn("h-[18px] w-[18px] transition-transform duration-200", isOpen && "scale-90")}
        strokeWidth={isOpen ? 2.5 : 1.75}
      />

      {/* Count badge */}
      <AnimatePresence>
        {hasPending && (
          <motion.span
            key="badge"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
            className={cn(
              "absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1",
              "text-[9px] font-bold text-white shadow-sm",
              isUrgent ? "bg-amber-500" : "bg-red-500",
            )}
            aria-hidden="true"
          >
            {pendingCount > 9 ? "9+" : pendingCount}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
