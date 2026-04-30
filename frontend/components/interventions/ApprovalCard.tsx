"use client";

import { useState } from "react";
import {
  Check, X, AlertTriangle, ChevronDown, ChevronUp,
  MessageSquare, Plus, Tag, BookOpen, Zap,
} from "lucide-react";
import { ACTION_LABELS, ESCALATION_LABELS, RISK_LABELS, SEVERITY_BG } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Intervention } from "@/lib/types";
import { PivotDiagnosisCard } from "./PivotDiagnosisCard";

interface ApprovalCardProps {
  intervention: Intervention;
  onApprove: (id: string) => void;
  onReject: (id: string, reason?: string) => void;
  isExecuting?: boolean;
}

const ESCALATION_BORDER: Record<number, string> = {
  1: "border-l-indigo-400",
  2: "border-l-amber-400",
  3: "border-l-orange-400",
  4: "border-l-red-500",
};

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 75 ? "bg-emerald-500" : pct >= 55 ? "bg-amber-500" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-200/70">
        <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-7 text-right font-mono text-[10px] text-slate-400">{pct}%</span>
    </div>
  );
}

function LinearActionPreview({ intervention: i }: { intervention: Intervention }) {
  if (!i.proposed_comment && !i.proposed_issue_title) return null;
  return (
    <div className="rounded-xl border border-indigo-200/50 bg-indigo-50/50 px-3 py-2.5 space-y-1.5">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-indigo-400">
        <Zap className="h-2.5 w-2.5" />
        Proposed Linear action
      </p>
      {i.proposed_comment && (
        <div className="flex gap-2">
          <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-indigo-400" />
          <p className="text-[11px] leading-relaxed text-slate-600 italic">&ldquo;{i.proposed_comment}&rdquo;</p>
        </div>
      )}
      {i.proposed_issue_title && (
        <div className="flex gap-2">
          <Plus className="mt-0.5 h-3 w-3 shrink-0 text-sky-400" />
          <p className="text-[11px] text-slate-600">
            Create: <span className="font-semibold text-slate-800">{i.proposed_issue_title}</span>
          </p>
        </div>
      )}
      {i.proposed_issue_description && (
        <p className="pl-5 text-[10px] leading-relaxed text-slate-500 italic line-clamp-2">
          {i.proposed_issue_description}
        </p>
      )}
    </div>
  );
}

function ProductPrincipleRefs({ refs }: { refs: NonNullable<Intervention["risk_signal"]>["product_principle_refs"] }) {
  if (!refs?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {refs.map((ref) => (
        <span
          key={ref.id}
          className="flex items-center gap-1 rounded-full border border-violet-300/40 bg-violet-50 px-2 py-0.5 text-[10px] text-violet-600"
        >
          <BookOpen className="h-2.5 w-2.5" />
          {ref.source ? `${ref.source}: ` : ""}{ref.name}
        </span>
      ))}
    </div>
  );
}

export function ApprovalCard({ intervention: i, onApprove, onReject, isExecuting = false }: ApprovalCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);

  const borderColor = ESCALATION_BORDER[i.escalation_level ?? 1] ?? ESCALATION_BORDER[1];
  const severityClass = i.risk_signal
    ? SEVERITY_BG[i.risk_signal.severity]
    : "bg-slate-100 text-slate-400 border-slate-200";
  const riskLabel = i.risk_signal ? RISK_LABELS[i.risk_signal.risk_type] : null;

  function handleApprove() {
    if (i.requires_double_confirm && !confirmStep) { setConfirmStep(true); return; }
    onApprove(i.id);
    setConfirmStep(false);
  }

  return (
    <div className={cn(
      "rounded-2xl border border-slate-200/50 bg-white/70 backdrop-blur-sm shadow-sm overflow-hidden",
      "border-l-[3px]",
      borderColor,
    )}>
      {/* Top section */}
      <div className="px-4 pt-4 pb-3 space-y-2.5">
        {/* Row 1: action label + severity + escalation */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-slate-800 leading-tight">
              {ACTION_LABELS[i.action_type as keyof typeof ACTION_LABELS] ?? i.action_type.replace(/_/g, " ")}
            </p>
            {riskLabel && (
              <p className="text-[10px] text-slate-400 mt-0.5">{riskLabel}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {i.risk_signal?.severity && (
              <span className={cn("text-[9px] px-1.5 py-0.5 rounded-md border font-semibold", severityClass)}>
                {i.risk_signal.severity}
              </span>
            )}
            <span className="text-[9px] px-1.5 py-0.5 rounded-md border border-slate-200 bg-slate-50 text-slate-500 font-mono">
              {ESCALATION_LABELS[i.escalation_level ?? 1]}
            </span>
          </div>
        </div>

        {/* Row 2: rationale */}
        <p className="text-[11px] leading-relaxed text-slate-500 line-clamp-2">{i.rationale}</p>

        {/* Row 3: confidence */}
        <ConfidenceBar value={i.confidence} />

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-[10px] font-medium text-indigo-500 hover:text-indigo-700 transition-colors"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? "Hide details" : "View details"}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-200/50 px-4 pb-4 pt-3 space-y-3">
          <LinearActionPreview intervention={i} />

          {i.blast_radius && (
            <div className="rounded-xl border border-slate-200/50 bg-slate-50/60 px-3 py-2.5 space-y-1.5">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                <Tag className="h-3 w-3" />Blast radius
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                <span className="text-slate-400">Affected issues</span>
                <span className="font-medium text-slate-700">{i.blast_radius.affected_issue_count}</span>
                <span className="text-slate-400">Notifications</span>
                <span className="font-medium text-slate-700">{i.blast_radius.estimated_notification_count}</span>
                <span className="text-slate-400">Reversible</span>
                <span className={cn("font-medium", i.blast_radius.reversible ? "text-emerald-600" : "text-amber-600")}>
                  {i.blast_radius.reversible ? "Yes" : "No"}
                </span>
              </div>
              {!i.blast_radius.reversible && (
                <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200/50 px-2 py-1.5 text-[10px] text-amber-600 mt-1">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  Irreversible — double-check before approving
                </div>
              )}
            </div>
          )}

          <ProductPrincipleRefs refs={i.risk_signal?.product_principle_refs} />

          {i.risk_signal?.headline && (
            <p className="text-[11px] leading-relaxed text-slate-500 italic border-l-2 border-indigo-300/50 pl-2.5">
              &ldquo;{i.risk_signal.headline}&rdquo;
            </p>
          )}

          {i.pivot_diagnosis && (
            <PivotDiagnosisCard diagnosis={i.pivot_diagnosis} className="mt-2" />
          )}
        </div>
      )}

      {/* Action bar */}
      <div className={cn(
        "flex items-center gap-2.5 px-4 py-3 border-t",
        confirmStep ? "bg-amber-50/60 border-amber-200/50" : "bg-slate-50/50 border-slate-200/40",
      )}>
        {confirmStep && (
          <span className="flex-1 text-[11px] font-medium text-amber-600">
            ⚠ Confirm irreversible action?
          </span>
        )}
        <button
          onClick={handleApprove}
          disabled={isExecuting}
          className={cn(
            "flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-semibold transition-all duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
            confirmStep
              ? "bg-amber-500 text-white hover:bg-amber-600 focus-visible:ring-amber-400 shadow-amber-500/25"
              : "bg-emerald-500 text-white hover:bg-emerald-600 focus-visible:ring-emerald-400 shadow-emerald-500/25",
            "shadow-sm",
            isExecuting && "cursor-not-allowed opacity-50",
          )}
        >
          <Check className="h-3.5 w-3.5" />
          {confirmStep ? "Confirm" : "Approve"}
        </button>
        <button
          onClick={() => { setConfirmStep(false); onReject(i.id); }}
          disabled={isExecuting}
          className={cn(
            "flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-semibold transition-all duration-200",
            "bg-red-50 text-red-500 border border-red-200/60 hover:bg-red-100 hover:text-red-600",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1",
            isExecuting && "cursor-not-allowed opacity-50",
          )}
        >
          <X className="h-3.5 w-3.5" />
          Reject
        </button>
      </div>
    </div>
  );
}

