"use client";

/**
 * BoardroomRoom — root live orchestrator.
 *
 * Phase: live → deliberating → verdict
 *
 * AudioContext autoplay fix: captureCtx is created synchronously in the
 * "Begin Boardroom" click handler in the parent page, then passed here as a prop.
 * initWithContext() is called in useEffect — the context was already unlocked by
 * the user gesture, so this is safe.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGeminiLive } from "@/hooks/useGeminiLive";
import { useAudioPipeline } from "@/hooks/useAudioPipeline";
import { useTurnCapture } from "@/hooks/useTurnCapture";
import { useBoardroomStore } from "@/stores/boardroomStore";
import {
  createBoardroomSession,
  endBoardroomSession,
  getBoardroomVerdict,
  createVerdictIntervention,
} from "@/lib/api";
import type { BoardroomContext } from "@/lib/types";
import { AdvisorTile, ADVISOR_CONFIG } from "./AdvisorTile";
import { BoardroomUserPiP } from "./BoardroomUserPiP";
import { BoardroomControls } from "./BoardroomControls";
import { BoardroomSessionTimer } from "./BoardroomSessionTimer";
import { BoardroomConnectionBanner } from "./BoardroomConnectionBanner";
import { DeliberatingOverlay } from "./DeliberatingOverlay";
import { VerdictPanel, VerdictPanelSkeleton } from "./VerdictPanel";

const BEGIN_DELAY_MS = 500;
const VERDICT_POLL_INTERVAL_MS = 3_000;
const VERDICT_MAX_ATTEMPTS = 10;

interface BoardroomRoomProps {
  workspaceId: string;
  betId: string;
  context: BoardroomContext;
  systemPrompt: string;
  captureCtx: AudioContext | null;
}

export function BoardroomRoom({
  workspaceId,
  betId,
  context,
  systemPrompt,
  captureCtx,
}: BoardroomRoomProps) {
  const { phase, session, verdict, setPhase, setSession, setVerdict } =
    useBoardroomStore();

  const [isEnding, setIsEnding] = useState(false);
  const [interventionCreated, setInterventionCreated] = useState(false);
  const [banner, setBanner] = useState<{ type: "error" | "warning" | "success"; msg: string } | null>(null);

  const showBanner = useCallback(
    (type: "error" | "warning" | "success", msg: string) => {
      setBanner({ type, msg });
      setTimeout(() => setBanner(null), 5000);
    },
    [],
  );

  // Stable ref-based callbacks for useGeminiLive (avoids rebinding on every render)
  const turnCaptureRef = useRef<ReturnType<typeof useTurnCapture> | null>(null);
  const audioPipelineRef = useRef<ReturnType<typeof useAudioPipeline> | null>(null);

  const [showEndModal, setShowEndModal] = useState(false);

  // Ref to sendTextContent — avoids TypeScript TDZ error when referenced inside
  // onSessionStarted callback that is passed to the same hook that returns sendTextContent.
  const sendTextContentRef = useRef<((text: string, turnComplete?: boolean) => void) | null>(null);

  // ─── Gemini Live ───
  const { status, connect, sendTextContent, sendAudio, disconnect, sessionStartedAt, waitForGenerationComplete } =
    useGeminiLive({
      onSessionStarted: useCallback(() => {
        setTimeout(() => sendTextContentRef.current?.("BEGIN_SESSION", true), BEGIN_DELAY_MS);
      }, []),
      onText: useCallback((delta: string) => {
        turnCaptureRef.current?.onTextDelta(delta);
      }, []),
      onTurnComplete: useCallback(() => {
        turnCaptureRef.current?.onTurnComplete();
      }, []),
      onAudio: useCallback((b64: string) => {
        audioPipelineRef.current?.playAudioChunk(b64);
      }, []),
      onError: useCallback((err: string) => {
        if (err === "max_retries") {
          showBanner("error", "Connection lost — session ended unexpectedly.");
        }
      }, [showBanner]),
    });
  // Wire sendTextContentRef after destructure so onSessionStarted can use it
  sendTextContentRef.current = sendTextContent;

  // ─── Audio pipeline ───
  const audioPipeline = useAudioPipeline(sendAudio);
  audioPipelineRef.current = audioPipeline;

  // ─── Turn capture ───
  const turnCapture = useTurnCapture(session?.id ?? null);
  turnCaptureRef.current = turnCapture;
  const { activeSpeaker, streamingText } = turnCapture;

  // ─── On mount: wire audio + create session + connect ───
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Create boardroom session record
        const newSession = await createBoardroomSession({
          workspace_id: workspaceId,
          bet_id: betId || null,
          decision_question: context.decisionQuestion,
          key_assumption: context.keyAssumption,
        });
        if (cancelled) return;
        setSession(newSession);

        // Wire audio pipeline with the pre-created AudioContext
        if (captureCtx) {
          await audioPipelineRef.current?.initWithContext(captureCtx);
        }
        if (cancelled) return;

        // Connect Gemini Live
        await connect(workspaceId, systemPrompt);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Failed to start boardroom";
        if (msg.includes("active") || msg.includes("409")) {
          showBanner("error", "A boardroom session is already active for this workspace.");
        } else {
          showBanner("error", msg);
        }
        setPhase("setup");
      }
    }

    void init();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── End session ───
  const handleEndSession = useCallback(async () => {
    if (isEnding) return;
    setIsEnding(true);

    try {
      turnCaptureRef.current?.freezeTurnCapture();
      sendTextContent("SESSION_ENDING", true);
      await waitForGenerationComplete(4000);
      await turnCaptureRef.current?.flushPendingTurn();

      if (session) {
        await endBoardroomSession(session.id);
      }

      await disconnect();
      await audioPipelineRef.current?.shutdown();
      setPhase("deliberating");

      if (session) {
        let attempts = 0;
        const poll = setInterval(async () => {
          attempts++;
          try {
            const v = await getBoardroomVerdict(session.id);
            if (v) {
              clearInterval(poll);
              setVerdict(v);
              setPhase("verdict");
            } else if (attempts >= VERDICT_MAX_ATTEMPTS) {
              clearInterval(poll);
              showBanner("error", "Verdict timed out. Your transcript has been saved.");
              setPhase("verdict");
            }
          } catch {
            if (attempts >= VERDICT_MAX_ATTEMPTS) {
              clearInterval(poll);
              setPhase("verdict");
            }
          }
        }, VERDICT_POLL_INTERVAL_MS);
      }
    } catch (err) {
      console.error("[BoardroomRoom] End session error:", err);
      showBanner("error", "Error ending session. Please try again.");
      setIsEnding(false);
    }
  }, [disconnect, isEnding, sendTextContent, session, setPhase, setVerdict, showBanner, waitForGenerationComplete]);

  const handleHardStop = useCallback(() => {
    showBanner("warning", "15-minute limit reached — ending session.");
    handleEndSession();
  }, [handleEndSession, showBanner]);

  const handleWarning = useCallback(() => {
    showBanner("warning", "2 minutes remaining in your boardroom session.");
  }, [showBanner]);

  const handleCreateIntervention = useCallback(async () => {
    if (!verdict?.id) return;
    await createVerdictIntervention(verdict.id);
    setInterventionCreated(true);
    showBanner("success", "Intervention created and added to the Aegis audit trail.");
  }, [verdict, showBanner]);

  const handleRetry = useCallback(() => {
    connect(workspaceId, systemPrompt);
  }, [connect, systemPrompt, workspaceId]);

  // ─── Verdict phase ───
  if (phase === "verdict") {
    if (!verdict) {
      return <VerdictPanelSkeleton />;
    }
    return (
      <VerdictPanel
        verdict={verdict}
        onCreateIntervention={handleCreateIntervention}
        interventionCreated={interventionCreated}
      />
    );
  }

  // ─── Deliberating overlay ───
  if (phase === "deliberating") {
    return <DeliberatingOverlay visible />;
  }

  // ─── Live phase ───
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#f4f4fb]">
      {/* Top-center toast banner */}
      <AnimatePresence>
        {banner && (
          <motion.div
            key={banner.msg}
            className={cn(
              "fixed left-1/2 top-4 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium shadow-lg",
              banner.type === "error" && "bg-red-600 text-white",
              banner.type === "warning" && "bg-amber-500 text-white",
              banner.type === "success" && "bg-emerald-600 text-white",
            )}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            {banner.type === "error" && <AlertTriangle className="h-4 w-4 shrink-0" />}
            {banner.type === "warning" && <Info className="h-4 w-4 shrink-0" />}
            {banner.type === "success" && <CheckCircle2 className="h-4 w-4 shrink-0" />}
            {banner.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top bar */}
      <div className="relative flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          {status !== "live" && <BoardroomConnectionBanner status={status} onRetry={handleRetry} />}
          <span className="rounded-full bg-white/60 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-gray-500">
            Boardroom
          </span>
        </div>
        {/* Timer — absolutely centered so it never shifts with left/right content */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <BoardroomSessionTimer
            startedAt={sessionStartedAt}
            onWarning={handleWarning}
            onHardStop={handleHardStop}
          />
        </div>
        {/* Spacer to balance the flex row */}
        <div className="w-24" />
      </div>

      {/* Main content */}
      <div className="flex flex-1 gap-4 overflow-hidden px-6 pb-4">
        {/* Left: User PiP */}
        <div className="flex-1">
          <BoardroomUserPiP
            micLevelMV={audioPipeline.micLevelMV}
            isMuted={audioPipeline.isMuted}
            latestCaption={streamingText || undefined}
          />
        </div>

        {/* Right rail: Advisor tiles */}
        <div className="flex w-[280px] shrink-0 flex-col gap-3">
          {ADVISOR_CONFIG.map((advisor) => (
            <AdvisorTile
              key={advisor.id}
              advisor={advisor}
              isActive={activeSpeaker === advisor.id}
              subtitle={
                activeSpeaker === advisor.id
                  ? streamingText.slice(0, 60).replace(/\s\S*$/, "…")
                  : undefined
              }
              className="flex-1"
            />
          ))}
        </div>
      </div>

      {/* Bottom controls */}
      <div className="flex items-center justify-center pb-6">
        <BoardroomControls
          isMuted={audioPipeline.isMuted}
          onToggleMute={() => audioPipeline.setMuted(!audioPipeline.isMuted)}
          onEndSession={() => setShowEndModal(true)}
          isEnding={isEnding}
        />
        {showEndModal && (
          <EndSessionModal
            turnCount={turnCapture.sequenceNumber}
            onConfirm={() => { setShowEndModal(false); handleEndSession(); }}
            onCancel={() => setShowEndModal(false)}
          />
        )}
      </div>

      {/* Cold-start overlay — shown while Gemini Live is connecting */}
      <AnimatePresence>
        {status === "connecting" && (
          <motion.div
            className="absolute inset-0 z-[70] flex flex-col items-center justify-center bg-white/70 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="mb-4 flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="h-2.5 w-2.5 rounded-full bg-indigo-500"
                  animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                />
              ))}
            </div>
            <p className="text-sm font-medium text-gray-700">Advisors are reviewing your decision…</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── EndSessionModal ───────────────────────────────────────────────────────

interface EndSessionModalProps {
  turnCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

function EndSessionModal({ turnCount, onConfirm, onCancel }: EndSessionModalProps) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="end-session-title"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h3 id="end-session-title" className="text-base font-semibold text-gray-900">
          End the boardroom session?
        </h3>
        <p className="mt-2 text-sm text-gray-500">
          {turnCount > 0
            ? `${turnCount} turn${turnCount === 1 ? "" : "s"} recorded.`
            : "No turns recorded yet."}{" "}
          Your advisors will deliver closing statements before the session ends.
        </p>
        <div className="mt-5 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-full border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-full bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600"
          >
            End Session
          </button>
        </div>
      </div>
    </div>
  );
}
