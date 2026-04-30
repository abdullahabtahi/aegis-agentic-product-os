"use client";

/**
 * Pipeline Theater — Home page for judges and founders.
 *
 * Makes the 5-stage agentic pipeline immediately visible and interactive:
 * - 5 stage cards with live status (idle / running / complete / error)
 * - Stage 2 (Product Brain): expandable Cynic vs. Optimist debate panel
 * - Stage 4 (Governor): expandable 8-check policy checklist
 * - Active Directions: each bet card has a one-click "Scan ▶" button
 *
 * All data from useAgentStateSync (CopilotKit AG-UI state).
 * No fake or hardcoded pipeline data — idle state shows placeholders.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Network, Brain, GitBranch, Gavel, Terminal,
  ChevronDown, ChevronRight, Zap, Loader2,
  CheckCircle2, XCircle, Minus, TrendingDown, TrendingUp,
  WifiOff, MessageSquare,
} from "lucide-react";
import Link from "next/link";
import { useChatController } from "@/hooks/useChatController";
import { useAgentStateSync } from "@/hooks/useAgentStateSync";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import { useWorkspaceId } from "@/hooks/useWorkspaceId";
import { listBets } from "@/lib/api";
import type { PipelineStageName, PipelineStage, CynicAssessment, OptimistAssessment, PolicyCheck } from "@/lib/types";
import type { LucideIcon } from "lucide-react";

// ─── helpers ───────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function deriveElapsed(stage: PipelineStage): string | null {
  if (stage.status !== "complete") return null;
  if (!stage.started_at || !stage.completed_at) return null;
  const elapsed = (new Date(stage.completed_at).getTime() - new Date(stage.started_at).getTime()) / 1000;
  if (elapsed <= 0) return null;
  return `${elapsed.toFixed(1)}s`;
}

const STATUS_CONFIG = {
  running:  { label: "RUNNING",  cls: "text-indigo-600 bg-indigo-600/10",   dot: "bg-indigo-500 animate-pulse" },
  complete: { label: "COMPLETE", cls: "text-emerald-600 bg-emerald-500/10", dot: "bg-emerald-500" },
  error:    { label: "ERROR",    cls: "text-red-600 bg-red-500/10",         dot: "bg-red-500" },
  pending:  { label: "IDLE",     cls: "text-slate-500 bg-slate-200/50",     dot: "bg-slate-300" },
} as const;

// ─── stage config ──────────────────────────────────────────────────────────

interface StageConfig {
  num: string;
  key: PipelineStageName;
  label: string;
  icon: LucideIcon;
  description: string;
}

const STAGES: StageConfig[] = [
  { num: "1", key: "signal_engine",  label: "Signal Engine",  icon: Network,   description: "Reads 14-day Linear window, computes 9 risk signals" },
  { num: "2", key: "product_brain",  label: "Product Brain",  icon: Brain,     description: "Cynic ↔ Optimist debate → Synthesis classification" },
  { num: "3", key: "coordinator",    label: "Coordinator",    icon: GitBranch, description: "Picks escalation level & action type for the risk" },
  { num: "4", key: "governor",       label: "Governor",       icon: Gavel,     description: "8 deterministic policy checks — no LLM, hard rules" },
  { num: "5", key: "executor",       label: "Executor",       icon: Terminal,  description: "Posts Linear comment, creates issue, or awaits approval" },
];

const POLICY_CHECKS_META: { key: string; label: string }[] = [
  { key: "confidence_floor",      label: "Confidence Floor (≥ 0.65)" },
  { key: "duplicate_suppression", label: "Duplicate Suppression (30-day)" },
  { key: "rate_cap",              label: "Rate Cap (1/week per bet)" },
  { key: "jules_gate",            label: "Jules Gate (GitHub required)" },
  { key: "reversibility",         label: "Reversibility Check" },
  { key: "acknowledged_risk",     label: "Acknowledged Risk Override" },
  { key: "control_level",         label: "Control Level Policy" },
  { key: "escalation_ladder",     label: "Escalation Ladder" },
];

// ─── sub-components ────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.7 ? "bg-red-400" : value >= 0.5 ? "bg-amber-400" : "bg-slate-300";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-slate-200/60">
        <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-mono text-slate-500">{pct}%</span>
    </div>
  );
}

function DebatePanel({ cynic, optimist, synthesis }: {
  cynic?: CynicAssessment;
  optimist?: OptimistAssessment;
  synthesis?: Record<string, unknown>;
}) {
  if (!cynic && !optimist) {
    return (
      <div className="mt-3 rounded-xl border border-slate-200/50 bg-white/20 p-4 text-center text-xs text-muted-foreground">
        Run a scan to see the Cynic ↔ Optimist debate
      </div>
    );
  }
  return (
    <div className="mt-3 flex flex-col gap-2">
      {cynic && (
        <div className="rounded-xl border border-red-200/50 bg-red-50/30 p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <TrendingDown size={13} className="text-red-500 shrink-0" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-red-600">Cynic</span>
            <span className="ml-auto rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
              {cynic.risk_type !== "none" ? cynic.risk_type.replace(/_/g, " ") : "no risk"}
            </span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{cynic.severity}</span>
          </div>
          <ConfidenceBar value={cynic.confidence} />
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">{cynic.key_concerns}</p>
        </div>
      )}
      {optimist && (
        <div className="rounded-xl border border-emerald-200/50 bg-emerald-50/30 p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <TrendingUp size={13} className="text-emerald-600 shrink-0" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-700">Optimist</span>
            <span className="ml-auto rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
              {optimist.risk_type !== "none" ? optimist.risk_type.replace(/_/g, " ") : "no risk"}
            </span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{optimist.adjusted_severity}</span>
          </div>
          <ConfidenceBar value={optimist.confidence} />
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">{optimist.mitigating_factors}</p>
        </div>
      )}
      {!!synthesis?.risk_type && (
        <div className="rounded-xl border border-indigo-200/50 bg-indigo-50/30 p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <Brain size={13} className="text-indigo-600 shrink-0" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-700">Synthesis Verdict</span>
            <span className="ml-auto rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
              {String(synthesis.risk_type).replace(/_/g, " ")}
            </span>
          </div>
          {typeof synthesis.confidence === "number" && <ConfidenceBar value={synthesis.confidence} />}
          {!!synthesis.headline && <p className="mt-1.5 text-[11px] font-medium text-slate-700">{String(synthesis.headline)}</p>}
          {!!synthesis.classification_rationale && (
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{String(synthesis.classification_rationale)}</p>
          )}
        </div>
      )}
    </div>
  );
}

function GovernorChecklist({ policyChecks, denialReason }: {
  policyChecks?: PolicyCheck[];
  denialReason?: string | null;
}) {
  if (!policyChecks || policyChecks.length === 0) {
    return (
      <div className="mt-3 rounded-xl border border-slate-200/50 bg-white/20 p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">8 Policy Checks</p>
        <div className="flex flex-col gap-1">
          {POLICY_CHECKS_META.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-2 px-1 py-0.5">
              <Minus size={11} className="shrink-0 text-slate-300" />
              <span className="text-[11px] text-slate-400">{label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const checkMap = new Map(policyChecks.map((c) => [c.check_name, c]));

  return (
    <div className="mt-3 rounded-xl border border-slate-200/50 bg-white/20 p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
        8 Policy Checks · {policyChecks.filter((c) => c.passed).length}/{policyChecks.length} passed
      </p>
      <div className="flex flex-col gap-1">
        {POLICY_CHECKS_META.map(({ key, label }) => {
          const check = checkMap.get(key);
          const isFailed = check ? !check.passed : (denialReason === key);
          const isPassed = check?.passed ?? false;
          return (
            <div
              key={key}
              className={`flex items-start gap-2 rounded px-2 py-0.5 text-[11px] ${isFailed ? "bg-red-50/50 border-l-2 border-red-400" : ""}`}
            >
              {!check ? (
                <Minus size={11} className="mt-0.5 shrink-0 text-slate-300" />
              ) : isPassed ? (
                <CheckCircle2 size={11} className="mt-0.5 shrink-0 text-emerald-500" />
              ) : (
                <XCircle size={11} className="mt-0.5 shrink-0 text-red-500" />
              )}
              <div className="min-w-0">
                <span className={isFailed ? "font-semibold text-red-700" : isPassed ? "text-slate-600" : "text-slate-400"}>
                  {label}
                </span>
                {isFailed && check?.reason && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">{check.reason}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── main page ─────────────────────────────────────────────────────────────

export default function PipelineTheaterPage() {
  const { sendMessage, isLoading } = useChatController();
  const { state: pipelineState } = useAgentStateSync();
  const backendHealth = useBackendHealth();
  const workspaceId = useWorkspaceId();

  const [expandedStage, setExpandedStage] = useState<PipelineStageName | null>(null);
  const [scanningBetId, setScanningBetId] = useState<string | null>(null);

  const { data: bets = [], isLoading: betsLoading } = useQuery({
    queryKey: ["bets", workspaceId],
    queryFn: () => listBets(workspaceId),
    staleTime: 15_000,
    enabled: workspaceId !== "default_workspace",
  });

  const activeBets = bets.filter((b) => b.status === "active" || b.status === "detecting");

  const lastScan = bets.reduce<string | null>((latest, b) => {
    if (!b.last_monitored_at) return latest;
    return !latest || b.last_monitored_at > latest ? b.last_monitored_at : latest;
  }, null);

  const pipelineStatus = pipelineState?.pipeline_status ?? "idle";
  const isPipelineRunning = pipelineStatus === "scanning" || pipelineStatus === "analyzing";

  const synthesis = (() => {
    const draft = pipelineState?.risk_signal_draft;
    if (!draft) return undefined;
    if (typeof draft === "string") {
      try { return JSON.parse(draft) as Record<string, unknown>; } catch { return undefined; }
    }
    return draft as unknown as Record<string, unknown>;
  })();

  function handleScan(bet: { id: string; name: string }) {
    setScanningBetId(bet.id);
    sendMessage(`Scan my ${bet.name} direction for risks`);
    setTimeout(() => setScanningBetId(null), 30_000);
  }

  function toggleExpand(key: PipelineStageName) {
    setExpandedStage((prev) => (prev === key ? null : key));
  }

  const governorDecision = pipelineState?.governor_decision;

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-6">
      <div className="mx-auto w-full max-w-5xl flex flex-col gap-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-heading text-xl font-bold text-foreground/90">Agentic Pipeline</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              5-stage autonomous risk detection · Signal Engine → Product Brain → Coordinator → Governor → Executor
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastScan && (
              <span className="text-[11px] text-muted-foreground">Last scan {timeAgo(lastScan)}</span>
            )}
            <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold ${
              isPipelineRunning        ? "bg-indigo-100 text-indigo-700" :
              pipelineStatus === "complete"           ? "bg-emerald-100 text-emerald-700" :
              pipelineStatus === "awaiting_approval"  ? "bg-amber-100 text-amber-700" :
              pipelineStatus === "error"              ? "bg-red-100 text-red-700" :
              "bg-slate-100 text-slate-500"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${
                isPipelineRunning        ? "bg-indigo-500 animate-pulse" :
                pipelineStatus === "complete"           ? "bg-emerald-500" :
                pipelineStatus === "awaiting_approval"  ? "bg-amber-500 animate-pulse" :
                pipelineStatus === "error"              ? "bg-red-500" :
                "bg-slate-300"
              }`} />
              {pipelineStatus.replace(/_/g, " ").toUpperCase()}
            </div>
          </div>
        </div>

        {backendHealth === "offline" && (
          <div className="flex items-center gap-2.5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-sm text-amber-700">
            <WifiOff size={14} />
            <span>Backend offline — pipeline will not run until backend is started.</span>
          </div>
        )}

        {/* ── Pipeline Stage Cards ── */}
        <div className="flex flex-col gap-3">
          {STAGES.map((stage) => {
            const liveStage = pipelineState?.stages?.find((s) => s.name === stage.key);
            const status = liveStage?.status ?? "pending";
            const { label: statusLabel, cls: statusClass, dot: dotClass } = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
            const elapsed = liveStage ? deriveElapsed(liveStage) : null;
            const isExpanded = expandedStage === stage.key;
            const hasExpandable = stage.key === "product_brain" || stage.key === "governor";
            const Icon = stage.icon;

            return (
              <div key={stage.key} className="glass-panel rounded-2xl overflow-hidden">
                <div
                  className={`flex items-center gap-4 p-4 ${hasExpandable ? "cursor-pointer hover:bg-white/10 transition-colors" : ""}`}
                  onClick={hasExpandable ? () => toggleExpand(stage.key) : undefined}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/50 shadow-sm">
                    <Icon size={20} className="text-[#112478]" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-medium uppercase tracking-widest text-slate-400">Stage {stage.num}</span>
                      <h3 className="font-heading text-sm font-semibold text-[#1a1c1d]">{stage.label}</h3>
                      {elapsed && <span className="text-[11px] text-muted-foreground">({elapsed})</span>}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{stage.description}</p>
                  </div>
                  <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold shrink-0 ${statusClass}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                    {statusLabel}
                  </div>
                  {hasExpandable && (
                    <div className="ml-1 shrink-0 text-slate-400">
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </div>
                  )}
                </div>

                {stage.key === "product_brain" && isExpanded && (
                  <div className="border-t border-white/20 px-4 pb-4 pt-3">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                      Adversarial Debate — Cynic vs. Optimist vs. Synthesis
                    </p>
                    <DebatePanel
                      cynic={pipelineState?.cynic_assessment}
                      optimist={pipelineState?.optimist_assessment}
                      synthesis={synthesis}
                    />
                  </div>
                )}

                {stage.key === "governor" && isExpanded && (
                  <div className="border-t border-white/20 px-4 pb-4 pt-3">
                    <GovernorChecklist
                      policyChecks={pipelineState?.policy_checks}
                      denialReason={governorDecision?.denial_reason ?? null}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Active Directions with Scan ▶ buttons ── */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-heading text-sm font-semibold text-foreground/80">Active Directions</h2>
            <Link href="/workspace/directions" className="text-[11px] font-medium text-indigo-600 hover:opacity-70 transition-opacity">
              Manage all →
            </Link>
          </div>

          {betsLoading ? (
            <div className="rounded-xl border border-white/20 bg-white/10 p-6 text-center text-xs text-muted-foreground">
              Loading directions…
            </div>
          ) : activeBets.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-white/20 bg-white/10 p-8 text-center">
              <Zap size={22} className="text-indigo-300" />
              <p className="text-sm font-medium text-foreground/60">No active directions yet</p>
              <p className="text-xs text-muted-foreground">Declare a direction from the Chat page to start scanning.</p>
              <Link
                href="/workspace/chat"
                className="mt-1 flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
              >
                <MessageSquare size={12} />
                Go to Chat
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {activeBets.map((bet) => {
                const isScanningThis = scanningBetId === bet.id;
                const name = String(bet.name ?? "Untitled");
                const desc = String(bet.problem_statement ?? bet.hypothesis ?? "");
                const segment = String(bet.target_segment ?? "");
                return (
                  <div key={bet.id} className="glass-panel rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-heading text-sm font-semibold text-[#1a1c1d] truncate">{name}</h4>
                        {desc && (
                          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground line-clamp-2">{desc}</p>
                        )}
                        {segment && (
                          <span className="mt-1.5 inline-block rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            {segment}
                          </span>
                        )}
                      </div>
                      {bet.last_monitored_at && (
                        <span className="shrink-0 text-[10px] text-muted-foreground whitespace-nowrap">
                          {timeAgo(bet.last_monitored_at)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleScan({ id: bet.id, name })}
                        disabled={isLoading || isScanningThis || backendHealth === "offline"}
                        className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isScanningThis ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                        {isScanningThis ? "Scanning…" : "Scan ▶"}
                      </button>
                      <Link
                        href={`/workspace/directions/${bet.id}`}
                        className="flex items-center gap-1 rounded-lg border border-white/30 bg-white/20 px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-white/40 transition-colors"
                      >
                        View
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-muted-foreground pb-2">
          Click <strong>Scan ▶</strong> on a direction to watch the 5-stage pipeline run live above.{" "}
          The <strong>Product Brain</strong> and <strong>Governor</strong> cards are expandable.
        </p>
      </div>
    </div>
  );
}
