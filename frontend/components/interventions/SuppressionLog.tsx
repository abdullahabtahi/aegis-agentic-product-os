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
    (i) => i.status === "dismissed" || i.denial_reason,
  );

  if (suppressed.length === 0) return null;

  return (
    <div className={cn("mb-4", className)}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
        <ShieldOff className="h-3 w-3" />
        Auto-suppressed ({suppressed.length})
      </div>
      <div className="flex flex-col gap-1">
        {suppressed.map((i) => (
          <div
            key={i.id}
            className="flex items-center gap-2.5 rounded-xl border border-slate-200/40 bg-slate-50/60 px-3 py-2 text-[11px]"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-slate-300 shrink-0" />
            <span className="text-slate-500 flex-1 truncate">
              {ACTION_LABELS[i.action_type as keyof typeof ACTION_LABELS] ?? i.action_type.replace(/_/g, " ")}
            </span>
            {i.denial_reason && (
              <span className="text-[9px] font-mono text-slate-400 shrink-0 bg-slate-100 px-1.5 py-0.5 rounded">
                {i.denial_reason.replace(/_/g, " ")}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
