"use client";

import { useState } from "react";
import {
  Check, X, AlertTriangle, ChevronDown, ChevronUp,
  MessageSquare, Plus, Tag, BookOpen,
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

/** Slim confidence bar — the 0–100% fill signals how sure the agent is. */
function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 75 ? "bg-emerald-500" : pct >= 55 ? "bg-amber-500" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/8">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-7 text-right font-mono text-[10px] text-white/40">
        {pct}%
      </span>
    </div>
  );
}

/** Shows exactly what Aegis will write to Linear — no surprises. */
function LinearActionPreview({ intervention: i }: { intervention: Intervention }) {
  if (!i.proposed_comment && !i.proposed_issue_title) return null;

  return (
    <div className="rounded-lg border border-white/6 bg-white/3 px-3 py-2.5 space-y-1.5">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">
        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
        Proposed Linear action
      </p>
      {i.proposed_comment && (
        <div className="flex gap-2">
          <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-indigo-400/60" />
          <p className="text-[11px] leading-relaxed text-white/60 italic">
            &ldquo;{i.proposed_comment}&rdquo;
          </p>
        </div>
      )}
      {i.proposed_issue_title && (
        <div className="flex gap-2">
          <Plus className="mt-0.5 h-3 w-3 shrink-0 text-sky-400/60" />
          <p className="text-[11px] text-white/60">
            Create issue: <span className="text-white/80">{i.proposed_issue_title}</span>
          </p>
        </div>
      )}
      {i.proposed_issue_description && (
        <p className="pl-5 text-[10px] leading-relaxed text-white/35 italic line-clamp-2">
          {i.proposed_issue_description}
        </p>
      )}
    </div>
  );
}

/** Product principle citations — the intellectual authority layer. */
function ProductPrincipleRefs({ refs }: { refs: NonNullable<Intervention["risk_signal"]>["product_principle_refs"] }) {
  if (!refs?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {refs.map((ref) => (
        <span
          key={ref.id}
          className="flex items-center gap-1 rounded-full border border-violet-400/20 bg-violet-400/8 px-2 py-0.5 text-[10px] text-violet-300/70"
        >
          <BookOpen className="h-2.5 w-2.5" />
          {ref.source ? `${ref.source}: ` : ""}{ref.name}
        </span>
      ))}
    </div>
  );
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

  const riskLabel = i.risk_signal ? RISK_LABELS[i.risk_signal.risk_type] : null;

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

      {/* ── Top row ─────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 px-3 py-2.5">
        <div className="flex-1 min-w-0 space-y-1">
          {/* Action label + badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-white/85">
              {ACTION_LABELS[i.action_type]}
            </span>
            {riskLabel && (
              <span className="text-[9px] text-white/30">·</span>
            )}
            {riskLabel && (
              <span className="text-[10px] text-white/45">{riskLabel}</span>
            )}
            <span className={cn("text-[9px] px-1.5 py-0.5 rounded border ml-auto shrink-0", severityClass)}>
              {i.risk_signal?.severity ?? "—"}
            </span>
            <span className="text-[9px] text-white/30 font-mono">
              {ESCALATION_LABELS[i.escalation_level]}
            </span>
          </div>

          {/* Rationale */}
          <p className="text-[11px] leading-relaxed text-white/45 line-clamp-2">{i.rationale}</p>

          {/* Confidence bar — always visible */}
          <ConfidenceBar value={i.confidence} />
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-white/20 hover:text-white/50 transition-colors shrink-0 mt-0.5"
          aria-label={expanded ? "Collapse details" : "Expand details"}
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* ── Expanded detail ──────────────────────────────────────────────── */}
      {expanded && (
        <div className="border-t border-white/5 px-3 pb-3 pt-2.5 space-y-2.5">

          {/* Linear action preview */}
          <LinearActionPreview intervention={i} />

          {/* Blast radius */}
          {i.blast_radius && (
            <div className="rounded-lg border border-white/6 bg-white/3 px-3 py-2 space-y-1">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">
                <Tag className="h-3 w-3" />
                Blast radius
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
                <span className="text-white/30">Affected issues</span>
                <span className="text-white/60">{i.blast_radius.affected_issue_count}</span>
                <span className="text-white/30">Notifications</span>
                <span className="text-white/60">{i.blast_radius.estimated_notification_count}</span>
                <span className="text-white/30">Reversible</span>
                <span className={i.blast_radius.reversible ? "text-emerald-400/70" : "text-amber-400/70"}>
                  {i.blast_radius.reversible ? "Yes" : "No"}
                </span>
              </div>
              {!i.blast_radius.reversible && (
                <div className="flex items-center gap-1 text-[10px] text-amber-400/70 pt-0.5">
                  <AlertTriangle className="h-3 w-3" />
                  Irreversible — verify before approving
                </div>
              )}
            </div>
          )}

          {/* Product principle refs */}
          <ProductPrincipleRefs refs={i.risk_signal?.product_principle_refs} />

          {/* Risk headline / explanation if present */}
          {i.risk_signal?.headline && (
            <p className="text-[11px] leading-relaxed text-white/50 italic">
              &ldquo;{i.risk_signal.headline}&rdquo;
            </p>
          )}

          {/* Pivot diagnosis — shown when agent ran 4Ps analysis */}
          {i.pivot_diagnosis && (
            <PivotDiagnosisCard
              diagnosis={i.pivot_diagnosis}
              className="mt-4"
            />
          )}
        </div>
      )}

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-t border-white/5 px-3 py-2">
        {confirmStep && (
          <span className="flex-1 text-[10px] text-amber-400/80">
            Confirm irreversible action?
          </span>
        )}
        <button
          onClick={handleApprove}
          disabled={isExecuting}
          className={cn(
            "flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
            confirmStep
              ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
              : "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25",
            isExecuting && "cursor-not-allowed opacity-50",
          )}
        >
          <Check className="h-3 w-3" />
          {confirmStep ? "Confirm" : "Approve"}
        </button>
        <button
          onClick={() => { setConfirmStep(false); onReject(i.id); }}
          disabled={isExecuting}
          className={cn(
            "flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
            "bg-red-500/10 text-red-400/70 hover:bg-red-500/20",
            isExecuting && "cursor-not-allowed opacity-50",
          )}
        >
          <X className="h-3 w-3" />
          Reject
        </button>
      </div>
    </div>
  );
}
