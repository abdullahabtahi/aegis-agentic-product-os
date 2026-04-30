import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Bet, ConvictionScore, ConvictionLevel } from "@/lib/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Derives a conviction score from available `Bet` fields only — no backend call needed.
 * Covers 4 of the 6 spec dimensions (bet_coverage and no_chronic_rollovers require
 * linear_signals from BetSnapshot and default to 0 until the backend embeds them).
 * Returns null if the bet has never been scanned (to show "Unscanned" in the UI).
 */
export function deriveConvictionFromBet(bet: Bet): ConvictionScore | null {
  // Never-scanned bets → show Unscanned state instead of a misleading score
  if (!bet.last_monitored_at) return null;

  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const fourteenDays = 14 * 24 * 60 * 60 * 1000;

  // Dimension 1: kill_criteria_defined — 20 pts
  const killMet = !!(bet.kill_criteria && bet.kill_criteria.status !== "waived");
  const killEarned = killMet ? 20 : 0;

  // Dimension 2: hypothesis_present — 15 pts
  const hypothesisMet = !!bet.hypothesis;
  const hypothesisEarned = hypothesisMet ? 15 : 0;

  // Dimension 3: success_metric_defined — 8/15 pts (partial; full 15 needs metric_linked from linear_signals)
  const hasMetrics = (bet.success_metrics?.length ?? 0) > 0;
  const metricEarned = hasMetrics ? 8 : 0;

  // Dimension 4: bet_coverage — 0 pts (requires linear_signals; shown as 0 until backend embeds)
  // Dimension 5: no_chronic_rollovers — 0 pts (requires linear_signals)

  // Dimension 6: recently_scanned — 15 pts
  const elapsed = now - new Date(bet.last_monitored_at).getTime();
  const scanEarned = elapsed <= sevenDays ? 15 : elapsed <= fourteenDays ? 7 : 0;
  const scanMet = scanEarned === 15;

  const total = killEarned + hypothesisEarned + metricEarned + scanEarned;
  const level: ConvictionLevel =
    total >= 80 ? "strong" :
    total >= 55 ? "developing" :
    total >= 30 ? "nascent" :
    "critical";

  return {
    total,
    level,
    computed_at: new Date().toISOString(),
    dimensions: [
      { key: "kill_criteria_defined", name: "Kill Criteria Defined", points_earned: killEarned,       points_max: 20, met: killMet },
      { key: "hypothesis_present",    name: "Hypothesis Present",    points_earned: hypothesisEarned, points_max: 15, met: hypothesisMet },
      { key: "success_metric_defined",name: "Success Metric",        points_earned: metricEarned,     points_max: 15, met: hasMetrics },
      { key: "bet_coverage",          name: "Bet Coverage ≥ 40%",    points_earned: 0,                points_max: 20, met: false },
      { key: "no_chronic_rollovers",  name: "No Chronic Rollovers",  points_earned: 0,                points_max: 15, met: false },
      { key: "recently_scanned",      name: "Scanned Within 7 Days", points_earned: scanEarned,       points_max: 15, met: scanMet },
    ],
  };
}

/** Lightweight relative time formatter — no external dependency. */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/**
 * Derive the most recent `last_monitored_at` timestamp across a list of bets.
 * Returns null if none have been monitored.
 */
export function latestScanTime(bets: Array<{ last_monitored_at?: string | null }>): string | null {
  return bets.reduce<string | null>((latest, b) => {
    if (!b.last_monitored_at) return latest;
    return !latest || b.last_monitored_at > latest ? b.last_monitored_at : latest;
  }, null);
}
