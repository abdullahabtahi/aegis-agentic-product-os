"use client";

/**
 * HeaderBar — Floating glassmorphic header bar.
 * Shows breadcrumb/page title and live pipeline status.
 */

import { usePathname } from "next/navigation";
import { useAgentStateSync } from "@/hooks/useAgentStateSync";
import type { PipelineStatus } from "@/lib/types";

const PAGE_TITLES: Record<string, string> = {
  "/workspace": "Home",
  "/workspace/mission-control": "Mission Control",
};

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
  const pageTitle = PAGE_TITLES[pathname] ?? "Aegis";
  const { state } = useAgentStateSync();

  const status = state.pipeline_status ?? "idle";
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle;

  return (
    <header className="glass-panel-subtle flex h-14 shrink-0 items-center justify-between rounded-2xl px-5">
      <div className="flex items-center gap-3">
        <h1 className="font-heading text-lg font-semibold text-foreground/90">
          {pageTitle}
        </h1>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <div className="flex h-8 items-center gap-2 rounded-lg bg-white/20 px-3 text-xs font-medium text-foreground/70">
          <span className={`h-2 w-2 rounded-full ${config.dot}`} />
          {config.label}
        </div>
      </div>
    </header>
  );
}
