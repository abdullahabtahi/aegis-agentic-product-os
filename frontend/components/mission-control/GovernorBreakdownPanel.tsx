"use client";

import { CheckCircle2, XCircle, Minus } from "lucide-react";

const POLICY_CHECKS: { key: string; label: string }[] = [
  { key: "confidence_floor", label: "Confidence Floor" },
  { key: "duplicate_suppression", label: "Duplicate Suppression" },
  { key: "rate_cap", label: "Rate Cap" },
  { key: "jules_gate", label: "Jules Gate" },
  { key: "reversibility", label: "Reversibility" },
  { key: "acknowledged_risk", label: "Acknowledged Risk" },
  { key: "control_level", label: "Control Level" },
  { key: "escalation_ladder", label: "Escalation Ladder" },
];

interface GovernorBreakdownPanelProps {
  denialReason?: string | null;
  denialDetails?: string | null;
}

export function GovernorBreakdownPanel({ denialReason, denialDetails }: GovernorBreakdownPanelProps) {
  const knownKeys = POLICY_CHECKS.map((c) => c.key);
  const isUnknown = denialReason && !knownKeys.includes(denialReason);

  const truncatedDetails = denialDetails && denialDetails.length > 120
    ? denialDetails.slice(0, 120) + "..."
    : denialDetails;

  return (
    <div className="mb-3 rounded-xl border border-slate-200/60 bg-white/30 p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
        Governor Policy
      </p>
      <div className="flex flex-col gap-1">
        {POLICY_CHECKS.map(({ key, label }) => {
          const isFailed = denialReason === key;
          return (
            <div
              key={key}
              className={`flex items-start gap-2 rounded-r px-2 py-1 text-[11px] transition-colors ${
                isFailed ? "bg-red-50/50 border-l-2 border-red-400" : ""
              }`}
            >
              {denialReason === null || denialReason === undefined ? (
                <Minus size={12} className="mt-0.5 shrink-0 text-slate-300" />
              ) : isFailed ? (
                <XCircle size={12} className="mt-0.5 shrink-0 text-red-500" />
              ) : (
                <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald-500" />
              )}
              <div className="min-w-0">
                <span className={isFailed ? "font-semibold text-red-700" : "text-slate-600"}>{label}</span>
                {isFailed && denialDetails && (
                  <p
                    className="mt-0.5 text-[11px] text-muted-foreground"
                    title={denialDetails}
                  >
                    {truncatedDetails}
                  </p>
                )}
              </div>
            </div>
          );
        })}
        {/* Unknown check not in known list */}
        {isUnknown && denialReason && (
          <div className="flex items-start gap-2 rounded-r px-2 py-1 text-[11px] bg-red-50/50 border-l-2 border-red-400">
            <XCircle size={12} className="mt-0.5 shrink-0 text-red-500" />
            <div>
              <span className="font-semibold text-red-700">{denialReason}</span>
              {denialDetails && (
                <p className="mt-0.5 text-[11px] text-muted-foreground" title={denialDetails}>
                  {truncatedDetails}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
