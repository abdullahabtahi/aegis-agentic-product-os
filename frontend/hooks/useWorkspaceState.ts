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
  process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID ?? "default_workspace";

const BOOTSTRAP_BET: Bet = {
  id: "bet-agentic-os",
  workspace_id: DEFAULT_WORKSPACE_ID,
  name: "Agentic Product OS",
  target_segment: "Engineering Leadership",
  problem_statement: "High-growth startups struggle to detect execution risks before they become terminal.",
  status: "active",
  hypothesis:
    "Bringing Linear workflows straight to an Agentic UI will improve decision velocity.",
  success_metrics: [
    { name: "Decision Velocity", target_value: 10, unit: "decisions/week" }
  ],
  time_horizon: "2026-06-01T00:00:00Z",
  declaration_source: { type: "manual" },
  declaration_confidence: 1.0,
  health_baseline: {
    expected_bet_coverage_pct: 0.5,
    expected_weekly_velocity: 3.0,
    hypothesis_required: true,
    metric_linked_required: true
  },
  acknowledged_risks: [],
  linear_project_ids: ["c5144e1b-b0d7-44ba-b0d1-64b491b3ea2e"],
  linear_issue_ids: [],
  doc_refs: [],
  created_at: "2026-04-06T12:00:00Z",
  last_monitored_at: "2026-04-06T12:00:00Z",
};

export function useWorkspaceState() {
  const [state, setState] = useState<WorkspaceState>({
    workspaceId: DEFAULT_WORKSPACE_ID,
    activeBet: BOOTSTRAP_BET,
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
