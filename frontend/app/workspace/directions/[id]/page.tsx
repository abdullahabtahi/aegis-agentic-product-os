"use client";

/**
 * Direction Detail — full view for a single strategic direction.
 *
 * Sections:
 * 1. Header — name, status badge, time horizon, health score
 * 2. Hypothesis & metrics — core bet definition
 * 3. Active risk signal — current risk with evidence + confidence + product principle refs
 * 4. Pending intervention — inline approval card
 * 5. Historical interventions — timeline of resolved actions
 */

import { use, Suspense } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, AlertTriangle, CheckCircle2, Clock, Target,
  BookOpen, Zap, BarChart2, MessageSquare,
} from "lucide-react";
import {
  getBet, getInterventionsByBet, approveIntervention, rejectIntervention,
} from "@/lib/api";
import {
  BET_STATUS_LABELS, BET_STATUS_STYLES, RISK_LABELS,
  SEVERITY_BG, ACTION_LABELS,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { ApprovalCard } from "@/components/interventions/ApprovalCard";
import type { Intervention, RiskSignal, ProductPrincipleRef } from "@/lib/types";

const WORKSPACE_ID = "default_workspace";

// ─── Sub-components ───────────────────────────────────────────────────────────

function HealthScoreRing({ score }: { score: number }) {
  const color =
    score >= 80 ? "text-emerald-600" : score >= 50 ? "text-amber-600" : "text-red-600";
  const ringColor =
    score >= 80 ? "stroke-emerald-500" : score >= 50 ? "stroke-amber-500" : "stroke-red-500";
  const r = 20;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex h-14 w-14 items-center justify-center">
      <svg className="-rotate-90" width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={r} fill="none" strokeWidth="3" className="stroke-slate-200" />
        <circle
          cx="28" cy="28" r={r} fill="none" strokeWidth="3"
          className={ringColor}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className={cn("absolute font-mono text-sm font-bold", color)}>{score}</span>
    </div>
  );
}

function RiskSignalCard({ signal }: { signal: RiskSignal }) {
  const badgeClass = SEVERITY_BG[signal.severity] ?? "bg-slate-100 text-slate-500 border-slate-200";
  const pct = Math.round(signal.confidence * 100);
  const confColor =
    pct >= 75 ? "bg-emerald-500" : pct >= 55 ? "bg-amber-500" : "bg-red-400";

  return (
    <div className="glass-panel rounded-2xl p-5 space-y-3">
      {/* Risk header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", badgeClass)}>
              {signal.severity}
            </span>
            <span className="text-[11px] font-semibold text-slate-700">
              {RISK_LABELS[signal.risk_type]}
            </span>
          </div>
          {signal.headline && (
            <p className="text-sm font-semibold leading-snug text-slate-900 mt-1">
              {signal.headline}
            </p>
          )}
        </div>
        {/* Confidence pill */}
        <div className="shrink-0 text-right">
          <span className="font-mono text-lg font-bold text-slate-800">{pct}%</span>
          <p className="text-[10px] text-slate-400">confident</p>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="h-1 overflow-hidden rounded-full bg-slate-200">
        <div className={cn("h-full rounded-full", confColor)} style={{ width: `${pct}%` }} />
      </div>

      {/* Explanation */}
      {signal.explanation && (
        <p className="text-[12px] leading-relaxed text-slate-600">{signal.explanation}</p>
      )}

      {/* Evidence summary */}
      {signal.evidence_summary && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Evidence</p>
          <p className="text-[11px] leading-relaxed text-slate-600">{signal.evidence_summary}</p>
        </div>
      )}

      {/* Product principle citations */}
      {signal.product_principle_refs && signal.product_principle_refs.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Why this matters
          </p>
          <div className="flex flex-wrap gap-1.5">
            {signal.product_principle_refs.map((ref: ProductPrincipleRef) => (
              <span
                key={ref.id}
                className="flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10px] text-violet-700"
                title={ref.excerpt ?? undefined}
              >
                <BookOpen className="h-3 w-3 shrink-0" />
                {ref.source && <span className="text-violet-500">{ref.source}:</span>}
                {ref.name}
              </span>
            ))}
          </div>
          {/* Show excerpt from first ref if available */}
          {signal.product_principle_refs[0]?.excerpt && (
            <p className="text-[11px] leading-relaxed text-slate-500 italic pl-1">
              &ldquo;{signal.product_principle_refs[0].excerpt}&rdquo;
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function MetricCard({ name, target, current, unit }: {
  name: string; target: string | number; current?: string | number | null; unit: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400 truncate">{name}</p>
      <div className="mt-1 flex items-baseline gap-1.5">
        {current != null ? (
          <>
            <span className="font-mono text-base font-bold text-slate-800">{current}</span>
            <span className="text-[11px] text-slate-400">/ {target} {unit}</span>
          </>
        ) : (
          <span className="font-mono text-base font-bold text-slate-400">{target} {unit}</span>
        )}
      </div>
    </div>
  );
}

function InterventionHistoryRow({ intervention }: { intervention: Intervention }) {
  const isPrimary = intervention.status === "accepted";
  return (
    <div className="relative pl-7">
      <div className={cn(
        "absolute left-0 top-1 flex h-4 w-4 items-center justify-center rounded-full border",
        isPrimary ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-slate-50",
      )}>
        <div className={cn("h-1.5 w-1.5 rounded-full", isPrimary ? "bg-indigo-400" : "bg-slate-300")} />
      </div>
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-[10px] font-semibold uppercase tracking-wide",
            isPrimary ? "text-emerald-600" : "text-slate-400",
          )}>
            {intervention.status === "accepted" ? "Approved" : intervention.status}
          </span>
          <span className="text-[10px] text-slate-300">·</span>
          <span className="text-[10px] text-slate-500">{ACTION_LABELS[intervention.action_type]}</span>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-500 line-clamp-2">{intervention.rationale}</p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DirectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={
      <div className="flex flex-col gap-4 pb-6 animate-pulse">
        <div className="h-8 w-48 rounded-xl bg-slate-100" />
        <div className="glass-panel h-32 rounded-2xl" />
        <div className="glass-panel h-48 rounded-2xl" />
      </div>
    }>
      <DirectionDetailContent params={params} />
    </Suspense>
  );
}

function DirectionDetailContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();

  const { data: bet, isLoading: loadingBet, isError: betError } = useQuery({
    queryKey: ["bet", id],
    queryFn: () => getBet(id),
    retry: 1,
  });

  const { data: interventions = [], isLoading: loadingInterventions } = useQuery({
    queryKey: ["interventions-by-bet", WORKSPACE_ID, id],
    queryFn: () => getInterventionsByBet(WORKSPACE_ID, id),
    staleTime: 15_000,
  });

  const approveMutation = useMutation({
    mutationFn: (interventionId: string) => approveIntervention(interventionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interventions-by-bet", WORKSPACE_ID, id] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (interventionId: string) => rejectIntervention(interventionId, "other"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interventions-by-bet", WORKSPACE_ID, id] });
    },
  });

  const pending = interventions.filter((i: Intervention) => i.status === "pending");
  const resolved = interventions.filter((i: Intervention) => i.status !== "pending");

  const healthScore = bet
    ? Math.round((bet.declaration_confidence ?? 0.8) * 100)
    : 0;

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loadingBet) {
    return (
      <div className="flex flex-col gap-4 pb-6 animate-pulse">
        <div className="h-8 w-48 rounded-xl bg-slate-100" />
        <div className="glass-panel h-32 rounded-2xl" />
        <div className="glass-panel h-48 rounded-2xl" />
      </div>
    );
  }

  // ── Error / not found ──────────────────────────────────────────────────────
  if (betError || !bet) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <AlertTriangle size={28} className="text-red-500" />
        <p className="text-sm text-slate-500">Direction not found or backend unavailable.</p>
        <Link href="/workspace/directions" className="text-xs text-indigo-600 underline hover:text-indigo-700">
          Back to Directions
        </Link>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 pb-8">

      {/* Back nav */}
      <Link
        href="/workspace/directions"
        className="flex w-fit items-center gap-1.5 text-xs text-slate-400 transition-colors hover:text-slate-700"
      >
        <ArrowLeft size={13} />
        All directions
      </Link>

      {/* ── 1. Hero header ─────────────────────────────────────────────── */}
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-start gap-4">
          {/* Health ring */}
          <HealthScoreRing score={healthScore} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="font-heading text-xl font-bold text-slate-900">{bet.name}</h1>
              <span className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                BET_STATUS_STYLES[bet.status],
              )}>
                {BET_STATUS_LABELS[bet.status]}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-500">
              {bet.target_segment && (
                <span className="flex items-center gap-1">
                  <Target size={11} className="text-sky-500" />
                  {bet.target_segment}
                </span>
              )}
              {bet.time_horizon && (
                <span className="flex items-center gap-1">
                  <Clock size={11} className="text-amber-500" />
                  {bet.time_horizon}
                </span>
              )}
              {bet.last_monitored_at && (
                <span className="flex items-center gap-1">
                  <Zap size={11} className="text-indigo-500" />
                  Last scanned {new Date(bet.last_monitored_at).toLocaleDateString()}
                </span>
              )}
            </div>

            {bet.problem_statement && (
              <p className="mt-2 text-[12px] leading-relaxed text-slate-600">
                {bet.problem_statement}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── 2. Two-column: hypothesis + metrics ────────────────────────── */}
      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-7 glass-panel rounded-2xl p-5 space-y-3">
          <h2 className="font-heading text-sm font-semibold text-slate-700 flex items-center gap-2">
            <MessageSquare size={14} className="text-indigo-500" />
            Hypothesis
          </h2>
          {bet.hypothesis ? (
            <p className="text-[12px] leading-relaxed text-slate-600">{bet.hypothesis}</p>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <AlertTriangle size={13} className="text-amber-600 shrink-0" />
              <p className="text-[11px] text-amber-700">
                No hypothesis defined — this is your first risk signal. Add one to enable strategy monitoring.
              </p>
            </div>
          )}
        </div>

        <div className="col-span-5 glass-panel rounded-2xl p-5 space-y-3">
          <h2 className="font-heading text-sm font-semibold text-slate-700 flex items-center gap-2">
            <BarChart2 size={14} className="text-sky-500" />
            Success metrics
          </h2>
          {(bet.success_metrics?.length ?? 0) > 0 ? (
            <div className="grid grid-cols-1 gap-2">
              {bet.success_metrics!.map((m) => (
                <MetricCard
                  key={m.name}
                  name={m.name}
                  target={m.target_value}
                  current={m.current_value}
                  unit={m.unit}
                />
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-slate-400">No metrics defined yet.</p>
          )}
        </div>
      </div>

      {/* ── 3. Pending interventions ───────────────────────────────────── */}
      {(pending.length > 0 || loadingInterventions) && (
        <div className="space-y-3">
          <h2 className="font-heading text-sm font-semibold text-slate-700 flex items-center gap-2">
            <AlertTriangle size={14} className="text-red-500" />
            Awaiting your decision
            {pending.length > 0 && (
              <span className="rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-bold text-red-600">
                {pending.length}
              </span>
            )}
          </h2>
          {loadingInterventions ? (
            <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          ) : (
            pending.map((intervention) => (
              <ApprovalCard
                key={intervention.id}
                intervention={intervention}
                onApprove={(id) => approveMutation.mutate(id)}
                onReject={(id) => rejectMutation.mutate(id)}
                isExecuting={approveMutation.isPending || rejectMutation.isPending}
              />
            ))
          )}
        </div>
      )}

      {/* ── 4. Risk signal (from latest pending intervention) ─────────── */}
      {pending[0]?.risk_signal && (
        <div className="space-y-2">
          <h2 className="font-heading text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Zap size={14} className="text-indigo-500" />
            Current risk signal
          </h2>
          <RiskSignalCard signal={pending[0].risk_signal} />
        </div>
      )}

      {/* ── 5. Intervention history ────────────────────────────────────── */}
      {resolved.length > 0 && (
        <div className="glass-panel rounded-2xl p-5 space-y-4">
          <h2 className="font-heading text-sm font-semibold text-slate-700 flex items-center gap-2">
            <CheckCircle2 size={14} className="text-emerald-600" />
            Intervention history
          </h2>
          <div className="relative space-y-5">
            <div className="absolute bottom-2 left-[7px] top-2 w-px bg-slate-200" />
            {resolved.map((i) => (
              <InterventionHistoryRow key={i.id} intervention={i} />
            ))}
          </div>
        </div>
      )}

      {/* Empty: no interventions at all */}
      {!loadingInterventions && interventions.length === 0 && (
        <div className="glass-panel flex flex-col items-center gap-2 rounded-2xl py-12 text-center">
          <CheckCircle2 size={24} className="text-emerald-500" />
          <p className="text-sm font-medium text-slate-600">No interventions yet</p>
          <p className="text-xs text-slate-400">Aegis will flag risks after the next scan runs.</p>
        </div>
      )}
    </div>
  );
}
