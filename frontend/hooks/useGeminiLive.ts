"use client";

// AI STUDIO (Gemini Live) COMPAT: Uses generativelanguage.googleapis.com with ?key=<API_KEY>.
// Setup message: { "setup": { "model": "models/...", "generationConfig": { responseModalities }, ... } }
// Text input: realtimeInput.text (NOT clientContent — unsupported in Gemini 3.1 Live for regular turns).
// Audio input: realtimeInput.audio.{ data, mimeType } (NOT mediaChunks — deprecated format).

import { useCallback, useEffect, useRef, useState } from "react";
import { mintBoardroomToken } from "@/lib/api";
import type { BoardroomConnStatus } from "@/lib/types";

const BACKOFF_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000, 16_000];
const MAX_RECONNECT_ATTEMPTS = BACKOFF_DELAYS_MS.length;

// ─────────────────────────────────────────────
// Wire-format types (Vertex AI BidiGenerateContent)
// ─────────────────────────────────────────────

interface SetupClientMessage {
  setup: {
    model: string;
    systemInstruction: { parts: Array<{ text: string }> };
    generationConfig: {
      responseModalities: string[];
      speechConfig?: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: string } };
      };
    };
    sessionResumption?: { handle: string };
  };
}


interface RealtimeTextMessage {
  realtimeInput: {
    text: string;
  };
}

interface RealtimeAudioMessage {
  realtimeInput: {
    audio: { mimeType: string; data: string };
  };
}

interface ServerMessage {
  setupComplete?: Record<string, unknown>;
  serverContent?: {
    modelTurn?: {
      parts: Array<{
        text?: string;
        inlineData?: { mimeType: string; data: string };
      }>;
    };
    turnComplete?: boolean;
    generationComplete?: boolean;
    interrupted?: boolean;
  };
  goAway?: { timeLeft?: { seconds: number } };
  sessionResumptionUpdate?: { newHandle?: string; resumable?: boolean };
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export interface UseGeminiLiveOptions {
  /** Called for each text delta from the model (streaming). */
  onText?: (delta: string) => void;
  /** Called for each base64 PCM (24kHz) audio chunk from the model. */
  onAudio?: (b64: string) => void;
  /** Called when current model turn ends (turnComplete=true). */
  onTurnComplete?: () => void;
  /** Called when the full generation cycle ends (post SESSION_ENDING). */
  onGenerationComplete?: () => void;
  /** Called when setupComplete arrives — session is ready for input. */
  onSessionStarted?: () => void;
  /** Called on terminal connection failure (after backoff exhausted). */
  onError?: (err: string) => void;
  /** Voice for prebuilt voice config (default: "Aoede"). */
  voiceName?: string;
}

export interface UseGeminiLiveResult {
  status: BoardroomConnStatus;
  /** Connect, fetch token, send setup. Idempotent if already connecting/live. */
  connect: (workspaceId: string, systemPrompt: string) => Promise<void>;
  /** Send text via sendClientContent. NEVER use sendRealtimeInput for text. */
  sendTextContent: (text: string, turnComplete?: boolean) => void;
  /** Send PCM audio chunk (16kHz, base64) via realtimeInput. */
  sendAudio: (b64: string) => void;
  /** Disconnect cleanly; clears timers and prevents reconnect. */
  disconnect: () => Promise<void>;
  /** UTC ms when setupComplete first fired (null until session starts). */
  sessionStartedAt: number | null;
  /** Last connection error (null if healthy). */
  initError: string | null;
  /** Wait for next generation_complete event up to timeoutMs (resolves on timeout). */
  waitForGenerationComplete: (timeoutMs?: number) => Promise<void>;
}

export function useGeminiLive(options: UseGeminiLiveOptions = {}): UseGeminiLiveResult {
  // ─── Public reactive state ───
  const [status, setStatus] = useState<BoardroomConnStatus>("idle");
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  // ─── Refs (no re-renders) ───
  const wsRef = useRef<WebSocket | null>(null);
  const statusRef = useRef<BoardroomConnStatus>("idle");
  const tokenRef = useRef<string | null>(null);
  const websocketUrlRef = useRef<string | null>(null);
  const modelPathRef = useRef<string | null>(null);
  const systemPromptRef = useRef<string | null>(null);
  const workspaceIdRef = useRef<string | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionResumeHandleRef = useRef<string | null>(null);
  const isShutdownRef = useRef(false);
  const generationCompleteSettleRef = useRef<(() => void) | null>(null);

  // Keep options accessible without rebinding callbacks each render
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const updateStatus = useCallback((next: BoardroomConnStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  // ─── Token refresh ───
  const fetchToken = useCallback(async (workspaceId: string) => {
    const resp = await mintBoardroomToken(workspaceId);
    tokenRef.current = resp.access_token;
    websocketUrlRef.current = resp.websocket_url;
    modelPathRef.current = resp.model;
    return resp;
  }, []);

  // ─── Build setup message (with optional resumption handle) ───
  const buildSetupMessage = useCallback((): SetupClientMessage => {
    const voiceName = optionsRef.current.voiceName ?? "Aoede";
    const setup: SetupClientMessage["setup"] = {
      model: modelPathRef.current!,
      systemInstruction: {
        parts: [{ text: systemPromptRef.current ?? "" }],
      },
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName } },
        },
      },
    };
    if (sessionResumeHandleRef.current) {
      setup.sessionResumption = { handle: sessionResumeHandleRef.current };
    }
    return { setup };
  }, []);

  // ─── Server message handler ───
  const handleServerMessage = useCallback(
    (msg: ServerMessage) => {
      if (msg.setupComplete !== undefined) {
        // Session is fully ready — only fire onSessionStarted once per fresh session
        if (sessionStartedAt === null) {
          setSessionStartedAt(Date.now());
        }
        reconnectAttemptsRef.current = 0;
        updateStatus("live");
        optionsRef.current.onSessionStarted?.();
        return;
      }

      if (msg.sessionResumptionUpdate) {
        const upd = msg.sessionResumptionUpdate;
        if (upd.resumable && upd.newHandle) {
          sessionResumeHandleRef.current = upd.newHandle;
        }
        return;
      }

      if (msg.goAway) {
        // Server initiated shutdown — close socket, let onclose schedule reconnect.
        // Do NOT mark as error; reconnect with sessionResumption handle.
        const seconds = msg.goAway.timeLeft?.seconds ?? 0;
        console.warn(`[GeminiLive] GoAway received (${seconds}s left); will reconnect`);
        try {
          wsRef.current?.close(4000, "go_away");
        } catch {
          /* noop */
        }
        return;
      }

      if (msg.serverContent) {
        const sc = msg.serverContent;

        if (sc.modelTurn?.parts) {
          for (const part of sc.modelTurn.parts) {
            if (part.text) {
              optionsRef.current.onText?.(part.text);
            }
            if (
              part.inlineData?.data &&
              part.inlineData.mimeType?.startsWith("audio/")
            ) {
              optionsRef.current.onAudio?.(part.inlineData.data);
            }
          }
        }

        if (sc.turnComplete) {
          optionsRef.current.onTurnComplete?.();
        }

        if (sc.generationComplete) {
          optionsRef.current.onGenerationComplete?.();
          // Resolve any pending waitForGenerationComplete
          if (generationCompleteSettleRef.current) {
            generationCompleteSettleRef.current();
            generationCompleteSettleRef.current = null;
          }
        }
      }
    },
    [sessionStartedAt, updateStatus],
  );

  // ─── Open the actual WebSocket ───
  const openWebSocket = useCallback(() => {
    // tokenRef.current is "" (empty string) when GEMINI_API_KEY is embedded in the URL (AI Studio).
    // Use null-check, not truthiness check, so empty string doesn't block the connection.
    if (tokenRef.current === null || tokenRef.current === undefined || !websocketUrlRef.current || !modelPathRef.current) {
      throw new Error("Token / URL / model not initialized");
    }

    updateStatus("connecting");

    // AI Studio mode: access_token is "" — key already embedded in websocket_url.
    // Vertex AI mode: access_token is a real OAuth token — append as query param.
    const url = tokenRef.current
      ? `${websocketUrlRef.current}?access_token=${encodeURIComponent(tokenRef.current)}`
      : websocketUrlRef.current;

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "WebSocket constructor failed";
      setInitError(msg);
      updateStatus("error");
      return;
    }
    wsRef.current = ws;
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      try {
        ws.send(JSON.stringify(buildSetupMessage()));
      } catch (err) {
        console.error("[GeminiLive] setup send failed:", err);
        try {
          ws.close();
        } catch {
          /* noop */
        }
      }
    };

    ws.onmessage = async (event: MessageEvent) => {
      try {
        let raw: string;
        if (event.data instanceof ArrayBuffer) {
          raw = new TextDecoder().decode(event.data);
        } else if (typeof Blob !== "undefined" && event.data instanceof Blob) {
          raw = await event.data.text();
        } else {
          raw = event.data as string;
        }
        const data = JSON.parse(raw) as ServerMessage;
        handleServerMessage(data);
      } catch (err) {
        console.warn("[GeminiLive] Failed to parse server message:", err);
      }
    };

    ws.onerror = () => {
      // Most ws errors also produce onclose; let onclose drive the reconnect logic.
      // We log here for visibility but avoid double-handling.
    };

    ws.onclose = (ev) => {
      wsRef.current = null;

      if (isShutdownRef.current) {
        updateStatus("idle");
        return;
      }

      // 1000 = normal closure (initiated by us). 1001 = going away (e.g. tab close).
      if (ev.code === 1000 || ev.code === 1001) {
        updateStatus("idle");
        return;
      }

      // Anything else → schedule reconnect with backoff
      void scheduleReconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildSetupMessage, handleServerMessage, updateStatus]);

  // ─── Schedule a reconnect with exponential backoff ───
  const scheduleReconnect = useCallback(async () => {
    if (isShutdownRef.current) return;
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      updateStatus("error");
      setInitError("Connection lost — maximum retries exhausted");
      optionsRef.current.onError?.("max_retries");
      return;
    }

    const delay = BACKOFF_DELAYS_MS[reconnectAttemptsRef.current];
    reconnectAttemptsRef.current += 1;
    updateStatus("reconnecting");

    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = setTimeout(async () => {
      reconnectTimerRef.current = null;
      if (isShutdownRef.current) return;
      if (!workspaceIdRef.current) return;

      try {
        // Refresh token; the previous one may have expired or been invalidated
        await fetchToken(workspaceIdRef.current);
        openWebSocket();
      } catch (err) {
        console.error(
          "[GeminiLive] Reconnect token refresh failed:",
          err instanceof Error ? err.message : err,
        );
        // Try again at next backoff slot
        void scheduleReconnect();
      }
    }, delay);
  }, [fetchToken, openWebSocket, updateStatus]);

  // ─── Public: connect ───
  const connect = useCallback(
    async (workspaceId: string, systemPrompt: string) => {
      // Idempotent: if already connecting / live / reconnecting, ignore
      if (
        statusRef.current === "connecting" ||
        statusRef.current === "live" ||
        statusRef.current === "reconnecting"
      ) {
        return;
      }

      isShutdownRef.current = false;
      workspaceIdRef.current = workspaceId;
      systemPromptRef.current = systemPrompt;
      sessionResumeHandleRef.current = null;
      reconnectAttemptsRef.current = 0;
      setInitError(null);
      setSessionStartedAt(null);

      try {
        await fetchToken(workspaceId);
        openWebSocket();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Connection failed";
        setInitError(msg);
        updateStatus("error");
        optionsRef.current.onError?.(msg);
      }
    },
    [fetchToken, openWebSocket, updateStatus],
  );

  // ─── Public: send text (realtimeInput.text — required for Gemini 3.1 Live) ───
  const sendTextContent = useCallback((text: string, _turnComplete = true) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn("[GeminiLive] sendTextContent skipped — socket not open");
      return;
    }
    const msg: RealtimeTextMessage = {
      realtimeInput: { text },
    };
    try {
      ws.send(JSON.stringify(msg));
    } catch (err) {
      console.error("[GeminiLive] sendTextContent failed:", err);
    }
  }, []);

  // ─── Public: send audio (realtimeInput.audio — AI Studio Gemini 3.1 format) ───
  const sendAudio = useCallback((b64: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const msg: RealtimeAudioMessage = {
      realtimeInput: {
        audio: { mimeType: "audio/pcm;rate=16000", data: b64 },
      },
    };
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // Audio chunks are high-frequency — silent failure is acceptable here
    }
  }, []);

  // ─── Public: disconnect cleanly ───
  const disconnect = useCallback(async () => {
    isShutdownRef.current = true;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (generationCompleteSettleRef.current) {
      generationCompleteSettleRef.current();
      generationCompleteSettleRef.current = null;
    }

    const ws = wsRef.current;
    if (ws) {
      try {
        ws.close(1000, "client_disconnect");
      } catch {
        /* noop */
      }
      wsRef.current = null;
    }

    updateStatus("idle");
  }, [updateStatus]);

  // ─── Public: wait for next generation_complete (with timeout) ───
  const waitForGenerationComplete = useCallback(
    (timeoutMs = 4_000): Promise<void> =>
      new Promise<void>((resolve) => {
        let resolved = false;
        const settle = () => {
          if (resolved) return;
          resolved = true;
          generationCompleteSettleRef.current = null;
          resolve();
        };
        // Replace any prior pending settle (last-writer-wins is fine here)
        generationCompleteSettleRef.current = settle;
        setTimeout(settle, timeoutMs);
      }),
    [],
  );

  // ─── Cleanup on unmount ───
  useEffect(() => {
    return () => {
      isShutdownRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      const ws = wsRef.current;
      if (ws) {
        try {
          ws.close(1000, "unmount");
        } catch {
          /* noop */
        }
      }
    };
  }, []);

  return {
    status,
    connect,
    sendTextContent,
    sendAudio,
    disconnect,
    sessionStartedAt,
    initError,
    waitForGenerationComplete,
  };
}
