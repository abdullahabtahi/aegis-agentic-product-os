"use client";

/**
 * RiskSignalCard - Mission Control Risk Display
 *
 * Design Principles:
 * 1. Frame as LOST UPSIDE, not threat
 * 2. Show confidence VISIBLY (anti-paternalism)
 * 3. Surface ONE intervention, not list
 * 4. Evidence-first, principle-second
 * 5. Pilot metaphor (instruments, not logs)
 */

import { AlertTriangle, TrendingDown, ExternalLink } from "lucide-react";
import styles from "@/app/workspace/mission-control.module.css";
import type { AegisPipelineState, EvidenceIssue } from "@/lib/types";

interface RiskSignalCardProps {
  agentState: AegisPipelineState;
  onApprove: (id: string) => void;
}

export function RiskSignalCard({ agentState, onApprove }: RiskSignalCardProps) {
  // DEBUG: Log entire agent state to console
  console.log('[RiskSignalCard] Full agent state:', JSON.stringify(agentState, null, 2));

  // Parse risk signal
  const riskDraft =
    typeof agentState.risk_signal_draft === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(agentState.risk_signal_draft) as Record<string, unknown>;
            console.log('[RiskSignalCard] Parsed risk_signal_draft:', parsed);
            return parsed;
          } catch (err) {
            console.error('[RiskSignalCard] Failed to parse risk_signal_draft:', err);
            return null;
          }
        })()
      : null;

  console.log('[RiskSignalCard] riskDraft:', riskDraft);
  console.log('[RiskSignalCard] intervention_proposal:', agentState.intervention_proposal);

  if (!riskDraft) {
    return (
      <div className={styles.riskPanel}>
        <div style={{
          padding: "var(--space-xl)",
          textAlign: "center",
          opacity: 0.5,
          fontFamily: "var(--font-mono)",
          fontSize: "0.875rem"
        }}>
          <TrendingDown size={48} style={{ margin: "0 auto var(--space-md)" }} />
          <p>SYSTEMS NOMINAL</p>
          <p style={{ marginTop: "var(--space-sm)", fontSize: "0.75rem", color: "#64748b" }}>
            No risk signals detected
          </p>
        </div>
      </div>
    );
  }

  const riskType = String(riskDraft.risk_type || "").replace(/_/g, " ").toUpperCase();
  const confidence = Number(riskDraft.confidence || 0);
  const headline = String(riskDraft.headline || "Signal detected");
  const evidenceIssues = (riskDraft.evidence_issues as EvidenceIssue[]) || [];

  // Lost upside calculation (example - should come from backend)
  const lostUpside = confidence > 0.7
    ? "4 recurring meetings likely cost you 2 hypothesis validations this week"
    : "Keeping current trajectory means 30% of work won't map to stated bet by next sprint";

  // Intervention
  const intervention = agentState.intervention_proposal;
  const actionType = intervention?.action_type?.replace(/_/g, " ") || "Review Signal";

  return (
    <div className={`${styles.riskPanel} ${styles.fadeInUp}`}>
      {/* Risk Header */}
      <div className={styles.riskHeader}>
        <div className={styles.riskIcon}>
          <AlertTriangle size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <div className={styles.riskType}>{riskType}</div>
          <h2 className={styles.riskHeadline}>{headline}</h2>
        </div>
      </div>

      {/* Confidence Gauge */}
      <div className={styles.confidenceGauge}>
        <div className={styles.confidenceLabel}>
          <span>AI Reasoning Confidence</span>
          <span className={styles.confidenceValue}>{Math.round(confidence * 100)}%</span>
        </div>
        <div className={styles.confidenceBar}>
          <div
            className={styles.confidenceFill}
            style={{ width: `${confidence * 100}%` }}
          />
        </div>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.625rem",
          color: "#94a3b8",
          marginTop: "var(--space-xs)"
        }}>
          Product Brain analyzed {evidenceIssues.length} Linear issues
        </div>
      </div>

      {/* Lost Upside (not threat) */}
      <div className={styles.lostUpside}>
        <div className={styles.lostUpsideLabel}>⚠ LOST UPSIDE</div>
        <p className={styles.lostUpsideText}>{lostUpside}</p>
      </div>

      {/* Evidence Cards */}
      {evidenceIssues.length > 0 && (
        <div className={styles.evidenceSection}>
          <div className={styles.evidenceHeader}>
            Supporting Evidence ({evidenceIssues.length})
          </div>
          {evidenceIssues.slice(0, 3).map((issue) => (
            <a
              key={issue.id}
              href={issue.url}
              target="_blank"
              rel="noreferrer"
              className={styles.evidenceCard}
            >
              <div className={styles.evidenceTitle}>
                <span className={styles.evidenceId}>{issue.id}</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {issue.title}
                </span>
                <ExternalLink size={14} style={{ opacity: 0.5 }} />
              </div>
              <div className={styles.evidenceMeta}>
                <span>{issue.status}</span>
              </div>
            </a>
          ))}
          {evidenceIssues.length > 3 && (
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.75rem",
              color: "#64748b",
              textAlign: "center",
              padding: "var(--space-sm)"
            }}>
              +{evidenceIssues.length - 3} more issues in analysis
            </div>
          )}
        </div>
      )}

      {/* Intervention Action */}
      <div className={styles.interventionAction}>
        <div className={styles.interventionLabel}>
          Recommended Action • Escalation Level {intervention?.escalation_level || 1}
        </div>
        <button
          className={styles.actionButton}
          onClick={() => {
            const interventionId = agentState.awaiting_approval_intervention?.id;
            if (interventionId) {
              onApprove(interventionId);
            }
          }}
        >
          {actionType}
        </button>
        <div style={{
          marginTop: "var(--space-sm)",
          fontSize: "0.75rem",
          color: "#64748b",
          textAlign: "center",
          fontFamily: "var(--font-mono)"
        }}>
          Review in Co-Pilot chat for alternatives
        </div>
      </div>
    </div>
  );
}
