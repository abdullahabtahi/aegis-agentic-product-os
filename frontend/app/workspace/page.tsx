"use client";

/**
 * Home Page — Perplexity-style glassmorphic workspace.
 *
 * Two states:
 * - HERO: centered logo + feature cards + chips + command bar (before any message)
 * - CHAT: messages fill screen, command bar stays at bottom (after first message)
 *
 * Backend health shown inline so connectivity issues are visible immediately.
 */

import { useState } from "react";
import { Shield, Radar, Brain, Zap, WifiOff, AlertTriangle, Sparkles, GitBranch } from "lucide-react";
import { CommandBar } from "@/components/chat/CommandBar";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { BetDeclarationModal } from "@/components/bets/BetDeclarationModal";
import { useChatController } from "@/hooks/useChatController";
import { useAgentStateSync } from "@/hooks/useAgentStateSync";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import type { Bet } from "@/lib/types";

const FEATURE_CARDS = [
  { icon: Radar, title: "Signal Engine", description: "Monitors Linear for strategy drift, missing metrics, and execution blockers.", color: "text-indigo-500", bg: "bg-indigo-500/10" },
  { icon: Brain, title: "Product Brain", description: "Debate-pattern risk classification with confidence scoring.", color: "text-violet-500", bg: "bg-violet-500/10" },
  { icon: GitBranch, title: "Coordinator", description: "Orchestrates multi-agent responses and recommends bounded interventions.", color: "text-sky-500", bg: "bg-sky-500/10" },
  { icon: Shield, title: "Governor", description: "8 deterministic policy checks — safe, bounded interventions.", color: "text-emerald-500", bg: "bg-emerald-500/10" },
  { icon: Zap, title: "Executor", description: "Creates issues, adds comments, or escalates for approval.", color: "text-amber-500", bg: "bg-amber-500/10" },
] as const;

const QUICK_ACTIONS = [
  "Scan my active direction for risks",
  "What's the current strategy risk?",
  "Show recent interventions",
  "Explain strategy_unclear",
] as const;

export default function HomePage() {
  const { messages, sendMessage, isLoading, stopGeneration, hasMessages } = useChatController();
  const { state: pipelineState } = useAgentStateSync();
  const backendHealth = useBackendHealth();
  const [showBetModal, setShowBetModal] = useState(false);

  // When a direction is declared, send it as context to the agent and trigger a scan
  function handleBetDeclared(bet: Bet) {
    setShowBetModal(false);
    sendMessage(
      `I've declared a new strategic direction:\n\n**${bet.name}**\n- Segment: ${bet.target_segment}\n- Problem: ${bet.problem_statement}${bet.hypothesis ? `\n- Hypothesis: ${bet.hypothesis}` : ""}${bet.time_horizon ? `\n- Time horizon: ${bet.time_horizon}` : ""}\n\nPlease scan this direction for risks.`
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

      {/* ── HERO MODE — no messages yet ── */}
      {!hasMessages && (
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          {/* Logo */}
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25">
            <Shield size={30} className="text-white" />
          </div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground/90">Aegis</h1>
          <p className="mt-1.5 max-w-md text-center text-sm text-muted-foreground">
            Autonomous pre-mortem for your strategic directions. Declare one and I&apos;ll scan it for risks automatically.
          </p>

          {/* Feature cards */}
          <div className="mt-8 grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-5">
            {FEATURE_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.title} className="glass-panel-subtle flex flex-col gap-2.5 rounded-xl p-4 transition-all hover:bg-white/35">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${card.bg}`}>
                    <Icon size={18} className={card.color} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground/85">{card.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{card.description}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick action chips */}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
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

      {/* ── CHAT MODE — after first message ── */}
      {hasMessages && (
        <>
          {/* Scrollable messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="mx-auto max-w-3xl">
              <ChatMessages
                messages={messages}
                isLoading={isLoading}
                pipelineState={pipelineState}
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
