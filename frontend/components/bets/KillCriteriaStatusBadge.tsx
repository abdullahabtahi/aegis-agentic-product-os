"use client";

import { type KillCriteriaStatus } from "@/lib/types";

const STATUS_CONFIG: Record<
  KillCriteriaStatus,
  { label: string; bgClass: string; textClass: string; icon: string }
> = {
  pending:   { label: "Monitoring",    bgClass: "bg-slate-500/20",    textClass: "text-slate-400",    icon: "●" },
  triggered: { label: "Triggered",     bgClass: "bg-red-500/20",      textClass: "text-red-400",      icon: "▲" },
  met:       { label: "Condition Met", bgClass: "bg-emerald-500/20",  textClass: "text-emerald-400",  icon: "✓" },
  waived:    { label: "Waived",        bgClass: "bg-slate-500/15",    textClass: "text-slate-500",    icon: "−" },
};

interface KillCriteriaStatusBadgeProps {
  status: KillCriteriaStatus;
  deadline?: string;   // shown when status is "pending" or "triggered"
  className?: string;
}

export function KillCriteriaStatusBadge({
  status,
  deadline,
  className = "",
}: KillCriteriaStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const showDeadline = (status === "pending" || status === "triggered") && deadline;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.bgClass} ${config.textClass} ${className}`}
    >
      <span aria-hidden="true">{config.icon}</span>
      {config.label}
      {showDeadline && (
        <span className="opacity-70 ml-0.5">
          · {new Date(deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      )}
    </span>
  );
}
