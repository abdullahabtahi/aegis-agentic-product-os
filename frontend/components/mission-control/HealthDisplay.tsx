"use client";

/**
 * HealthDisplay - Bet Health Score (Mission Control HUD)
 *
 * Design: Big number display inspired by spacecraft systems health
 * Shows: Bet name, health score (0-100), operational status
 */

import { Activity } from "lucide-react";
import styles from "@/app/workspace/mission-control.module.css";
import type { AegisPipelineState } from "@/lib/types";

interface HealthDisplayProps {
  agentState: AegisPipelineState;
}

export function HealthDisplay({ agentState }: HealthDisplayProps) {
  const betName = agentState.bet?.name || "No Bet Declared";

  // Calculate health score from risk signal confidence
  const riskDraft =
    typeof agentState.risk_signal_draft === "string"
      ? (() => {
          try {
            return JSON.parse(agentState.risk_signal_draft) as Record<string, unknown>;
          } catch {
            return null;
          }
        })()
      : (agentState.risk_signal_draft as Record<string, unknown> | null);

  const confidence = riskDraft?.confidence ? Number(riskDraft.confidence) : 0;

  // Health score: inverse of risk confidence (high risk = low health)
  // If no risk signal, assume healthy (72 baseline)
  const healthScore = riskDraft
    ? Math.round((1 - confidence) * 100)
    : 72;

  // Color thresholds
  const healthClass =
    healthScore >= 70 ? "healthy" :
    healthScore >= 40 ? "warning" :
    "critical";

  const statusText =
    healthScore >= 70 ? "SYSTEMS NOMINAL" :
    healthScore >= 40 ? "ATTENTION REQUIRED" :
    "IMMEDIATE ACTION";

  return (
    <div className={`${styles.healthDisplay} ${styles.fadeInUp}`}>
      <div className={styles.betInfo}>
        <div className={styles.betName}>{betName}</div>
        <div className={styles.betMeta}>
          <Activity size={12} style={{ display: "inline", marginRight: "0.5rem" }} />
          {statusText} • Last scan: {new Date().toLocaleTimeString()}
        </div>
      </div>
      <div className={styles.healthScore}>
        <div className={`${styles.scoreValue} ${styles[healthClass]}`}>
          {healthScore}
        </div>
        <div className={styles.scoreLabel}>HEALTH SCORE</div>
      </div>
    </div>
  );
}
