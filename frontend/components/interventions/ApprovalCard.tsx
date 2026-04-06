"use client";

/**
 * ApprovalCard — HITL approval surface for Governor-approved interventions.
 *
 * Double-confirm: driven entirely by intervention.requires_double_confirm
 * (set by Governor reversibility check). Frontend never hardcodes which
 * actions require it — that is the Governor's responsibility.
 *
 * Execution state: no optimistic status update. While isExecuting=true, the
 * card shows a spinner and disables both buttons to prevent double-submission.
 * The card only resolves (moves to history) after the server confirms success.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, AlertTriangle, Zap, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { StreamingExplanation } from "./StreamingExplanation";
import { SeverityBadge, EscalationBadge } from "./SeverityBadge";
import { ACTION_LABELS, ESCALATION_LABELS } from "@/lib/constants";
import type { Intervention } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ApprovalCardProps {
  intervention: Intervention;
  onApprove: (id: string) => void;
  onReject: (id: string, reason?: string) => void;
  isLoading?: boolean;
  /** True while the mutation is in-flight — disables buttons, shows spinner */
  isExecuting?: boolean;
}

export function ApprovalCard({
  intervention,
  onApprove,
  onReject,
  isLoading = false,
  isExecuting = false,
}: ApprovalCardProps) {
  const [confirmStep, setConfirmStep] = useState<"idle" | "confirming">("idle");
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  // Delegate double-confirm decision to the Governor — never hardcode here.
  const requiresDoubleConfirm = !!intervention.requires_double_confirm;

  const handleApprove = () => {
    if (requiresDoubleConfirm && confirmStep === "idle") {
      setConfirmStep("confirming");
      return;
    }
    onApprove(intervention.id);
    setConfirmStep("idle");
  };

  const handleReject = () => {
    if (showRejectInput) {
      onReject(intervention.id, rejectReason.trim() || undefined);
      setShowRejectInput(false);
      setRejectReason("");
      return;
    }
    setShowRejectInput(true);
  };

  const isJulesAction = intervention.action_type.startsWith("jules_");

  if (isLoading) {
    return (
      <div className="rounded-lg border border-white/8 bg-[#111118] p-4 space-y-3">
        <Skeleton className="h-4 w-3/4 bg-white/5" />
        <Skeleton className="h-3 w-full bg-white/5" />
        <Skeleton className="h-3 w-2/3 bg-white/5" />
        <div className="flex gap-2 mt-4">
          <Skeleton className="h-8 w-24 bg-white/5 rounded" />
          <Skeleton className="h-8 w-24 bg-white/5 rounded" />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={cn(
        "rounded-lg border bg-[#111118] p-4 transition-all",
        intervention.escalation_level >= 3
          ? "border-orange-400/25"
          : intervention.escalation_level >= 2
            ? "border-amber-400/20"
            : "border-white/10",
      )}
    >
      {/* Header badges */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <EscalationBadge level={intervention.escalation_level} />
          {intervention.risk_signal && (
            <SeverityBadge severity={intervention.risk_signal.severity} />
          )}
          {isJulesAction && (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border bg-[#4F7EFF]/10 text-[#4F7EFF] border-[#4F7EFF]/20">
              <Zap className="w-2.5 h-2.5" />
              Jules
            </span>
          )}
          {requiresDoubleConfirm && (
            <span className="inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded border bg-amber-400/10 text-amber-400 border-amber-400/20">
              confirm required
            </span>
          )}
        </div>
      </div>

      {/* Action label + escalation level */}
      <h3 className="font-semibold text-white text-sm mb-1">
        {ACTION_LABELS[intervention.action_type]}
      </h3>
      <p className="text-[11px] text-white/40 mb-3 font-mono">
        {ESCALATION_LABELS[intervention.escalation_level]}
      </p>

      {/* Rationale — isolated to prevent cascading re-renders */}
      <StreamingExplanation text={intervention.rationale} />

      {/* Blast radius warning */}
      {intervention.blast_radius && (
        <div className="mt-3 flex items-start gap-2 text-[11px] text-amber-400/80 bg-amber-400/5 border border-amber-400/15 rounded p-2">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>
            {intervention.blast_radius.affected_issue_count} issues affected
            {!intervention.blast_radius.reversible && " · irreversible"}
          </span>
        </div>
      )}

      {/* Jules plan preview */}
      {isJulesAction && intervention.proposed_issue_title && (
        <div className="mt-3 p-2.5 rounded bg-[#4F7EFF]/5 border border-[#4F7EFF]/15 text-[11px] space-y-1">
          <div className="font-semibold text-white/70">
            {intervention.proposed_issue_title}
          </div>
          {intervention.proposed_issue_description && (
            <div className="text-white/40 line-clamp-3">
              {intervention.proposed_issue_description}
            </div>
          )}
        </div>
      )}

      {/* Reject reason input */}
      <AnimatePresence>
        {showRejectInput && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mt-3"
          >
            <input
              className="w-full text-xs bg-white/5 border border-white/10 rounded px-3 py-2 text-white/80 placeholder:text-white/25 focus:outline-none focus:border-white/20"
              placeholder="Reason for rejection (optional)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleReject();
                if (e.key === "Escape") {
                  setShowRejectInput(false);
                  setRejectReason("");
                }
              }}
              autoFocus
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-4">
        {isExecuting ? (
          /* Execution in-flight — disable both buttons, show spinner */
          <div className="flex items-center gap-2 text-[11px] text-white/40">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#4F7EFF]" />
            <span>Sending to Linear…</span>
          </div>
        ) : confirmStep === "confirming" ? (
          <>
            <span className="text-[11px] text-amber-400 flex-1">
              Confirm {ACTION_LABELS[intervention.action_type]}?
            </span>
            <button
              onClick={handleApprove}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
            >
              <Check className="w-3 h-3" /> Confirm
            </button>
            <button
              onClick={() => setConfirmStep("idle")}
              className="text-xs px-3 py-1.5 rounded bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleApprove}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-[#4F7EFF]/20 text-[#4F7EFF] border border-[#4F7EFF]/30 hover:bg-[#4F7EFF]/30 transition-colors"
            >
              <Check className="w-3 h-3" />
              {requiresDoubleConfirm ? "Accept →" : "Accept"}
            </button>
            <button
              onClick={handleReject}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 transition-colors"
            >
              <X className="w-3 h-3" />
              {showRejectInput ? "Confirm reject" : "Reject"}
            </button>
            {showRejectInput && (
              <button
                onClick={() => { setShowRejectInput(false); setRejectReason(""); }}
                className="text-[10px] text-white/30 hover:text-white/50"
              >
                cancel
              </button>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
