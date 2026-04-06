"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { RISK_LABELS, SEVERITY_BG } from "@/lib/constants";
import type { RiskType, Severity } from "@/lib/types";
import { AlertTriangle } from "lucide-react";

export interface InlineRiskSignalCardProps {
  risk_type: RiskType;
  severity: Severity;
  confidence: number;
  evidence_summary: string;
  headline?: string;
}

export function InlineRiskSignalCard({
  risk_type,
  severity,
  confidence,
  evidence_summary,
  headline,
}: InlineRiskSignalCardProps) {
  const severityClass =
    SEVERITY_BG[severity] ?? "bg-white/5 text-white/40 border-white/10";
  const confidencePct = Math.round(confidence * 100);

  return (
    <div className="rounded-lg border border-white/10 bg-white/3 p-4 my-2 max-w-sm">
      <div className="flex items-start gap-2 mb-2">
        <AlertTriangle className="size-4 text-amber-400 mt-0.5 shrink-0" />
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] font-semibold text-white/80">
              {RISK_LABELS[risk_type]}
            </span>
            <Badge
              className={cn(
                "text-[9px] py-0 px-1.5 rounded border font-mono",
                severityClass
              )}
            >
              {severity}
            </Badge>
            <span className="text-[10px] text-white/30 font-mono ml-auto">
              {confidencePct}% confidence
            </span>
          </div>
          {headline && (
            <p className="text-[12px] text-white/70 mt-1 leading-snug">{headline}</p>
          )}
        </div>
      </div>
      <p className="text-[11px] text-white/45 leading-relaxed">{evidence_summary}</p>
    </div>
  );
}
