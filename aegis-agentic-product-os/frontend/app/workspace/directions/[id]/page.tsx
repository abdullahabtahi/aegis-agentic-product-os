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

import { use, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, AlertTriangle, CheckCircle2, Clock, Target,
  BookOpen, Zap, BarChart2, MessageSquare, Pencil, Archive, ShieldCheck, Plus, X,
} from "lucide-react";
import {
  getBet, getInterventionsByBet, approveIntervention, rejectIntervention,
  updateBet, archiveBet, addAcknowledgedRisk, removeAcknowledgedRisk,
} from "@/lib/api";
import type { AcknowledgedRiskRequest } from "@/lib/api";
import {
  BET_STATUS_LABELS, BET_STATUS_STYLES, RISK_LABELS,
  SEVERITY_BG, ACTION_LABELS,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { ApprovalCard } from "@/components/interventions/ApprovalCard";
import type { Intervention, RiskSignal, ProductPrincipleRef, RiskType } from "@/lib/types";
import { useWorkspaceId } from "@/hooks/useWorkspaceId";

// ─── Sub-components ───────────────────────────────────────────────────────────

// ─── Health score derivation (pure, no backend call needed) ──────────────────

function deriveHealthScore(bet: { last_monitored_at?: string | null }, interventions?: Intervention[]): number | null {
  if (!bet.last_monitored_at) return null;
  const hasPending = interventions?.some((i) => i.status === "pending");
  if (hasPending) return 35;
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const hasRecentAccepted = interventions?.some(
    (i) => i.status === "accepted" && i.created_at > sevenDaysAgo,
  );
  if (hasRecentAccepted) return 68;
  return 88;
}

function HealthScoreRing({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <div className="relative flex h-14 w-14 items-center justify-center">
        <svg className="-rotate-90" width="56" height="56" viewBox="0 0 56 56">
          <circle cx="28" cy="28" r={20} fill="none" strokeWidth="3" className="stroke-slate-200" />
        </svg>
        <span className="absolute font-mono text-sm font-bold text-slate-400">—</span>
      </div>
    );
  }
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
                < BookOpen className="h-3 w-3 shrink-0" />
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
  const workspaceId = useWorkspaceId();
  const queryClient = useQueryClient();
  const router = useRouter();

  // Edit form state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<{
    name: string; target_segment: string; problem_statement: string;
    hypothesis: string; time_horizon: string; linear_project_ids: string;
  }>>({});

  // Archive confirmation state
  const [confirmArchive, setConfirmArchive] = useState(false);

  // Add ack risk form state
  const [addingRisk, setAddingRisk] = useState(false);
  const [newRiskType, setNewRiskType] = useState<RiskType>("strategy_unclear");
  const [newRiskNote, setNewRiskNote] = useState("");

  const { data: bet, isLoading: loadingBet, isError: betError } = useQuery({
    queryKey: ["bet", id],
    queryFn: () => getBet(id),
    retry: 1,
  });

  const { data: interventions = [], isLoading: loadingInterventions } = useQuery({
    queryKey: ["interventions-by-bet", workspaceId, id],
    queryFn: () => getInterventionsByBet(workspaceId, id),
    staleTime: 15_000,
    enabled: workspaceId !== "default_workspace",
  });

  const approveMutation = useMutation({
    mutationFn: (interventionId: string) => approveIntervention(interventionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interventions-by-bet", workspaceId, id] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (interventionId: string) => rejectIntervention(interventionId, "other"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interventions-by-bet", workspaceId, id] });
    },
  });

  const editMutation = useMutation({
    mutationFn: (body: Parameters<typeof updateBet>[1]) => updateBet(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bet", id] });
      setEditing(false);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveBet(id),
    onSuccess: () => {
      router.push("/workspace/directions");
    },
  });

  const addRiskMutation = useMutation({
    mutationFn: (body: AcknowledgedRiskRequest) => addAcknowledgedRisk(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bet", id] });
      setAddingRisk(false);
      setNewRiskNote("");
    },
  });

  const removeRiskMutation = useMutation({
    mutationFn: (riskType: RiskType) => removeAcknowledgedRisk(id, riskType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bet", id] });
    },
  });

  const pending = interventions.filter((i: Intervention) => i.status === "pending");
  const resolved = interventions.filter((i: Intervention) => i.status !== "pending");

  const healthScore = bet ? deriveHealthScore(bet, interventions) : null;

  const ALL_RISK_TYPES: RiskType[] = [
    "strategy_unclear", "alignment_issue", "execution_issue", "placebo_productivity",
  ];

  function openEdit() {
    if (!bet) return;
    setEditForm({
      name: bet.name,
      target_segment: bet.target_segment ?? "",
      problem_statement: bet.problem_statement ?? "",
      hypothesis: bet.hypothesis ?? "",
      time_horizon: bet.time_horizon ?? "",
      linear_project_ids: (bet.linear_project_ids ?? []).join(", "),
    });
    setEditing(true);
  }

  function submitEdit() {
    const { linear_project_ids, ...rest } = editForm;
    const ids = linear_project_ids
      ? linear_project_ids.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;
    editMutation.mutate({ ...rest, ...(ids !== undefined ? { linear_project_ids: ids } : {}) });
  }

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

  const acknowledgedRiskTypes = new Set((bet.acknowledged_risks ?? []).map((r) => r.risk_type));
  const availableRiskTypes = ALL_RISK_TYPES.filter((rt) => !acknowledgedRiskTypes.has(rt));

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
              {/* Scan CTA — triggers agent scan via prefilled home page prompt */}
              <button
                onClick={() => router.push(`/workspace?message=Scan+direction+${encodeURIComponent(bet.id)}+for+risks`)}
                className="ml-auto flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors"
              >
                <Zap size={12} /> Scan for risks
              </button>
              <button
                onClick={openEdit}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Pencil size={12} /> Edit
              </button>
              {!confirmArchive ? (
                <button
                  onClick={() => setConfirmArchive(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  <Archive size={12} /> Archive
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-600">Confirm archive?</span>
                  <button
                    onClick={() => archiveMutation.mutate()}
                    disabled={archiveMutation.isPending}
                    className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {archiveMutation.isPending ? "Archiving…" : "Yes"}
                  </button>
                  <button
                    onClick={() => setConfirmArchive(false)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    No
                  </button>
                </div>
              )}
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

      {/* ── Edit form ──────────────────────────────────────────────────── */}
      {editing && (
        <div className="glass-panel rounded-2xl p-5 space-y-4 border border-indigo-200">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Pencil size={14} className="text-indigo-500" /> Edit Direction
            </h2>
            <button onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Name</label>
              <input
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none"
                value={editForm.name ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Target Segment</label>
              <input
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none"
                value={editForm.target_segment ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, target_segment: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Time Horizon</label>
              <input
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none"
                value={editForm.time_horizon ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, time_horizon: e.target.value }))}
              />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Problem Statement</label>
              <textarea
                rows={2}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none resize-none"
                value={editForm.problem_statement ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, problem_statement: e.target.value }))}
              />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Hypothesis</label>
              <textarea
                rows={2}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none resize-none"
                value={editForm.hypothesis ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, hypothesis: e.target.value }))}
              />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Linear Project IDs (comma-separated)</label>
              <input
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none font-mono"
                value={editForm.linear_project_ids ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, linear_project_ids: e.target.value }))}
              />
            </div>
          </div>
          {editMutation.isError && (
            <p className="text-xs text-red-500">{(editMutation.error as Error).message}</p>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={submitEdit}
              disabled={editMutation.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {editMutation.isPending ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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

      {/* ── 2b. Acknowledged Risks ─────────────────────────────────────── */}
      <div className="glass-panel rounded-2xl p-5 space-y-3">
        <h2 className="font-heading text-sm font-semibold text-slate-700 flex items-center gap-2">
          <ShieldCheck size={14} className="text-emerald-500" />
          Acknowledged Risks
        </h2>
        {(bet.acknowledged_risks?.length ?? 0) === 0 ? (
          <p className="text-[11px] text-slate-400">No risks acknowledged yet.</p>
        ) : (
          <div className="space-y-2">
            {bet.acknowledged_risks!.map((entry) => (
              <div
                key={entry.risk_type}
                className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
              >
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="text-[12px] font-semibold text-slate-700">
                    {RISK_LABELS[entry.risk_type]}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {new Date(entry.acknowledged_at).toLocaleDateString()}
                  </p>
                  {entry.founder_note && (
                    <p className="text-[11px] text-slate-500 italic">{entry.founder_note}</p>
                  )}
                </div>
                <button
                  onClick={() => removeRiskMutation.mutate(entry.risk_type)}
                  disabled={removeRiskMutation.isPending}
                  className="shrink-0 rounded-md px-2 py-1 text-[10px] font-medium text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        {!addingRisk ? (
          <button
            onClick={() => {
              setNewRiskType(availableRiskTypes[0] ?? "strategy_unclear");
              setAddingRisk(true);
            }}
            disabled={availableRiskTypes.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Plus size={12} /> Add acknowledged risk
          </button>
        ) : (
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex gap-2">
              <select
                value={newRiskType}
                onChange={(e) => setNewRiskType(e.target.value as RiskType)}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-indigo-400 focus:outline-none"
              >
                {availableRiskTypes.map((rt) => (
                  <option key={rt} value={rt}>{RISK_LABELS[rt]}</option>
                ))}
              </select>
              <button onClick={() => setAddingRisk(false)} className="text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            </div>
            <textarea
              rows={2}
              placeholder="Founder note (optional)"
              value={newRiskNote}
              onChange={(e) => setNewRiskNote(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-400 focus:outline-none resize-none"
            />
            {addRiskMutation.isError && (
              <p className="text-[10px] text-red-500">{(addRiskMutation.error as Error).message}</p>
            )}
            <button
              onClick={() => addRiskMutation.mutate({
                risk_type: newRiskType,
                founder_note: newRiskNote.trim() || undefined,
              })}
              disabled={addRiskMutation.isPending}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {addRiskMutation.isPending ? "Saving…" : "Acknowledge"}
            </button>
          </div>
        )}
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
