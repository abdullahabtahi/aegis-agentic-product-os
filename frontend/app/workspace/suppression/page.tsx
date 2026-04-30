"use client";

/**
 * /workspace/suppression — Governor Suppression Log.
 *
 * Shows every intervention the Governor auto-blocked, with the denial reason.
 * This surface builds founder trust: they can see Aegis is protecting them
 * from noise, not silently failing.
 *
 * Per product-principles.md: "Reframe risk as lost upside, not threat."
 * Language here is neutral — "Governor blocked" not "Aegis failed."
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useInterventionInbox } from "@/hooks/useInterventionInbox";
import { useWorkspaceId } from "@/hooks/useWorkspaceId";
import { ACTION_LABELS, RISK_LABELS } from "@/lib/constants";
import { getSuppressionRules, deleteSuppressionRule } from "@/lib/api";
import type { Intervention, SuppressionRule } from "@/lib/types";
import { ShieldOff, RefreshCw, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const DENIAL_REASON_LABELS: Record<string, string> = {
  confidence_below_floor:     "Confidence too low",
  duplicate_suppression:      "Duplicate in last 30 days",
  rate_cap_exceeded:          "Rate cap — max 2 / 7 days",
  jules_gate_blocked:         "Jules gate — workspace not enabled",
  irreversible_no_ack:        "Irreversible action, risk not acknowledged",
  risk_not_acknowledged:      "Risk type not acknowledged by founder",
  control_level_blocked:      "Control level — auto-exec not permitted",
  escalation_ladder_violation: "Escalation ladder — skipped a level",
  override_teach_suppression:  "Rejected 2× in 30 days — auto-suppressed",
};

export default function SuppressionPage() {
  const workspaceId = useWorkspaceId();
  const queryClient = useQueryClient();
  const { pending, resolved, loading, refresh } = useInterventionInbox(workspaceId);

  const { data: suppressionRules = [] } = useQuery({
    queryKey: ["suppression-rules", workspaceId],
    queryFn: () => getSuppressionRules(workspaceId),
    staleTime: 30_000,
    enabled: !!workspaceId,
  });

  const deleteRule = useMutation({
    mutationFn: (ruleId: string) => deleteSuppressionRule(ruleId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["suppression-rules", workspaceId] }),
  });

  const suppressed = [...pending, ...resolved].filter(
    (i) =>
      i.status === "dismissed" ||
      (i.denial_reason && i.status !== "accepted" && i.status !== "rejected"),
  );

  return (
    <div className="h-full flex flex-col">
        {/* Page header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8 shrink-0">
          <div className="flex items-center gap-2">
            <ShieldOff className="w-3.5 h-3.5 text-white/30" />
            <span className="text-xs font-semibold text-white/60 tracking-wide uppercase">
              Suppression Log
            </span>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="text-white/25 hover:text-white/50 transition-colors"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">

          {/* ── Auto-suppressed patterns section ──────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-white/30" />
              <span className="text-[10px] font-semibold text-white/40 tracking-wide uppercase">
                Auto-suppressed patterns
              </span>
            </div>
            {suppressionRules.length === 0 ? (
              <p className="text-[11px] text-white/20 pl-1">
                No auto-suppressions active — Aegis will propose interventions freely.
              </p>
            ) : (
              <div className="space-y-1">
                {suppressionRules.map((rule) => (
                  <SuppressionRuleRow
                    key={rule.id}
                    rule={rule}
                    onUnsuppress={() => deleteRule.mutate(rule.id)}
                    isPending={deleteRule.isPending && deleteRule.variables === rule.id}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Separator ──────────────────────────────────────────────── */}
          <div className="border-t border-white/8" />

          {/* ── Governor-blocked interventions section ─────────────────── */}
          {suppressed.length === 0 && !loading && (
            <div className="text-center py-16 space-y-2">
              <ShieldOff className="w-8 h-8 text-white/10 mx-auto" />
              <p className="text-[11px] text-white/20">
                No suppressions
              </p>
              <p className="text-[10px] text-white/12">
                Governor is passing all interventions to your inbox
              </p>
            </div>
          )}

          {suppressed.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-white/25 mb-4 leading-relaxed">
                These interventions were blocked by the Governor policy engine.
                They did not reach your inbox.
              </p>
              {suppressed.map((i) => (
                <SuppressionRow key={i.id} intervention={i} />
              ))}
            </div>
          )}
        </div>
      </div>
  );
}

function SuppressionRuleRow({
  rule,
  onUnsuppress,
  isPending,
}: {
  rule: SuppressionRule;
  onUnsuppress: () => void;
  isPending: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 px-3 rounded-lg border border-white/5 bg-white/2 hover:bg-white/4 transition-colors">
      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400/40 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-medium text-white/60">
            {RISK_LABELS[rule.risk_type]}
          </span>
          <span className="text-[10px] text-white/30">·</span>
          <span className="text-[10px] text-white/40">{ACTION_LABELS[rule.action_type]}</span>
        </div>
        <p className="text-[10px] text-white/30 mt-0.5">{rule.rejection_reason.replace(/_/g, " ")}</p>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-[9px] text-white/15 font-mono">
            Since {new Date(rule.suppressed_at).toLocaleDateString()}
          </span>
          {rule.suppressed_until ? (
            <span className="text-[9px] text-white/15 font-mono">
              Until {new Date(rule.suppressed_until).toLocaleDateString()}
            </span>
          ) : (
            <span className="text-[9px] text-white/15 font-mono">Permanent</span>
          )}
        </div>
      </div>
      <button
        onClick={onUnsuppress}
        disabled={isPending}
        className="shrink-0 rounded-md px-2 py-1 text-[10px] font-medium text-amber-400/70 hover:text-amber-300 hover:bg-white/5 disabled:opacity-40 transition-colors"
      >
        {isPending ? "…" : "Unsuppress"}
      </button>
    </div>
  );
}

function SuppressionRow({ intervention: i }: { intervention: Intervention }) {
  const denialLabel = i.denial_reason
    ? (DENIAL_REASON_LABELS[i.denial_reason] ?? i.denial_reason.replace(/_/g, " "))
    : "Auto-suppressed";

  return (
    <div className="flex items-start gap-3 py-2.5 px-3 rounded-lg border border-white/5 bg-white/2 hover:bg-white/4 transition-colors">
      <ShieldOff className="w-3.5 h-3.5 text-white/20 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-medium text-white/60">
            {ACTION_LABELS[i.action_type]}
          </span>
          {i.bet_name && (
            <span className="text-[10px] text-white/25 truncate">
              {i.bet_name}
            </span>
          )}
        </div>
        <p className="text-[10px] text-white/30 mt-0.5 font-mono">
          {denialLabel}
        </p>
      </div>
      <span className="text-[9px] text-white/15 font-mono shrink-0 mt-0.5">
        {new Date(i.created_at).toLocaleDateString()}
      </span>
    </div>
  );
}
