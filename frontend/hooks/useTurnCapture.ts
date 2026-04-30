"use client";

import { useCallback, useRef, useState } from "react";
import { saveBoardroomTurn } from "@/lib/api";
import type { BoardroomSpeaker } from "@/lib/types";

// Maps [BEAR]/[BULL]/[SAGE] tags → speaker IDs
const TAG_MAP: Record<string, BoardroomSpeaker> = {
  BEAR: "bear",
  BULL: "bull",
  SAGE: "sage",
};

const TAG_REGEX = /^\[(BEAR|BULL|SAGE)\]\s*/;

export interface CaptionEntry {
  speaker: BoardroomSpeaker | "user";
  text: string;
}

interface UseTurnCaptureResult {
  // Currently streaming text (current speaker turn in progress)
  streamingText: string;
  // Last detected active speaker
  activeSpeaker: BoardroomSpeaker | null;
  // Completed caption history (last 3)
  captionHistory: CaptionEntry[];
  // Called by useGeminiLive on each text delta
  onTextDelta: (delta: string) => void;
  // Called by useGeminiLive when a turn completes
  onTurnComplete: () => void;
  // Prevent any further DB writes (called before SESSION_ENDING)
  freezeTurnCapture: () => void;
  // Flush any in-progress turn (called at session end)
  flushPendingTurn: (timeoutMs?: number) => Promise<void>;
  // Sequence counter (monotonically increasing)
  sequenceNumber: number;
}

const MIN_TURN_WORDS = 3;

export function useTurnCapture(sessionId: string | null): UseTurnCaptureResult {
  const [streamingText, setStreamingText] = useState("");
  const [activeSpeaker, setActiveSpeaker] = useState<BoardroomSpeaker | null>(null);
  const [captionHistory, setCaptionHistory] = useState<CaptionEntry[]>([]);
  const [sequenceNumber, setSequenceNumber] = useState(0);

  const bufferRef = useRef("");
  const currentSpeakerRef = useRef<BoardroomSpeaker | null>(null);
  const frozenRef = useRef(false);
  const seqRef = useRef(0);

  const persistTurn = useCallback(
    async (speaker: BoardroomSpeaker, text: string) => {
      if (frozenRef.current || !sessionId) return;
      const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
      if (wordCount < MIN_TURN_WORDS) return;

      seqRef.current += 1;
      setSequenceNumber(seqRef.current);

      try {
        await saveBoardroomTurn(sessionId, {
          speaker,
          text: text.trim(),
          sequence_number: seqRef.current,
        });
      } catch {
        // Retry once after 2s; if still fails, log and continue
        await new Promise((r) => setTimeout(r, 2000));
        try {
          await saveBoardroomTurn(sessionId, {
            speaker,
            text: text.trim(),
            sequence_number: seqRef.current,
          });
        } catch (err) {
          console.warn("[useTurnCapture] Failed to persist turn:", err);
        }
      }
    },
    [sessionId],
  );

  const onTextDelta = useCallback(
    (delta: string) => {
      bufferRef.current += delta;

      // Detect speaker tag at start of buffer
      const match = TAG_REGEX.exec(bufferRef.current);
      if (match) {
        const tag = match[1] as keyof typeof TAG_MAP;
        const speaker = TAG_MAP[tag];
        const stripped = bufferRef.current.replace(TAG_REGEX, "");
        bufferRef.current = stripped;

        if (speaker !== currentSpeakerRef.current) {
          // Flush previous speaker's buffer
          if (currentSpeakerRef.current && stripped.trim()) {
            persistTurn(currentSpeakerRef.current, stripped);
          }
          currentSpeakerRef.current = speaker;
          setActiveSpeaker(speaker);
        }
      }

      const displayText = bufferRef.current.replace(TAG_REGEX, "");
      setStreamingText(displayText);
    },
    [persistTurn],
  );

  const onTurnComplete = useCallback(() => {
    const speaker = currentSpeakerRef.current;
    const text = bufferRef.current.replace(TAG_REGEX, "").trim();

    if (speaker && text) {
      persistTurn(speaker, text);
      setCaptionHistory((prev) => {
        const entry: CaptionEntry = { speaker, text };
        return [...prev, entry].slice(-3);
      });
    }

    bufferRef.current = "";
    setStreamingText("");
    // Keep activeSpeaker for a brief moment then clear
    setTimeout(() => {
      currentSpeakerRef.current = null;
      setActiveSpeaker(null);
    }, 1500);
  }, [persistTurn]);

  const freezeTurnCapture = useCallback(() => {
    frozenRef.current = true;
  }, []);

  const flushPendingTurn = useCallback(
    async (timeoutMs = 2000) => {
      const speaker = currentSpeakerRef.current;
      const text = bufferRef.current.replace(TAG_REGEX, "").trim();
      if (!speaker || !text) return;

      const flushPromise = persistTurn(speaker, text);
      const timeoutPromise = new Promise<void>((r) => setTimeout(r, timeoutMs));
      await Promise.race([flushPromise, timeoutPromise]);

      bufferRef.current = "";
      setStreamingText("");
    },
    [persistTurn],
  );

  return {
    streamingText,
    activeSpeaker,
    captionHistory,
    onTextDelta,
    onTurnComplete,
    freezeTurnCapture,
    flushPendingTurn,
    sequenceNumber,
  };
}
