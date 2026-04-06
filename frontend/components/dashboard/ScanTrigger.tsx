"use client";

/**
 * ScanTrigger — Initiates the ADK Aegis Pipeline via AG-UI / CopilotKit.
 *
 * Uses useCopilotChat.appendMessage to send a structured TextMessage, which:
 * 1. Triggers the CopilotKit runtime to run the aegis_pipeline agent
 * 2. Feeds the bet payload as a user turn to SignalEngineAgent._parse_bet_from_user_message
 *
 * Protocol:
 *   Click → appendMessage(TextMessage) → /api/copilotkit → HttpAgent →
 *   http://localhost:8000/adk/v1/app → SignalEngine → pipeline starts
 */

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useCoAgent, useCopilotChat } from "@copilotkit/react-core";
import { TextMessage, Role } from "@copilotkit/runtime-client-gql";
import type { AegisPipelineState, Bet } from "@/lib/types";
import { Zap, RefreshCw } from "lucide-react";

interface ScanTriggerProps {
  bet?: Bet;
  workspaceId?: string;
  disabled?: boolean;
  className?: string;
}

export function ScanTrigger({
  bet,
  workspaceId,
  disabled,
  className,
}: ScanTriggerProps) {
  const [scanning, setScanning] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const { setState } = useCoAgent<AegisPipelineState>({
    name: "aegis_pipeline",
    initialState: {},
  });

  const { appendMessage } = useCopilotChat();

  const handleScan = async () => {
    if (!bet || scanning) return;
    setScanning(true);

    try {
      // Step 1: Reset pipeline state so the feed re-animates from scratch
      await setState({
        bet,
        workspace_id: workspaceId,
        pipeline_status: undefined,
        pipeline_checkpoint: undefined,
        linear_signals: undefined,
        bet_snapshot: undefined,
        risk_signal_draft: undefined,
        intervention_proposal: undefined,
        governor_decision: undefined,
        awaiting_approval_intervention: undefined,
        executor_result: undefined,
      });

      // Construct a production-grade Bet object that satisfies the backend Pydantic schema
      const betPayload = {
        ...bet,
        target_segment: bet.target_segment || "General",
        problem_statement: bet.problem_statement || "Real-time project health monitoring via Linear signals.",
        declaration_source: bet.declaration_source || { type: "manual" },
        declaration_confidence: bet.declaration_confidence ?? 1.0,
        status: bet.status || "active",
        health_baseline: bet.health_baseline || {
          expected_bet_coverage_pct: 0.5,
          expected_weekly_velocity: 3.0,
          hypothesis_required: true,
          metric_linked_required: true
        },
        success_metrics: Array.isArray(bet.success_metrics) 
          ? bet.success_metrics.map(m => typeof m === 'string' ? { name: m, target_value: 0, unit: "count" } : m)
          : [],
        created_at: bet.created_at || new Date().toISOString(),
        last_monitored_at: new Date().toISOString(),
        linear_project_ids: bet.linear_project_ids || [],
        linear_issue_ids: bet.linear_issue_ids || [],
        doc_refs: bet.doc_refs || [],
        acknowledged_risks: bet.acknowledged_risks || [],
      };

      // Step 2: Append a user message — this triggers the backend agent run.
      await appendMessage(
        new TextMessage({
          id: `scan-${Date.now()}`,
          role: Role.User,
          content: JSON.stringify({
            workspace_id: workspaceId ?? "ws-agentic-os",
            bet: betPayload,
          }),
        })
      );
    } catch (err) {
      console.error("[ScanTrigger] Pipeline trigger failed:", err);
    } finally {
      setTimeout(() => setScanning(false), 2000);
    }
  };

  const canScan = !!bet && !disabled;

  return (
    <Button
      onClick={handleScan}
      disabled={!isMounted || !canScan || scanning}
      className={cn(
        "gap-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400",
        "border border-cyan-500/20 hover:border-cyan-500/30 transition-all",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        className
      )}
      variant="ghost"
    >
      {scanning ? (
        <>
          <RefreshCw className="size-3.5 animate-spin" />
          <span>Scanning…</span>
        </>
      ) : (
        <>
          <Zap className="size-3.5" />
          <span>Scan Workspace</span>
        </>
      )}
    </Button>
  );
}
