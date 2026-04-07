"use client";

/**
 * AgentWorkflowFeed — Left panel of the Agentic Command Center.
 *
 * Displays the real-time ADK pipeline activity feed:
 *   • Signal Engine fetching Linear data
 *   • ProductBrain Cynic / Optimist debate logs
 *   • Governor policy outcomes
 *
 * Derives all data from `AegisPipelineState` (no extra API calls).
 * Each pipeline checkpoint transition mounts a new FeedEntry.
 */

import { useEffect, useRef, useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { AegisPipelineState, EvidenceIssue } from "@/lib/types";
import {
  Database,
  Brain,
  Shield,
  Zap,
  CheckCircle2,
  XCircle,
  Loader2,
  TrendingDown,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

type FeedEntryType =
  | "scan_start"
  | "signal_engine"
  | "product_brain_debate"
  | "governor_check"
  | "awaiting_approval"
  | "executor_result"
  | "error";

interface FeedEntry {
  id: string;
  type: FeedEntryType;
  timestamp: string;
  title: string;
  detail?: string;
  status: "running" | "done" | "denied" | "error";
  evidenceIssues?: EvidenceIssue[];
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function now(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function buildFeedFromState(state: AegisPipelineState): FeedEntry[] {
  const entries: FeedEntry[] = [];

  const checkpoint = state.pipeline_checkpoint ?? "";
  const status = state.pipeline_status ?? "";

  // Always show scan start if pipeline has begun
  if (checkpoint || state.bet) {
    entries.push({
      id: "scan-start",
      type: "scan_start",
      timestamp: now(),
      title: "Scan initiated",
      detail: state.bet ? `Bet: "${state.bet.name}"` : "Loading bet context…",
      status: "done",
    });
  }

  // Signal Engine completed
  if (
    checkpoint &&
    checkpoint !== "" &&
    state.linear_signals
  ) {
    const signals = state.linear_signals as Record<string, unknown>;
    const coverage = signals.bet_coverage_pct as number | undefined;
    const rollovers = signals.chronic_rollover_count as number | undefined;
    const evidenceIssues = signals.evidence_issues as EvidenceIssue[] | undefined;

    entries.push({
      id: "signal-engine",
      type: "signal_engine",
      timestamp: now(),
      title: "Signal Engine — Linear data fetched",
      detail: [
        coverage !== undefined
          ? `Coverage: ${(coverage * 100).toFixed(0)}%`
          : null,
        rollovers !== undefined ? `Chronic rollovers: ${rollovers}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      status: "done",
      evidenceIssues,
    });
  }

  // Product Brain running (checkpoint = signal_engine_complete → product_brain starts)
  if (checkpoint === "signal_engine_complete") {
    entries.push({
      id: "pb-running",
      type: "product_brain_debate",
      timestamp: now(),
      title: "Product Brain — Adversarial debate",
      detail: "Cynic · Optimist · Synthesis in progress…",
      status: "running",
    });
  }

  // Product Brain complete
  if (
    checkpoint === "product_brain_complete" ||
    checkpoint === "coordinator_complete" ||
    checkpoint === "governor_complete" ||
    checkpoint === "awaiting_founder_approval" ||
    checkpoint === "founder_approved" ||
    checkpoint === "founder_rejected" ||
    checkpoint === "executor_complete"
  ) {
    const riskDraft =
      typeof state.risk_signal_draft === "object" &&
      state.risk_signal_draft !== null
        ? (state.risk_signal_draft as Record<string, unknown>)
        : null;

    entries.push({
      id: "pb-done",
      type: "product_brain_debate",
      timestamp: now(),
      title: "Product Brain — Signal classified",
      detail: riskDraft
        ? `${String(riskDraft.risk_type ?? "").replace(/_/g, " ")} · confidence ${((riskDraft.confidence as number) * 100).toFixed(0)}%`
        : "Confidence below threshold — no signal surfaced",
      status: "done",
    });
  }

  // Governor run
  if (
    checkpoint === "governor_complete" ||
    checkpoint === "awaiting_founder_approval" ||
    checkpoint === "founder_approved" ||
    checkpoint === "founder_rejected" ||
    checkpoint === "executor_complete"
  ) {
    const gov = state.governor_decision;
    entries.push({
      id: "governor",
      type: "governor_check",
      timestamp: now(),
      title: `Governor — 8-point policy check`,
      detail: gov
        ? gov.approved
          ? "All checks passed · Awaiting founder decision"
          : `Denied: ${(gov.denial_reason ?? "").replace(/_/g, " ")}`
        : "Running…",
      status: gov
        ? gov.approved
          ? "done"
          : "denied"
        : "running",
    });
  }

  // Awaiting approval
  if (status === "awaiting_founder_approval") {
    entries.push({
      id: "hitl",
      type: "awaiting_approval",
      timestamp: now(),
      title: "Awaiting your decision",
      detail: "Agent paused · Intervention proposal ready for review",
      status: "running",
    });
  }

  // Executor result
  if (checkpoint === "executor_complete" && state.executor_result) {
    const res = state.executor_result as Record<string, unknown>;
    entries.push({
      id: "executor",
      type: "executor_result",
      timestamp: now(),
      title: "Executor — Action completed",
      detail: res.message ? String(res.message) : "Linear write executed",
      status: "done",
    });
  }

  return entries;
}

// ─────────────────────────────────────────────
// ICON MAP
// ─────────────────────────────────────────────

const ENTRY_ICONS: Record<FeedEntryType, React.ElementType> = {
  scan_start: Zap,
  signal_engine: Database,
  product_brain_debate: Brain,
  governor_check: Shield,
  awaiting_approval: AlertTriangle,
  executor_result: CheckCircle2,
  error: XCircle,
};

const ENTRY_COLORS: Record<FeedEntryType, string> = {
  scan_start: "text-cyan-400",
  signal_engine: "text-blue-400",
  product_brain_debate: "text-violet-400",
  governor_check: "text-amber-400",
  awaiting_approval: "text-orange-400",
  executor_result: "text-emerald-400",
  error: "text-red-400",
};

// ─────────────────────────────────────────────
// EMPTY STATE
// ─────────────────────────────────────────────

function EmptyFeed() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 opacity-40 select-none">
      <Zap className="size-10 text-cyan-400 animate-pulse" />
      <p className="text-xs text-white/50 text-center leading-relaxed max-w-[180px]">
        Trigger a workspace scan to watch Aegis reason in real time
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────
// FEED ENTRY
// ─────────────────────────────────────────────

function FeedItem({ entry }: { entry: FeedEntry }) {
  const Icon = ENTRY_ICONS[entry.type];
  const iconColor = ENTRY_COLORS[entry.type];

  return (
    <div className="flex gap-3 group animate-in fade-in slide-in-from-bottom-2 duration-400">
      {/* Icon + connector line */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full",
            "bg-white/5 ring-1 ring-white/10",
            entry.status === "running" && "ring-cyan-500/40 bg-cyan-500/10"
          )}
        >
          {entry.status === "running" ? (
            <Loader2 className="size-3.5 text-cyan-400 animate-spin" />
          ) : (
            <Icon className={cn("size-3.5", iconColor)} />
          )}
        </div>
        <div className="w-px flex-1 bg-white/6 mt-1 group-last:hidden" />
      </div>

      {/* Content */}
      <div className="pb-5 flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[11px] font-semibold text-white/80 truncate">
            {entry.title}
          </span>
          {entry.status === "denied" && (
            <Badge className="text-[9px] py-0 px-1 bg-red-500/10 text-red-400 border-red-500/20">
              DENIED
            </Badge>
          )}
          {entry.status === "running" && (
            <Badge className="text-[9px] py-0 px-1 bg-cyan-500/10 text-cyan-400 border-cyan-500/20">
              LIVE
            </Badge>
          )}
        </div>
        {entry.detail && (
          <p className="text-[10px] text-white/40 leading-relaxed">
            {entry.detail}
          </p>
        )}

        {/* Render Evidence Issues if they exist */}
        {entry.evidenceIssues && entry.evidenceIssues.length > 0 && (
          <div className="mt-2 space-y-1 bg-white/[0.02] border border-white/5 rounded-md p-2">
            <div className="text-[9px] font-semibold tracking-widest uppercase text-white/30 mb-1.5 flex items-center justify-between">
              <span>Evidence Feed ({entry.evidenceIssues.length})</span>
            </div>
            {entry.evidenceIssues.map((issue) => (
              <a 
                key={issue.id} 
                href={issue.url} 
                target="_blank" 
                rel="noreferrer"
                className="flex items-center justify-between group/issue hover:bg-white/[0.04] p-1 rounded transition-colors"
                title={`${issue.id}: ${issue.title}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    issue.status.toLowerCase().includes("done") || issue.status.toLowerCase().includes("completed") ? "bg-emerald-400" :
                    issue.status.toLowerCase().includes("in progress") ? "bg-amber-400" : "bg-white/20"
                  )} />
                  <span className="text-[10px] text-white/60 group-hover/issue:text-white/90 truncate font-medium">
                    {issue.title}
                  </span>
                </div>
                <ExternalLink className="size-2.5 text-white/10 group-hover/issue:text-white/40 shrink-0 ml-2" />
              </a>
            ))}
          </div>
        )}

        <span className="text-[9px] font-mono text-white/20 mt-0.5 block">
          [{entry.timestamp}]
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────

interface AgentWorkflowFeedProps {
  agentState: AegisPipelineState;
  className?: string;
}

export function AgentWorkflowFeed({
  agentState,
  className,
}: AgentWorkflowFeedProps) {
  const entries = useMemo(
    () => buildFeedFromState(agentState),
    [
      agentState.pipeline_checkpoint,
      agentState.pipeline_status,
      agentState.linear_signals,
      agentState.risk_signal_draft,
      agentState.governor_decision,
      agentState.executor_result,
      agentState.bet?.name,
    ]
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const [prevCheckpoint, setPrevCheckpoint] = useState<string | undefined>(
    undefined
  );

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (agentState.pipeline_checkpoint !== prevCheckpoint) {
      setPrevCheckpoint(agentState.pipeline_checkpoint);
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [agentState.pipeline_checkpoint, prevCheckpoint]);

  const isIdle = entries.length === 0;
  const checkpoint = agentState.pipeline_checkpoint ?? "";

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "size-1.5 rounded-full",
              agentState.pipeline_status === "awaiting_founder_approval"
                ? "bg-orange-400 animate-pulse"
                : isIdle
                  ? "bg-white/20"
                  : "bg-cyan-400 animate-pulse"
            )}
          />
          <span className="text-[11px] font-semibold tracking-widest uppercase text-white/50">
            Agent Workflow Feed
          </span>
        </div>
        {checkpoint && (
          <span className="text-[9px] font-mono text-white/25 border border-white/8 px-1.5 py-0.5 rounded">
            {checkpoint.replace(/_/g, " ")}
          </span>
        )}
      </div>

      {/* Feed entries */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 scrollbar-thin scrollbar-thumb-white/10">
        {isIdle ? (
          <EmptyFeed />
        ) : (
          <div className="space-y-0">
            {entries.map((entry) => (
              <FeedItem key={entry.id} entry={entry} />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Footer status */}
      {!isIdle && (
        <div className="px-4 py-2.5 border-t border-white/6 shrink-0">
          <div className="flex items-center gap-1.5">
            <TrendingDown className="size-3 text-white/20" />
            <span className="text-[9px] text-white/25">
              {entries.length} event{entries.length !== 1 ? "s" : ""} ·{" "}
              {agentState.bet?.name ?? "no bet loaded"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
