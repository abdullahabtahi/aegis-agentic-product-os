"use client";

import { cn } from "@/lib/utils";

export type BadgeStatus =
  | "accepted"
  | "rejected"
  | "pending"
  | "dismissed"
  | "awaiting_approval"
  | "approved"
  | "complete"
  | "error"
  | "no_intervention";

const STATUS_STYLES: Record<BadgeStatus, { label: string; className: string }> = {
  accepted:          { label: "Accepted",          className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  approved:          { label: "Approved",          className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  complete:          { label: "Complete",          className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  rejected:          { label: "Rejected",          className: "bg-red-500/15 text-red-400 border-red-500/20" },
  error:             { label: "Error",             className: "bg-red-500/15 text-red-400 border-red-500/20" },
  pending:           { label: "Pending",           className: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
  awaiting_approval: { label: "Awaiting Approval", className: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
  dismissed:         { label: "Dismissed",         className: "bg-slate-100 text-slate-500 border-slate-200" },
  no_intervention:   { label: "",                  className: "" },
};

interface StatusBadgeProps {
  status: BadgeStatus | string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  if (status === "no_intervention") return null;

  const style = STATUS_STYLES[status as BadgeStatus] ?? {
    label: status.replace(/_/g, " "),
    className: "bg-white/8 text-white/40 border-white/10",
  };

  if (!style.label) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border",
        style.className,
        className,
      )}
    >
      {style.label}
    </span>
  );
}
