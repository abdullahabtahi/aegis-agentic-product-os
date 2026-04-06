"use client";

/**
 * ScanTrigger — Initiates the ADK Aegis Pipeline via AG-UI / CopilotKit.
 *
 * When clicked, it sends a structured JSON message to the backend as a
 * user turn, which the SignalEngineAgent parses from ctx.session.events.
 * This is the "Scan Workspace" action that kicks off the Detect cycle.
 *
 * Protocol:
 *   Click → useCopilotAction run → AG-UI user message with bet payload →
 *   SignalEngine._parse_bet_from_user_message → pipeline starts
 */

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useCoAgent } from "@copilotkit/react-core";
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

  const handleScan = async () => {
    if (!bet || scanning) return;
    setScanning(true);

    try {
      // Reset pipeline state so the feed re-animates from scratch
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
    } finally {
      // Re-enable after brief delay to avoid double-click race
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
