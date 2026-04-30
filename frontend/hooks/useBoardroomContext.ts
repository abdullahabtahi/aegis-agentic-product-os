"use client";

import { useQuery } from "@tanstack/react-query";
import { getBet } from "@/lib/api";
import type { BoardroomContext } from "@/lib/types";
const FALLBACK_ID = "default_workspace";

type ContextStatus = "loading" | "ready" | "error";

interface UseBoardroomContextResult {
  context: BoardroomContext | null;
  status: ContextStatus;
  systemPrompt: string;
}

function formatRiskSignals(
  signals: Array<{ risk_type: string; severity: string; description?: string }>,
): string {
  if (!signals.length) return "No risk signals detected yet.";
  return signals
    .slice(0, 8)
    .map((s) => `- [${s.severity.toUpperCase()}] ${s.risk_type}${s.description ? `: ${s.description}` : ""}`)
    .join("\n");
}

function buildSystemPrompt(ctx: BoardroomContext): string {
  return `You are THREE product advisors in an Aegis Boardroom session. You debate this decision together.

=== PRODUCT CONTEXT (from Aegis pipeline) ===
Bet: ${ctx.betName}
Hypothesis: ${ctx.hypothesis || "Not specified"}
Target Segment: ${ctx.targetSegment || "Not specified"}
Problem: ${ctx.problemStatement || "Not specified"}

=== RISK INTELLIGENCE (Aegis Signal Engine) ===
${formatRiskSignals(ctx.riskSignals)}

=== TODAY'S DISCUSSION ===
Decision: "${ctx.decisionQuestion}"
Key Assumption: "${ctx.keyAssumption}"

=== YOUR PERSONAS ===
[BEAR] Jordan — The Skeptic
  Challenge every assumption. If risk signals are present, cite them in your opening.
  Never accept a hypothesis without asking for evidence.

[BULL] Maya — The Champion
  Argue the strongest case for this bet. Reference the approved hypothesis and opportunity.
  Be specific about what the competition is missing.

[SAGE] Ren — The Operator
  Bridge Bear and Bull. Always close with 2-3 concrete experiments for the next 2 weeks.
  Focus on what must be true, not opinions.

=== RULES ===
- Always prefix your response with [BEAR], [BULL], or [SAGE].
- Agents can directly challenge or agree with each other.
- When you hear "BEGIN_SESSION", open the discussion with [BEAR] citing a specific risk (if any).
- When you hear "SESSION_ENDING", each agent delivers one closing sentence.
- Keep individual turns under 60 words. This is a conversation, not a monologue.
- Never break character. Never acknowledge you are an AI during the session.`;
}

export function useBoardroomContext(
  betId: string | null,
  decisionQuestion: string,
  keyAssumption: string,
): UseBoardroomContextResult {
  const { data: bet, isLoading, isError } = useQuery({
    queryKey: ["bet", betId],
    queryFn: () => getBet(betId!),
    enabled: !!betId && betId !== FALLBACK_ID,
    staleTime: 60_000,
    // Never retry on 4xx — those are definitive and retrying blocks the UI
    retry: (_, err) => {
      const msg = (err as Error)?.message ?? "";
      const match = msg.match(/^(\d{3})/);
      const status = match ? parseInt(match[1], 10) : null;
      return status === null || status >= 500;
    },
  });

  if (isLoading) {
    return { context: null, status: "loading", systemPrompt: "" };
  }

  // Bet does not yet expose attached risk signals on its serialized shape.
  // When that field lands, hydrate it here. Until then, advisors work from
  // hypothesis + decision_question alone (graceful degradation per FR-BR-13).
  const betRiskSignals = (bet as { risk_signals?: Array<{ risk_type: string; severity: string; explanation?: string | null }> } | undefined)?.risk_signals ?? [];
  const riskSignals = betRiskSignals.map((s) => ({
    risk_type: s.risk_type,
    severity: s.severity,
    description: s.explanation ?? undefined,
  }));

  const context: BoardroomContext = {
    betName: bet?.name ?? "Unknown Bet",
    hypothesis: bet?.hypothesis ?? "",
    targetSegment: bet?.target_segment ?? "",
    problemStatement: bet?.problem_statement ?? "",
    riskSignals,
    governorFlags: [],
    decisionQuestion,
    keyAssumption,
  };

  const status: ContextStatus = isError ? "error" : "ready";
  const systemPrompt = buildSystemPrompt(context);

  return { context, status, systemPrompt };
}
