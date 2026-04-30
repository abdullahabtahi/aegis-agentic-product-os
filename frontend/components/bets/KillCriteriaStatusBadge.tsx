"use client";

import { type KillCriteriaStatus } from "@/lib/types";

const STATUS_CONFIG: Record<
  KillCriteriaStatus,
  { label: string; bgClass: string; textClass: string; icon: string }
> = {
  pending:   { label: "Monitoring",    bgClass: "bg-slate-500/15",    textClass: "text-slate-600",    icon: "●" },
  triggered: { label: "Triggered",     bgClass: "bg-red-500/15",      textClass: "text-red-600",      icon: "▲" },
  met:       { label: "Condition Met", bgClass: "bg-emerald-500/15",  textClass: "text-emerald-700",  icon: "✓" },
  waived:    { label: "Waived",        bgClass: "bg-slate-500/10",    textClass: "text-slate-500",    icon: "−" },
};

/** Human-friendly countdown: "3 days left", "1 day left", "Today", "2 days overdue". */
function formatCountdown(deadlineISO: string, status: KillCriteriaStatus): string | null {
  const deadline = new Date(deadlineISO + "T00:00:00");
  if (Number.isNaN(deadline.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((deadline.getTime() - today.getTime()) / 86_400_000);

  if (status === "triggered" || diffDays < 0) {
    const overdue = Math.abs(diffDays);
    return overdue === 0
      ? "Overdue"
      : `${overdue} day${overdue === 1 ? "" : "s"} overdue`;
  }
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "1 day left";
  return `${diffDays} days left`;
}

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
  const countdown =
    (status === "pending" || status === "triggered") && deadline
      ? formatCountdown(deadline, status)
      : null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.bgClass} ${config.textClass} ${className}`}
      title={deadline ? `Deadline: ${new Date(deadline).toLocaleDateString()}` : undefined}
    >
      <span aria-hidden="true">{config.icon}</span>
      {config.label}
      {countdown && <span className="opacity-70 ml-0.5">· {countdown}</span>}
    </span>
  );
}

