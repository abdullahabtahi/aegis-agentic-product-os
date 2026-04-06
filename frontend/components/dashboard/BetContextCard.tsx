"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScanTrigger } from "@/components/dashboard/ScanTrigger";
import { RISK_LABELS, SEVERITY_BG } from "@/lib/constants";
import type { AegisPipelineState, Bet } from "@/lib/types";
import { CalendarDays, Edit2 } from "lucide-react";

interface BetContextCardProps {
  activeBet: Bet | null;
  agentState: AegisPipelineState;
  workspaceId: string;
  onEditBet: () => void;
  className?: string;
}

function healthColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-amber-400";
  if (score >= 40) return "text-orange-400";
  return "text-red-400";
}

export function BetContextCard({
  activeBet,
  agentState,
  workspaceId,
  onEditBet,
  className,
}: BetContextCardProps) {
  const bet = activeBet ?? agentState.bet;

  const riskSignal =
    typeof agentState.risk_signal_draft === "object" &&
    agentState.risk_signal_draft !== null
      ? (agentState.risk_signal_draft as {
          risk_type?: string;
          severity?: string;
          confidence?: number;
        })
      : null;

  // Derive health score from confidence if available; default 72
  const healthScore =
    riskSignal?.confidence !== undefined
      ? Math.round((1 - riskSignal.confidence) * 100)
      : 72;

  const riskTypeLabel =
    riskSignal?.risk_type &&
    RISK_LABELS[riskSignal.risk_type as keyof typeof RISK_LABELS]
      ? RISK_LABELS[riskSignal.risk_type as keyof typeof RISK_LABELS]
      : null;

  const severityClass =
    riskSignal?.severity
      ? SEVERITY_BG[riskSignal.severity as keyof typeof SEVERITY_BG] ??
        "bg-white/5 text-white/40 border-white/10"
      : null;

  if (!bet) {
    return (
      <div
        className={cn(
          "px-5 py-4 border-b border-white/8 flex items-center justify-between",
          className
        )}
      >
        <span className="text-[11px] text-white/30">No active bet</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onEditBet}
          className="gap-1.5 text-[11px] text-white/40 hover:text-white/70"
        >
          <Edit2 className="size-3" />
          Declare Bet
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "px-5 py-4 border-b border-white/8 shrink-0",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left: Bet name + risk */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[13px] font-semibold text-white/90 truncate">
              {bet.name}
            </span>
            <span
              className={cn(
                "text-[12px] font-mono font-bold shrink-0",
                healthColor(healthScore)
              )}
            >
              {healthScore}%
            </span>
            {riskTypeLabel && severityClass && (
              <Badge
                className={cn(
                  "text-[9px] py-0 px-1.5 rounded border font-mono shrink-0",
                  severityClass
                )}
              >
                {riskTypeLabel}
              </Badge>
            )}
          </div>

          {riskSignal && !riskTypeLabel && (
            <p className="text-[11px] text-white/40">execution issue detected</p>
          )}

          {!riskSignal && (
            <p className="text-[11px] text-white/40">
              No gaps above 65% confidence — execution looks clean this week.
            </p>
          )}

          {bet.time_horizon && (
            <div className="flex items-center gap-1 mt-1">
              <CalendarDays className="size-3 text-white/25" />
              <span className="text-[10px] text-white/30 font-mono">
                {new Date(bet.time_horizon).toLocaleDateString("en-US", {
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <ScanTrigger bet={bet} workspaceId={workspaceId} />
          <Button
            variant="ghost"
            size="sm"
            onClick={onEditBet}
            className="gap-1.5 text-[11px] text-white/40 hover:text-white/70 border border-white/8 hover:border-white/15"
          >
            <Edit2 className="size-3" />
            Edit Bet
          </Button>
        </div>
      </div>
    </div>
  );
}
