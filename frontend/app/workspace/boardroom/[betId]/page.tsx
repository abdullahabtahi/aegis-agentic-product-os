"use client";

import { use, useCallback, useEffect, useRef } from "react";
import { useBoardroomStore } from "@/stores/boardroomStore";
import { useBoardroomContext } from "@/hooks/useBoardroomContext";
import { useWorkspaceId } from "@/hooks/useWorkspaceId";
import { BoardroomSetupForm } from "@/components/boardroom/BoardroomSetupForm";
import { BoardroomIntroScreen } from "@/components/boardroom/BoardroomIntroScreen";
import { BoardroomRoom } from "@/components/boardroom/BoardroomRoom";

interface BoardroomPageProps {
  params: Promise<{ betId: string }>;
}

export default function BoardroomPage({ params }: BoardroomPageProps) {
  const { betId } = use(params);
  const workspaceId = useWorkspaceId();
  const { phase, draft, setPhase, reset } = useBoardroomStore();

  const { context, status: contextStatus, systemPrompt } = useBoardroomContext(
    betId,
    draft.decisionQuestion,
    draft.keyAssumption,
  );

  // AudioContext must be created synchronously inside a user gesture (autoplay policy).
  // Store it in a ref so it survives the phase transition without re-creating.
  const captureCtxRef = useRef<AudioContext | null>(null);

  // Reset store on fresh navigation to a new betId
  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [betId]);

  const handleEnterBoardroom = useCallback(() => {
    setPhase("intro");
  }, [setPhase]);

  const handleBeginBoardroom = useCallback(() => {
    // AudioContext created synchronously inside user gesture — required by Chrome/Safari
    captureCtxRef.current = new AudioContext({ sampleRate: 16_000 });
    setPhase("live");
  }, [setPhase]);

  // Setup form — initial entry point
  if (phase === "setup") {
    return (
      <BoardroomSetupForm
        betId={betId}
        context={context}
        contextStatus={contextStatus}
        onEnter={handleEnterBoardroom}
      />
    );
  }

  // Intro screen — advisor showcase before going live
  if (phase === "intro") {
    return (
      <BoardroomIntroScreen
        context={context}
        contextStatus={contextStatus}
        onBegin={handleBeginBoardroom}
      />
    );
  }

  // Live / deliberating / verdict — managed by BoardroomRoom
  if (context && systemPrompt) {
    return (
      <BoardroomRoom
        workspaceId={workspaceId}
        betId={betId}
        context={context}
        systemPrompt={systemPrompt}
        captureCtx={captureCtxRef.current}
      />
    );
  }

  // Fallback while context loads (shouldn't normally reach here in live+ phase)
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-gray-400">Loading boardroom…</p>
    </div>
  );
}
