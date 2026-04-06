"use client";

/**
 * useWorkspaceState — holds the active workspace and bet selection.
 * Single source of truth for workspace context passed to all child hooks.
 */

import { useState, useCallback } from "react";
import type { Bet } from "@/lib/types";

interface WorkspaceState {
  workspaceId: string;
  activeBet: Bet | null;
}

const DEFAULT_WORKSPACE_ID =
  process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID ?? "ws-demo";

export function useWorkspaceState() {
  const [state, setState] = useState<WorkspaceState>({
    workspaceId: DEFAULT_WORKSPACE_ID,
    activeBet: null,
  });

  const setActiveBet = useCallback((bet: Bet | null) => {
    setState((prev) => ({ ...prev, activeBet: bet }));
  }, []);

  const setWorkspaceId = useCallback((id: string) => {
    setState((prev) => ({ ...prev, workspaceId: id, activeBet: null }));
  }, []);

  return {
    workspaceId: state.workspaceId,
    activeBet: state.activeBet,
    setActiveBet,
    setWorkspaceId,
  };
}
