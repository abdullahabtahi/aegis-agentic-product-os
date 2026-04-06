"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ACTION_LABELS, ESCALATION_LABELS, SEVERITY_BG } from "@/lib/constants";
import type { ActionType, EscalationLevel } from "@/lib/types";
import { ShieldCheck } from "lucide-react";

export interface InlineApprovalCardProps {
  intervention_title: string;
  action_type: ActionType;
  escalation_level: EscalationLevel;
  rationale: string;
  confidence: number;
  risk_type?: string;
  severity?: string;
  requires_double_confirm?: boolean;
  onApprove: () => void;
  onReject: () => void;
}

export function InlineApprovalCard({
  intervention_title,
  action_type,
  escalation_level,
  rationale,
  confidence,
  severity,
  requires_double_confirm,
  onApprove,
  onReject,
}: InlineApprovalCardProps) {
  const confidencePct = Math.round(confidence * 100);
  const severityClass =
    severity &&
    SEVERITY_BG[severity as keyof typeof SEVERITY_BG]
      ? SEVERITY_BG[severity as keyof typeof SEVERITY_BG]
      : "bg-white/5 text-white/40 border-white/10";

  return (
    <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4 my-2 max-w-sm">
      <div className="flex items-start gap-2 mb-3">
        <ShieldCheck className="size-4 text-orange-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-white/90 leading-snug">
            {intervention_title}
          </p>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <Badge className="text-[9px] py-0 px-1.5 rounded border font-mono bg-white/5 text-white/50 border-white/10">
              {ACTION_LABELS[action_type] ?? action_type}
            </Badge>
            <Badge className="text-[9px] py-0 px-1.5 rounded border font-mono bg-white/5 text-white/50 border-white/10">
              {ESCALATION_LABELS[escalation_level]}
            </Badge>
            {severity && (
              <Badge
                className={cn(
                  "text-[9px] py-0 px-1.5 rounded border font-mono",
                  severityClass
                )}
              >
                {severity}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <p className="text-[12px] text-white/60 leading-relaxed mb-3">{rationale}</p>

      {/* Confidence bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-white/30 font-mono">Confidence</span>
          <span className="text-[10px] text-white/50 font-mono">{confidencePct}%</span>
        </div>
        <div className="h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-orange-400 transition-all"
            style={{ width: `${confidencePct}%` }}
          />
        </div>
      </div>

      {requires_double_confirm && (
        <p className="text-[10px] text-amber-400/80 mb-3 font-mono">
          ⚠ Double confirm required — this action has broad impact
        </p>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={onApprove}
          className="flex-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/20 text-[12px]"
          variant="ghost"
        >
          Approve
        </Button>
        <Button
          size="sm"
          onClick={onReject}
          className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-[12px]"
          variant="ghost"
        >
          Reject
        </Button>
      </div>
    </div>
  );
}
