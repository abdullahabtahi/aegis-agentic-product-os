"use client";

/**
 * Home Page — Perplexity-style glassmorphic workspace.
 *
 * Two states:
 * - HERO: centered logo + live agentic stats + pipeline strip + chips + command bar
 * - CHAT: messages fill screen, command bar stays at bottom
 *
 * Backend health shown inline so connectivity issues are visible immediately.
 */

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Shield, WifiOff, AlertTriangle, Sparkles, ArrowRight, Network, Brain, GitBranch, Gavel, Terminal } from "lucide-react";
import Link from "next/link";

/** Lightweight relative time formatter — no external dependency. */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
import { CommandBar } from "@/components/chat/CommandBar";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { BetDeclarationModal } from "@/components/bets/BetDeclarationModal";
import { useChatController } from "@/hooks/useChatController";
import { useAgentStateSync } from "@/hooks/useAgentStateSync";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import { useWorkspaceId } from "@/hooks/useWorkspaceId";
import { getSessionMessages, listBets, getInterventions } from "@/lib/api";
import type { SessionMessage } from "@/lib/api";
import type { PipelineStageName } from "@/lib/types";

const QUICK_ACTIONS = [
  "Scan my active direction for risks",
  "What's the current strategy risk?",
  "Show recent interventions",
  "Explain strategy_unclear",
] as const;

const PIPELINE_STAGE_NAMES: { key: PipelineStageName; label: string; icon: React.ElementType }[] = [
  { key: "signal_engine", label: "Signal Engine", icon: Network },
  { key: "product_brain", label: "Product Brain", icon: Brain },
  { key: "coordinator", label: "Coordinator", icon: GitBranch },
  { key: "governor", label: "Governor", icon: Gavel },
  { key: "executor", label: "Executor", icon: Terminal },
];

export default function HomePage() {
  const { messages, sendMessage, isLoading, stopGeneration, hasMessages } = useChatController();
  const { state: pipelineState } = useAgentStateSync();
  const backendHealth = useBackendHealth();
  const workspaceId = useWorkspaceId();
  const [showBetModal, setShowBetModal] = useState(false);
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");
  const [restoredMessages, setRestoredMessages] = useState<SessionMessage[]>([]);

  // Live data for hero stats
  const { data: bets = [], isLoading: betsLoading } = useQuery({
    queryKey: ["bets", workspaceId],
    queryFn: () => listBets(workspaceId),
    staleTime: 15_000,
    enabled: workspaceId !== "default_workspace",
  });

  const { data: interventions = [], isLoading: interventionsLoading } = useQuery({
    queryKey: ["interventions", workspaceId],
    queryFn: () => getInterventions(workspaceId),
    staleTime: 15_000,
    enabled: workspaceId !== "default_workspace",
  });

  const pendingCount = interventions.filter((i) => i.status === "pending").length;
  const lastScan = bets.reduce<string | null>((latest, b) => {
    if (!b.last_monitored_at) return latest;
    return !latest || b.last_monitored_at > latest ? b.last_monitored_at : latest;
  }, null);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    getSessionMessages(sessionId)
      .then((msgs) => { if (active) setRestoredMessages(msgs); })
      .catch(() => { if (active) setRestoredMessages([]); });
    return () => {
      active = false;
      setRestoredMessages([]);
    };
  }, [sessionId]);

  function handleBetDeclared(bet: Record<string, unknown>) {
    setShowBetModal(false);
    const name = String(bet.name ?? "");
    const segment = String(bet.target_segment ?? "");
    const problem = String(bet.problem_statement ?? "");
    const hypothesis = String(bet.hypothesis ?? "");
    const horizon = String(bet.time_horizon ?? "");
    sendMessage(
      `I've declared a new strategic direction:\n\n**${name}**\n- Segment: ${segment}\n- Problem: ${problem}${hypothesis ? `\n- Hypothesis: ${hypothesis}` : ""}${horizon ? `\n- Time horizon: ${horizon}` : ""}\n\nPlease scan this direction for risks.`
    );
  }

  return (
    <div className="flex h-full flex-col">

      {/* Bet declaration modal */}
      <BetDeclarationModal
        open={showBetModal}
        workspaceId="default_workspace"
        onClose={() => setShowBetModal(false)}
        onBetDeclared={handleBetDeclared}
      />

      {/* Backend offline banner */}
      {backendHealth === "offline" && (
        <div className="mx-auto mb-3 flex w-full max-w-3xl items-center gap-2.5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-sm text-amber-700">
          <WifiOff size={15} />
          <span>Backend offline — start with <code className="font-mono text-xs">make run</code> in the backend directory.</span>
        </div>
      )}

      {/* ── HERO MODE — no messages yet and no restored session ── */}
      {!hasMessages && restoredMessages.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          {/* Logo */}
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25">
            <Shield size={30} className="text-white" />
          </div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground/90">Aegis</h1>
          <p className="mt-1.5 max-w-md text-center text-sm text-muted-foreground">
            Autonomous pre-mortem for your strategic directions. Declare one and I&apos;ll scan it for risks automatically.
          </p>

          {/* ── Live stat cards ── */}
          <div className="mt-8 grid w-full max-w-3xl grid-cols-3 gap-3">
            {/* Active Directions */}
            <Link
              href="/workspace/directions"
              className="glass-panel-subtle flex flex-col gap-1 rounded-xl p-4 transition-all hover:bg-white/35 group"
            >
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Active Directions</p>
              <p className="font-heading text-2xl font-bold text-foreground/90 group-hover:text-indigo-600 transition-colors">
                {betsLoading ? "—" : bets.length}
              </p>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                View all <ArrowRight size={9} />
              </p>
            </Link>

            {/* Pending Approvals */}
            <Link
              href="/workspace/inbox"
              className="glass-panel-subtle flex flex-col gap-1 rounded-xl p-4 transition-all hover:bg-white/35 group"
            >
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Pending Approvals</p>
              <p className={`font-heading text-2xl font-bold transition-colors ${interventionsLoading ? "text-foreground/90" : pendingCount > 0 ? "text-amber-600" : "text-foreground/90"} group-hover:text-indigo-600`}>
                {interventionsLoading ? "—" : pendingCount}
              </p>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                {pendingCount > 0 ? "Needs review" : "All clear"} <ArrowRight size={9} />
              </p>
            </Link>

            {/* Last Scan */}
            <div className="glass-panel-subtle flex flex-col gap-1 rounded-xl p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Last Scan</p>
              <p className="font-heading text-2xl font-bold text-foreground/90">
                {betsLoading ? "—" : lastScan ? timeAgo(lastScan) : "Never"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {lastScan ? "Aegis monitoring" : "Start by scanning a direction"}
              </p>
            </div>
          </div>

          {/* ── Pipeline status strip ── */}
          <div className="mt-4 flex w-full max-w-3xl items-center gap-2 rounded-xl border border-white/8 bg-white/4 px-4 py-2.5">
            <span className="text-[9px] font-semibold uppercase tracking-widest text-white/25 shrink-0 mr-1">Pipeline</span>
            {PIPELINE_STAGE_NAMES.map(({ key, label, icon: Icon }) => {
              const liveStage = pipelineState?.stages?.find((s) => s.name === key);
              const status = liveStage?.status ?? "pending";
              const dotColor =
                status === "running" ? "bg-indigo-500 animate-pulse" :
                status === "complete" ? "bg-emerald-500" :
                status === "error" ? "bg-red-500" :
                "bg-slate-400/50";
              return (
                <div key={key} className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1">
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
                  <Icon size={10} className="text-white/30 shrink-0" />
                  <span className="text-[10px] text-white/50">{label}</span>
                </div>
              );
            })}
          </div>

          {/* Quick action chips */}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {QUICK_ACTIONS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => sendMessage(prompt)}
                disabled={isLoading || backendHealth === "offline"}
                className="glass-panel-subtle flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium text-foreground/70 transition-all hover:bg-white/40 hover:text-foreground/90 disabled:opacity-40"
              >
                <Sparkles size={11} />
                {prompt}
              </button>
            ))}
          </div>

          {/* Command bar — + button opens Direction modal (Perplexity pattern) */}
          <div className="mt-6 w-full max-w-2xl">
            <CommandBar
              onSend={sendMessage}
              isLoading={isLoading}
              onStop={stopGeneration}
              disabled={backendHealth === "offline"}
              onNewDirection={() => setShowBetModal(true)}
            />
          </div>
        </div>
      )}

      {/* ── CHAT MODE — after first message OR when restoring a session ── */}
      {(hasMessages || restoredMessages.length > 0) && (
        <>
          {/* Scrollable messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="mx-auto max-w-3xl">
              <ChatMessages
                messages={messages}
                isLoading={isLoading}
                pipelineState={pipelineState}
                restoredMessages={restoredMessages}
              />
            </div>
          </div>

          {/* Sticky command bar */}
          <div className="sticky bottom-0 mx-auto w-full max-w-3xl px-4 pb-5">
            {backendHealth === "offline" && (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-amber-400/10 px-3 py-1.5 text-xs text-amber-700">
                <AlertTriangle size={12} />
                Backend offline — responses won&apos;t arrive until backend is running.
              </div>
            )}
            <CommandBar
              onSend={sendMessage}
              isLoading={isLoading}
              onStop={stopGeneration}
              placeholder="Follow up..."
              disabled={backendHealth === "offline"}
            />
          </div>
        </>
      )}
    </div>
  );
}
