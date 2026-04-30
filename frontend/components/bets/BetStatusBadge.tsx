"use client";

import { cn } from "@/lib/utils";
import { BET_STATUS_LABELS, BET_STATUS_STYLES } from "@/lib/constants";
import type { BetStatus } from "@/lib/types";

interface BetStatusBadgeProps {
  status: BetStatus;
  className?: string;
}

export function BetStatusBadge({ status, className }: BetStatusBadgeProps) {
  return (
    <span className={cn(
      "rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
      BET_STATUS_STYLES[status],
      className,
    )}>
      {BET_STATUS_LABELS[status]}
    </span>
  );
}
