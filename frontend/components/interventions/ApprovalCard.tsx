"use client";

import { useState } from "react";
import { Check, X, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { ACTION_LABELS, ESCALATION_LABELS, SEVERITY_BG } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Intervention } from "@/lib/types";

interface ApprovalCardProps {
  intervention: Intervention;
  onApprove: (id: string) => void;
  onReject: (id: string, reason?: string) => void;
  isExecuting?: boolean;
}

export function ApprovalCard({
  intervention: i,
  onApprove,
  onReject,
  isExecuting = false,
}: ApprovalCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);

  const severityClass =
    i.risk_signal ? SEVERITY_BG[i.risk_signal.severity] : "bg-white/5 text-white/40 border-white/10";

  function handleApprove() {
    if (i.requires_double_confirm && !confirmStep) {
      setConfirmStep(true);
      return;
    }
    onApprove(i.id);
    setConfirmStep(false);
  }

  return (
    <div className="rounded-lg border border-white/8 bg-white/3 overflow-hidden">
      {/* Top row */}
      <div className="flex items-start gap-2 px-3 py-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-medium text-white/80 truncate">
              {ACTION_LABELS[i.action_type]}
            </span>
            <span className={cn("text-[9px] px-1.5 py-0.5 rounded border", severityClass)}>
              {i.risk_signal?.severity ?? "—"}
            </span>
            <span className="text-[9px] text-white/30 font-mono">
              {ESCALATION_LABELS[i.escalation_level]}
            </span>
          </div>
          <p className="text-[11px] text-white/40 mt-0.5 line-clamp-2">{i.rationale}</p>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-white/20 hover:text-white/50 transition-colors shrink-0 mt-0.5"
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-2 space-y-1 border-t border-white/5 pt-2">
          {i.blast_radius && (
            <div className="text-[10px] text-white/30 space-y-0.5">
              <div>Affected issues: <span className="text-white/50">{i.blast_radius.affected_issue_count}</span></div>
              <div>Notifications: <span className="text-white/50">{i.blast_radius.estimated_notification_count}</span></div>
              {!i.blast_radius.reversible && (
                <div className="flex items-center gap-1 text-amber-400/70">
                  <AlertTriangle className="w-3 h-3" /> Irreversible action
                </div>
              )}
            </div>
          )}
          {i.proposed_issue_title && (
            <div className="text-[10px] text-white/30">
              Issue: <span className="text-white/50">{i.proposed_issue_title}</span>
            </div>
          )}
          <div className="text-[10px] text-white/20 font-mono">
            {Math.round(i.confidence * 100)}% confidence
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-white/5">
        {confirmStep ? (
          <span className="text-[10px] text-amber-400/80 flex-1">Confirm irreversible action?</span>
        ) : null}
        <button
          onClick={handleApprove}
          disabled={isExecuting}
          className={cn(
            "flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors",
            confirmStep
              ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
              : "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25",
            isExecuting && "opacity-50 cursor-not-allowed",
          )}
        >
          <Check className="w-3 h-3" />
          {confirmStep ? "Confirm" : "Approve"}
        </button>
        <button
          onClick={() => { setConfirmStep(false); onReject(i.id); }}
          disabled={isExecuting}
          className={cn(
            "flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors",
            "bg-red-500/10 text-red-400/70 hover:bg-red-500/20",
            isExecuting && "opacity-50 cursor-not-allowed",
          )}
        >
          <X className="w-3 h-3" />
          Reject
        </button>
      </div>
    </div>
  );
}
