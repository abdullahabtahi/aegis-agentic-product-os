"use client";

/**
 * useWorkspaceState — holds the active workspace and bet selection.
 * Single source of truth for workspace context passed to all child hooks.
 */

import { useState, useCallback, useEffect } from "react";
import type { Bet } from "@/lib/types";

interface WorkspaceState {
  workspaceId: string;
  activeBet: Bet | null;
}

const DEFAULT_WORKSPACE_ID =
  process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID ?? "ws-agentic-os";

const BOOTSTRAP_BET: Bet = {
  id: "bet-agentic-os",
  workspace_id: DEFAULT_WORKSPACE_ID,
  name: "Agentic Product OS",
  status: "active",
  hypothesis:
    "Bringing Linear workflows straight to an Agentic UI will improve decision velocity.",
  success_metrics: ["Decision Velocity"],
  time_horizon: "End of Hackathon",
  acknowledged_risks: [],
  linear_project_ids: ["c5144e1b-b0d7-44ba-b0d1-64b491b3ea2e"],
  created_at: "2026-04-06T12:00:00Z",
};

export function useWorkspaceState() {
  const [state, setState] = useState<WorkspaceState>({
    workspaceId: DEFAULT_WORKSPACE_ID,
    activeBet: null,
  });

  useEffect(() => {
    setState((prev) => ({
      ...prev,
      activeBet: prev.activeBet ?? BOOTSTRAP_BET,
    }));
  }, []);

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
