"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motionValue, type MotionValue } from "framer-motion";

/**
 * useAudioPipeline — dual AudioContext mic capture + playback pipeline.
 *
 * Capture:  16kHz AudioContext → capture-processor worklet → base64 PCM chunks
 *           → onAudioChunk callback (fed to useGeminiLive sendAudio)
 * Playback: 24kHz AudioContext → playback-processor worklet
 *           → receives base64 PCM from useGeminiLive onAudioData
 *
 * IMPORTANT: The capture AudioContext MUST be created synchronously inside a
 * user gesture handler (e.g. "Begin Boardroom" click). Pass it via initWithContext().
 * Creating it inside useEffect violates Chrome/Safari autoplay policy → silent audio.
 *
 * micLevelMV is a MotionValue updated off the React render cycle to avoid
 * re-rendering every audio frame. Wire it directly to framer-motion animated values.
 */

export interface UseAudioPipelineResult {
  /** Call synchronously inside user gesture handler BEFORE any async work */
  initWithContext: (captureCtx: AudioContext) => Promise<void>;
  /** Feed PCM audio data received from Gemini Live to playback pipeline */
  playAudioChunk: (b64: string) => void;
  /** MotionValue [0–1] representing current mic level — drives waveform visualizer */
  micLevelMV: MotionValue<number>;
  /** True while capture pipeline is active */
  isCapturing: boolean;
  /** Error from mic access, worklet load, or AudioContext creation */
  micError: string | null;
  /** Flush the playback buffer and close both AudioContexts */
  shutdown: () => Promise<void>;
  /** Mute/unmute microphone without closing the pipeline */
  setMuted: (muted: boolean) => void;
  isMuted: boolean;
}

const CAPTURE_SAMPLE_RATE = 16_000;
const PLAYBACK_SAMPLE_RATE = 24_000;
const WATCHDOG_MS = 2_000;

export function useAudioPipeline(
  onAudioChunk: (b64: string) => void,
): UseAudioPipelineResult {
  const [isCapturing, setIsCapturing] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [isMuted, setIsMutedState] = useState(false);

  const captureCtxRef = useRef<AudioContext | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const captureNodeRef = useRef<AudioWorkletNode | null>(null);
  const playbackNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isMutedRef = useRef(false);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastChunkRef = useRef<number>(0);

  // useMemo ensures a single stable MotionValue across renders without ref.current access during render
  const micLevelMV = useMemo(() => motionValue(0), []);

  const resetWatchdog = useCallback(() => {
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    lastChunkRef.current = Date.now();
    watchdogRef.current = setTimeout(() => {
      // Watchdog: if no audio chunk in WATCHDOG_MS, level drops to 0
      micLevelMV.set(0);
    }, WATCHDOG_MS);
  }, [micLevelMV]);

  const initWithContext = useCallback(
    async (captureCtx: AudioContext) => {
      try {
        // React StrictMode double-invokes effects: the first mount's cleanup may close
        // the externally-created captureCtx before the second mount calls here.
        // Recover by creating a fresh context in that case.
        let ctx = captureCtx;
        if (ctx.state === "closed") {
          ctx = new AudioContext({ sampleRate: CAPTURE_SAMPLE_RATE });
        } else if (ctx.state === "suspended") {
          await ctx.resume();
        }
        captureCtxRef.current = ctx;

        // Load capture worklet into the provided AudioContext
        await ctx.audioWorklet.addModule("/worklets/capture-processor.js");

        // Request mic access
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: CAPTURE_SAMPLE_RATE,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        streamRef.current = stream;

        // Source → worklet
        const source = ctx.createMediaStreamSource(stream);
        const captureNode = new AudioWorkletNode(ctx, "capture-processor");
        captureNodeRef.current = captureNode;

        captureNode.port.onmessage = (e: MessageEvent) => {
          if (isMutedRef.current) return;
          const { b64 } = e.data as { b64: string; sampleRate: number };
          // Approximate level from chunk size (not perfect but avoids analyser overhead)
          const level = Math.min(1, b64.length / 2000);
          micLevelMV.set(level);
          resetWatchdog();
          onAudioChunk(b64);
        };

        source.connect(captureNode);

        // Separate 24kHz context for playback
        const playbackCtx = new AudioContext({ sampleRate: PLAYBACK_SAMPLE_RATE });
        playbackCtxRef.current = playbackCtx;
        await playbackCtx.audioWorklet.addModule("/worklets/playback-processor.js");

        const playbackNode = new AudioWorkletNode(playbackCtx, "playback-processor");
        playbackNodeRef.current = playbackNode;
        playbackNode.connect(playbackCtx.destination);

        setIsCapturing(true);
        setMicError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Microphone access failed";
        setMicError(msg);
      }
    },
    [micLevelMV, onAudioChunk, resetWatchdog],
  );

  const playAudioChunk = useCallback((b64: string) => {
    const ctx = playbackCtxRef.current;
    const node = playbackNodeRef.current;
    if (!ctx || !node) return;
    // Resume suspended context (browser may suspend after a period of silence)
    if (ctx.state === "suspended") {
      void ctx.resume().then(() => node.port.postMessage({ b64 })).catch(() => {});
    } else {
      node.port.postMessage({ b64 });
    }
  }, []);

  const setMuted = useCallback((muted: boolean) => {
    isMutedRef.current = muted;
    setIsMutedState(muted);
    if (muted) micLevelMV.set(0);
    // Pause/resume mic tracks rather than disconnecting (avoids worklet re-init)
    streamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }, [micLevelMV]);

  const shutdown = useCallback(async () => {
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    micLevelMV.set(0);

    // Flush playback buffer
    playbackNodeRef.current?.port.postMessage({ flush: true });
    await new Promise<void>((r) => setTimeout(r, 200));

    captureNodeRef.current?.disconnect();
    playbackNodeRef.current?.disconnect();

    streamRef.current?.getTracks().forEach((t) => t.stop());

    // Don't close the capture context — it may have been created externally (page.tsx
    // creates it in the user-gesture handler). Closing it here would break StrictMode
    // double-invoke: the first cleanup would close it before the second mount uses it.
    // Just null the ref; the parent owns the lifecycle.
    await playbackCtxRef.current?.close().catch(() => {});

    captureCtxRef.current = null;
    playbackCtxRef.current = null;
    captureNodeRef.current = null;
    playbackNodeRef.current = null;
    streamRef.current = null;

    setIsCapturing(false);
  }, [micLevelMV]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shutdown().catch(() => {});
    };
  }, [shutdown]);

  return {
    initWithContext,
    playAudioChunk,
    micLevelMV,
    isCapturing,
    micError,
    shutdown,
    setMuted,
    isMuted,
  };
}
