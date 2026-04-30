"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Shield, WifiOff, AlertTriangle, Sparkles, ScanSearch, Bell, MessageSquare } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { CommandBar, type CommandBarHandle } from "@/components/chat/CommandBar";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { BetDeclarationModal } from "@/components/bets/BetDeclarationModal";
import { BriefCard } from "@/components/chat/BriefCard";
import { useChatController } from "@/hooks/useChatController";
import { useAgentStateSync } from "@/hooks/useAgentStateSync";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import { useWorkspaceId } from "@/hooks/useWorkspaceId";
import { useBrief } from "@/hooks/useBrief";
import { useWeeklyBriefTrigger } from "@/hooks/useWeeklyBriefTrigger";
import { getSessionMessages } from "@/lib/api";
import type { SessionMessage } from "@/lib/api";

const QUICK_ACTIONS = [
  "What's killing this company in 90 days?",
  "Which direction should I drop?",
  "What signal shifted since last week?",
  "Give me a 60-second board update",
] as const;

const ENTRY_CARDS = [
  {
    icon: ScanSearch,
    color: "from-indigo-500 to-violet-600",
    glow: "shadow-indigo-500/20",
    title: "Scan for Risks",
    description: "Run a full autonomous pre-mortem on your active strategic directions.",
    action: "Start scan",
    kind: "send" as const,
    prompt: "Scan my active directions for risks",
  },
  {
    icon: Bell,
    color: "from-amber-400 to-orange-500",
    glow: "shadow-amber-500/20",
    title: "Review Interventions",
    description: "See what Aegis flagged and decide which actions to approve or suppress.",
    action: "Open inbox",
    kind: "navigate" as const,
    href: "/workspace/inbox",
  },
  {
    icon: MessageSquare,
    color: "from-sky-400 to-cyan-500",
    glow: "shadow-sky-500/20",
    title: "Ask Anything",
    description: "Query risk signals, explain decisions, or get a plain-English summary.",
    action: "Type a question",
    kind: "focus" as const,
  },
] as const;

export default function ChatPage() {
  const { messages, sendMessage, isLoading, stopGeneration, hasMessages } = useChatController();
  const { state: pipelineState } = useAgentStateSync();
  const backendHealth = useBackendHealth();
  const workspaceId = useWorkspaceId();
  const router = useRouter();
  const commandBarRef = useRef<CommandBarHandle>(null);
  const [showBetModal, setShowBetModal] = useState(false);
  const brief = useBrief(workspaceId);
  const { shouldShow: shouldShowBrief, dismiss: dismissBrief } = useWeeklyBriefTrigger();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");
  const betId = searchParams.get("bet");
  const [restoredMessages, setRestoredMessages] = useState<SessionMessage[]>([]);

  // Auto-fire scan when navigating from a direction card's "Scan for risks" button.
  // Waits for CopilotKit to be ready (isLoading === false) before sending.
  const autoSentRef = useRef(false);
  useEffect(() => {
    if (!betId || isLoading || hasMessages || autoSentRef.current) return;
    autoSentRef.current = true;
    sendMessage(`Scan direction ${betId} for risks`);
  }, [betId, isLoading, hasMessages, sendMessage]);

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
        workspaceId={workspaceId}
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

      {/* ── HERO MODE ── */}
      {!hasMessages && restoredMessages.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center px-6">

          {/* Logo + headline */}
          <motion.div
            className="flex flex-col items-center text-center"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 35 }}
          >
            <div className="relative mb-4">
              <span className="absolute -inset-3 rounded-2xl bg-indigo-500/10 blur-xl" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-xl shadow-indigo-500/30">
                <Shield size={30} className="text-white" strokeWidth={1.5} />
              </div>
            </div>
            <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground/90">Aegis</h1>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground leading-relaxed">
              Autonomous pre-mortem for your strategic directions. Declare one and I&apos;ll scan it for risks automatically.
            </p>
          </motion.div>

          {/* ── Entry point cards ── */}
          <AnimatePresence>
            {shouldShowBrief && brief.data && (
              <motion.div
                className="mt-6 w-full max-w-sm"
                initial={{ opacity: 0, y: -12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              >
                <BriefCard brief={brief.data} onDismiss={dismissBrief} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Entry point cards ── */}
          <motion.div
            className="mt-8 grid w-full max-w-3xl grid-cols-3 gap-4"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 380, damping: 35 }}
          >
            {ENTRY_CARDS.map((card) => (
              <motion.button
                key={card.title}
                onClick={() => {
                  if (card.kind === "send") {
                    sendMessage(card.prompt);
                  } else if (card.kind === "navigate") {
                    router.push(card.href);
                  } else {
                    commandBarRef.current?.focus();
                  }
                }}
                disabled={card.kind === "send" && (isLoading || backendHealth === "offline")}
                className="glass-panel group flex flex-col items-start gap-3 rounded-2xl p-5 text-left transition-shadow hover:shadow-xl hover:shadow-indigo-500/8 disabled:opacity-40"
                whileHover={{ y: -3 }}
                transition={{ type: "spring", stiffness: 380, damping: 35 }}
              >
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${card.color} shadow-md ${card.glow}`}>
                  <card.icon size={17} className="text-white" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground/85 group-hover:text-foreground/95 transition-colors">{card.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{card.description}</p>
                </div>
                <span className="mt-auto text-[11px] font-semibold text-indigo-500/80 group-hover:text-indigo-600 transition-colors">
                  {card.action} →
                </span>
              </motion.button>
            ))}
          </motion.div>

          {/* Quick action chips */}
          <motion.div
            className="mt-5 flex flex-wrap justify-center gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            {QUICK_ACTIONS.map((prompt) => (
              <motion.button
                key={prompt}
                onClick={() => sendMessage(prompt)}
                disabled={isLoading || backendHealth === "offline"}
                className="flex items-center gap-1.5 rounded-full border border-white/35 bg-white/45 px-4 py-2 text-xs font-medium text-foreground/55 backdrop-blur-sm transition-colors hover:border-indigo-200/60 hover:bg-indigo-50/60 hover:text-indigo-600 disabled:opacity-40"
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 380, damping: 35 }}
              >
                <Sparkles size={10} className="text-indigo-400/70" />
                {prompt}
              </motion.button>
            ))}
          </motion.div>

          {/* Command bar */}
          <motion.div
            className="mt-5 w-full max-w-2xl"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14, type: "spring", stiffness: 380, damping: 35 }}
          >
            <CommandBar
              ref={commandBarRef}
              onSend={sendMessage}
              isLoading={isLoading}
              onStop={stopGeneration}
              disabled={backendHealth === "offline"}
              onNewDirection={() => setShowBetModal(true)}
              hero
            />
          </motion.div>
        </div>
      )}

      {/* ── CHAT MODE — after first message OR when restoring a session ── */}
      {(hasMessages || restoredMessages.length > 0) && (
        <>
          {/* Scrollable messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="mx-auto max-w-3xl">
              <AnimatePresence>
                {shouldShowBrief && brief.data && (
                  <motion.div
                    className="mb-4"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  >
                    <BriefCard brief={brief.data} onDismiss={dismissBrief} />
                  </motion.div>
                )}
              </AnimatePresence>
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
