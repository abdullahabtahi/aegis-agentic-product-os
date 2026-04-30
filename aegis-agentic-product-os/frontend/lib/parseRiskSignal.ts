import type { RiskSignal, RiskType, Severity } from "@/lib/types";

const VALID_RISK_TYPES = new Set<RiskType>([
  "strategy_unclear",
  "alignment_issue",
  "execution_issue",
  "placebo_productivity",
]);

const VALID_SEVERITIES = new Set<Severity>(["low", "medium", "high", "critical"]);

export function parseRiskSignal(raw: string | undefined): RiskSignal | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!VALID_RISK_TYPES.has(parsed?.risk_type)) return null;
    if (typeof parsed.confidence !== "number") return null;
    if (!VALID_SEVERITIES.has(parsed?.severity)) return null;
    if (typeof parsed.evidence_summary !== "string") return null;
    return parsed as RiskSignal;
  } catch {
    return null;
  }
}
