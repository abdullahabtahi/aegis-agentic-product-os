"use client";

import { ShieldOff } from "lucide-react";
import type { Intervention } from "@/lib/types";
import { ACTION_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface SuppressionLogProps {
  interventions: Intervention[];
  className?: string;
}

export function SuppressionLog({ interventions, className }: SuppressionLogProps) {
  const suppressed = interventions.filter(
    (i) => i.status === "auto_suppressed" || i.denial_reason,
  );

  if (suppressed.length === 0) return null;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center gap-1.5 text-[10px] font-mono text-white/30 uppercase tracking-wider mb-2">
        <ShieldOff className="w-3 h-3" />
        Auto-suppressed ({suppressed.length})
      </div>
      {suppressed.map((i) => (
        <div
          key={i.id}
          className="flex items-center justify-between gap-2 py-1.5 px-2 rounded bg-white/3 border border-white/5 text-[11px]"
        >
          <span className="text-white/40 truncate flex-1">
            {ACTION_LABELS[i.action_type]}
          </span>
          {i.denial_reason && (
            <span className="text-[9px] font-mono text-white/20 shrink-0">
              {i.denial_reason.replace(/_/g, " ")}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
