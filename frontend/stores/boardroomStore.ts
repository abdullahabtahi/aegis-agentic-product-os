/**
 * boardroomStore — forward-only state machine for Boardroom sessions.
 *
 * Phase transitions: setup → intro → live → deliberating → verdict
 * State never regresses. Only a store reset starts a new session.
 *
 * Zustand v5 middleware ordering: devtools(persist(...)) — devtools MUST be outermost.
 * If persist wraps devtools, state does not survive page refresh (silent failure).
 */

import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import type { BoardroomPhase, BoardroomSession, BoardroomVerdict } from "@/lib/types";

interface BoardroomDraft {
  decisionQuestion: string;
  keyAssumption: string;
}

interface BoardroomState {
  // Phase machine (forward-only)
  phase: BoardroomPhase;

  // Active session (set after createBoardroomSession succeeds)
  session: BoardroomSession | null;

  // Verdict (set after verdict agent completes)
  verdict: BoardroomVerdict | null;

  // Draft fields — persisted so page refresh restores form values
  draft: BoardroomDraft;

  // Whether the intro context is loaded and ready to enter live
  contextReady: boolean;

  // Actions
  setPhase: (phase: BoardroomPhase) => void;
  setSession: (session: BoardroomSession) => void;
  setVerdict: (verdict: BoardroomVerdict) => void;
  setDraft: (patch: Partial<BoardroomDraft>) => void;
  setContextReady: (ready: boolean) => void;
  reset: () => void;
}

const INITIAL_STATE = {
  phase: "setup" as BoardroomPhase,
  session: null,
  verdict: null,
  draft: { decisionQuestion: "", keyAssumption: "" },
  contextReady: false,
};

export const useBoardroomStore = create<BoardroomState>()(
  devtools(
    persist(
      (set) => ({
        ...INITIAL_STATE,

        setPhase: (phase) =>
          set((s) => {
            // Enforce forward-only: never regress phase
            const ORDER: BoardroomPhase[] = ["setup", "intro", "live", "deliberating", "verdict"];
            if (ORDER.indexOf(phase) < ORDER.indexOf(s.phase)) return s;
            return { ...s, phase };
          }),

        setSession: (session) => set((s) => ({ ...s, session })),

        setVerdict: (verdict) => set((s) => ({ ...s, verdict })),

        setDraft: (patch) =>
          set((s) => ({ ...s, draft: { ...s.draft, ...patch } })),

        setContextReady: (contextReady) => set((s) => ({ ...s, contextReady })),

        reset: () => set({ ...INITIAL_STATE }),
      }),
      {
        name: "aegis-boardroom-store",
        // Only persist draft + session ID — phase resets on revisit
        partialize: (s) => ({
          draft: s.draft,
          session: s.session,
        }),
      },
    ),
    { name: "BoardroomStore" },
  ),
);
