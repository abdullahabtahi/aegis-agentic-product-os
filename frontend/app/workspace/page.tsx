"use client";

/**
 * Home / Overview Page
 *
 * Linear-style dashboard showing:
 * - System health and autonomy level
 * - Recent autonomous actions (last 24h)
 * - Active bets overview
 * - Quick actions
 */

import { TrendingUp, CheckCircle, AlertTriangle, Clock, ArrowRight, Zap } from "lucide-react";
import styles from "./Home.module.css";

// Mock data - will be replaced with real API calls
const mockData = {
  health: 72,
  autonomyLevel: "L2",
  recentActions: [
    {
      id: "1",
      timestamp: "2h ago",
      action: "Created issue: Strategy sync",
      bet: "Ship v2 onboarding",
      type: "autonomous"
    },
    {
      id: "2",
      timestamp: "4h ago",
      action: "Freed 12h engineering time",
      bet: "Ship v2 onboarding",
      type: "autonomous"
    },
    {
      id: "3",
      timestamp: "6h ago",
      action: "Scheduled metric review",
      bet: "Mobile redesign",
      type: "autonomous"
    }
  ],
  activeBets: [
    {
      id: "1",
      name: "Ship v2 onboarding",
      health: 35,
      status: "warning",
      risk: "Strategy unclear",
      issues: 47
    },
    {
      id: "2",
      name: "Mobile redesign",
      health: 82,
      status: "healthy",
      risk: null,
      issues: 23
    },
    {
      id: "3",
      name: "API performance",
      health: 78,
      status: "healthy",
      risk: null,
      issues: 12
    }
  ],
  activeRisks: 1
};

export default function HomePage() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* Greeting */}
        <div className={styles.greeting}>
          <h1>Good morning 👋</h1>
          <p className={styles.greetingSubtitle}>
            Here's what happened while you were away
          </p>
        </div>

        {/* System status cards */}
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>System Health</div>
            <div className={styles.statValue}>
              <span className={`${styles.statNumber} ${styles.statHealthy}`}>
                {mockData.health}
              </span>
              <span className={styles.statBadge}>Nominal</span>
            </div>
            <div className={styles.statSubtext}>
              <TrendingUp size={14} />
              <span>Steady</span>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statLabel}>Autonomous Actions</div>
            <div className={styles.statValue}>
              <span className={styles.statNumber}>
                {mockData.recentActions.length}
              </span>
              <span className={styles.statBadge}>Last 24h</span>
            </div>
            <div className={styles.statSubtext}>
              <Zap size={14} />
              <span>{mockData.autonomyLevel} Autonomous</span>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statLabel}>Active Risks</div>
            <div className={styles.statValue}>
              <span className={`${styles.statNumber} ${mockData.activeRisks > 0 ? styles.statWarning : ''}`}>
                {mockData.activeRisks}
              </span>
              <span className={styles.statBadge}>Requires attention</span>
            </div>
            <div className={styles.statSubtext}>
              {mockData.activeRisks > 0 ? (
                <>
                  <AlertTriangle size={14} />
                  <span>Strategy unclear</span>
                </>
              ) : (
                <>
                  <CheckCircle size={14} />
                  <span>All clear</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Recent autonomous actions */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Recent Autonomous Actions</h2>
            <span className={styles.sectionSubtitle}>
              Actions Aegis took automatically
            </span>
          </div>

          <div className={styles.actionsList}>
            {mockData.recentActions.map((action) => (
              <div key={action.id} className={styles.actionCard}>
                <div className={styles.actionIcon}>
                  <Zap size={16} />
                </div>
                <div className={styles.actionContent}>
                  <div className={styles.actionTitle}>{action.action}</div>
                  <div className={styles.actionMeta}>
                    <span className={styles.actionBet}>{action.bet}</span>
                    <span className={styles.actionDot}>•</span>
                    <span className={styles.actionTime}>{action.timestamp}</span>
                  </div>
                </div>
                <button className={styles.actionButton}>
                  <ArrowRight size={16} />
                </button>
              </div>
            ))}
          </div>

          <button className={styles.viewAllButton}>
            View all actions
            <ArrowRight size={14} />
          </button>
        </section>

        {/* Active bets */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Active Bets</h2>
            <span className={styles.sectionSubtitle}>
              {mockData.activeBets.length} bets being monitored
            </span>
          </div>

          <div className={styles.betsList}>
            {mockData.activeBets.map((bet) => (
              <div key={bet.id} className={styles.betCard}>
                <div className={styles.betHeader}>
                  <div className={styles.betTitle}>{bet.name}</div>
                  <div className={`${styles.betHealth} ${styles[`betHealth${bet.status === 'healthy' ? 'Healthy' : 'Warning'}`]}`}>
                    {bet.health}
                  </div>
                </div>

                <div className={styles.betMeta}>
                  <span className={styles.betIssues}>{bet.issues} issues</span>
                  <span className={styles.betDot}>•</span>
                  {bet.risk ? (
                    <span className={styles.betRisk}>
                      <AlertTriangle size={12} />
                      {bet.risk}
                    </span>
                  ) : (
                    <span className={styles.betHealthy}>
                      <CheckCircle size={12} />
                      Healthy
                    </span>
                  )}
                </div>

                <div className={styles.betProgress}>
                  <div
                    className={styles.betProgressBar}
                    style={{ width: `${bet.health}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <button className={styles.viewAllButton}>
            View all bets
            <ArrowRight size={14} />
          </button>
        </section>
      </div>
    </div>
  );
}
