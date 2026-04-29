"use client";
import type { RiskSignal } from "@/lib/types";

const RISK_LABELS: Record<string, string> = {
  strategy_unclear: "Strategy Unclear",
  alignment_issue: "Alignment Issue",
  execution_issue: "Execution Issue",
  placebo_productivity: "Placebo Productivity",
};

const SEVERITY_STYLES: Record<string, string> = {
  low: "text-emerald-400 bg-emerald-400/10",
  medium: "text-amber-400 bg-amber-400/10",
  high: "text-orange-400 bg-orange-400/10",
  critical: "text-red-400 bg-red-400/10",
};

export function RiskSignalCard({ signal }: { signal: RiskSignal }) {
  const confidencePct = Math.round(signal.confidence * 100);
  return (
    <div className="glass-panel mt-3 space-y-3 rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-indigo-500/15 px-3 py-1 text-xs font-medium text-indigo-400">
          {RISK_LABELS[signal.risk_type] ?? signal.risk_type}
        </span>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${SEVERITY_STYLES[signal.severity] ?? ""}`}>
          {signal.severity.toUpperCase()}
        </span>
      </div>
      {signal.headline && (
        <p className="text-sm font-semibold text-foreground/90">{signal.headline}</p>
      )}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-foreground/50">
          <span>Confidence</span>
          <span>{confidencePct}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-white/10">
          <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${confidencePct}%` }} />
        </div>
      </div>
      {signal.explanation && (
        <p className="text-xs leading-relaxed text-foreground/70">{signal.explanation}</p>
      )}
      <p className="text-xs italic text-foreground/50">{signal.evidence_summary}</p>
    </div>
  );
}
