"use client";

import { AlertTriangle } from "lucide-react";
import type { Intervention } from "@/lib/types";
import { RISK_LABELS, SEVERITY_BG } from "@/lib/constants";

interface InterventionCardProps {
  intervention: Intervention;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  isPending: boolean;
}

export function InterventionCard({ intervention, onApprove, onReject, isPending }: InterventionCardProps) {
  const { risk_signal, confidence } = intervention;
  const severity = risk_signal?.severity;
  const isCritical = severity === "critical";

  const chipClass = risk_signal && severity
    ? `border ${SEVERITY_BG[severity]}`
    : "bg-slate-100 text-slate-600 border border-slate-200";

  const chipLabel = risk_signal?.risk_type
    ? RISK_LABELS[risk_signal.risk_type]
    : "UNKNOWN";

  const confidencePct = Math.min(100, Math.round((confidence ?? 0) * 100));

  return (
    <div
      className={`rounded-xl border border-red-200/40 bg-white/60 p-4 transition-all hover:border-red-300/50 ${
        isCritical ? "ring-2 ring-red-400/30 animate-[pulse_2s_ease-in-out_3]" : ""
      }`}
    >
      <div className="flex gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
          <AlertTriangle size={14} />
        </div>
        <div className="min-w-0 flex-1">
          {/* Risk chip + confidence row */}
          <div className="mb-2 flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${chipClass}`}>
              {chipLabel}
            </span>
            {risk_signal && (
              <span className="text-[11px] text-muted-foreground">{confidencePct}%</span>
            )}
          </div>

          <p className="text-xs font-semibold text-[#1a1c1d] capitalize">
            {intervention.action_type?.replace(/_/g, " ") ?? "Intervention"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-2">
            {intervention.rationale ?? "Awaiting founder approval."}
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              onClick={() => onApprove(intervention.id)}
              disabled={isPending}
              className="rounded-lg bg-[#112478] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              Approve
            </button>
            <button
              onClick={() => onReject(intervention.id)}
              disabled={isPending}
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200 disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
