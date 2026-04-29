"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { getInterventions, approveIntervention, rejectIntervention, listBets, discoverBets } from "@/lib/api";
import { useAgentStateSync } from "@/hooks/useAgentStateSync";
import { useWorkspaceId } from "@/hooks/useWorkspaceId";

import { KpiStatsBar } from "@/components/mission-control/KpiStatsBar";
import { PipelineFlowRow } from "@/components/mission-control/PipelineFlowRow";
import { ScanButton } from "@/components/mission-control/ScanButton";
import { ExecutionHealthChart } from "@/components/mission-control/ExecutionHealthChart";
import { InterventionCard } from "@/components/mission-control/InterventionCard";
import { GovernorBreakdownPanel } from "@/components/mission-control/GovernorBreakdownPanel";
import { FirstRunGuide } from "@/components/mission-control/FirstRunGuide";

/** Lightweight relative time formatter — no external dependency. */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function MissionControlPage() {
  const workspaceId = useWorkspaceId();
  const { state: pipelineState } = useAgentStateSync();
  const queryClient = useQueryClient();
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enabled = workspaceId !== "default_workspace";

  const { data: interventions = [], isLoading: loadingInterventions } = useQuery({
    queryKey: ["interventions", workspaceId],
    queryFn: () => getInterventions(workspaceId),
    staleTime: 15_000,
    enabled,
  });

  const { data: liveBets = [], isLoading: loadingBets } = useQuery({
    queryKey: ["bets", workspaceId],
    queryFn: () => listBets(workspaceId, "active"),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    enabled,
  });

  const scanMutation = useMutation({
    mutationFn: () => discoverBets(workspaceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bets", workspaceId] }),
    onError: () => {
      setToastVisible(true);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        setToastVisible(false);
        scanMutation.reset();
      }, 8_000);
    },
  });

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const lastScan = liveBets.reduce<string | null>((latest, b) => {
    if (!b.last_monitored_at) return latest;
    return !latest || b.last_monitored_at > latest ? b.last_monitored_at : latest;
  }, null);

  const pendingInterventions = interventions.filter((i) => i.status === "pending");

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveIntervention(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["interventions", workspaceId] }),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => rejectIntervention(id, "other"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["interventions", workspaceId] }),
  });

  const denialReason = pipelineState?.governor_decision?.denial_reason ?? null;

  function handleRetry() {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastVisible(false);
    scanMutation.reset();
    scanMutation.mutate();
  }

  function handleDismissToast() {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastVisible(false);
    scanMutation.reset();
  }

  return (
    <div className="flex flex-col gap-5 pb-4">

      {/* ── KPI Stats Bar ──────────────────────────────────────────────────── */}
      <KpiStatsBar
        bets={liveBets}
        interventions={interventions}
        lastScan={lastScan}
        loading={loadingBets || loadingInterventions}
        timeAgo={timeAgo}
      />

      {/* ── Pipeline Flow Row + Scan CTA ──────────────────────────────────── */}
      <div className="glass-panel rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Pipeline Stages</span>
          <ScanButton
            onClick={() => scanMutation.mutate()}
            isPending={scanMutation.isPending}
            disabled={scanMutation.isPending || !enabled}
            workspaceFallback={!enabled}
          />
        </div>
        <PipelineFlowRow stages={pipelineState?.stages} />
      </div>

      {/* ── Main Grid: Bets + Interventions / Health + Actions ───────────── */}
      <div className="grid grid-cols-12 gap-5">

        {/* Left: Bets + Health (8 cols) */}
        <div className="col-span-8 flex flex-col gap-4">

          {/* Active Strategic Directions */}
          <div className="glass-panel rounded-2xl p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-heading text-base font-semibold text-[#1a1c1d]">Active Strategic Directions</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">High-conviction product trajectories</p>
              </div>
              <Link href="/workspace/directions" className="flex items-center gap-1 text-xs font-semibold text-[#112478] transition-opacity hover:opacity-70">
                View All <ArrowRight size={13} />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {loadingBets ? (
                <div className="col-span-2 py-8 text-center text-xs text-muted-foreground">Loading directions...</div>
              ) : liveBets.length === 0 ? (
                <FirstRunGuide />
              ) : (
                liveBets.map((bet) => {
                  const name = String(bet.name ?? "Untitled Bet");
                  const desc = String(bet.problem_statement ?? bet.hypothesis ?? "");
                  const segment = String(bet.target_segment ?? "");
                  return (
                    <Link
                      key={String(bet.id)}
                      href={`/workspace/directions/${String(bet.id)}`}
                      className="rounded-xl border border-white/40 bg-white/40 p-5 transition-all cursor-pointer hover:bg-white/60 hover:shadow-sm block"
                    >
                      <div className="mb-4 flex items-start justify-between">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-900/80">
                          <span className="text-white text-lg font-bold">{name.charAt(0).toUpperCase()}</span>
                        </div>
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          ACTIVE
                        </span>
                      </div>
                      <h4 className="font-heading text-sm font-semibold text-[#1a1c1d]">{name}</h4>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-2">{desc}</p>
                      {segment && (
                        <div className="mt-3">
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                            {segment}
                          </span>
                        </div>
                      )}
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          {/* Execution Health Chart */}
          <ExecutionHealthChart interventions={interventions} />
        </div>

        {/* Right: Interventions + Recent Actions (4 cols) */}
        <div className="col-span-4 flex flex-col gap-4">

          {/* Interventions Panel */}
          <div className={`glass-panel rounded-2xl p-5 transition-all ${pendingInterventions.length > 0 ? "ring-1 ring-red-400/30" : ""}`}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-heading text-sm font-semibold text-[#1a1c1d]">
                <AlertTriangle size={15} className={pendingInterventions.length > 0 ? "text-red-500" : "text-[#112478]"} />
                Interventions
              </h3>
              {pendingInterventions.length > 0 && (
                <span className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">
                  {pendingInterventions.length} PENDING
                </span>
              )}
            </div>

            {/* Governor Policy Breakdown — shown when pending + denial reason present */}
            {pendingInterventions.length > 0 && (
              <GovernorBreakdownPanel
                denialReason={denialReason}
                denialDetails={undefined}
              />
            )}

            <div className="flex flex-col gap-3">
              {loadingInterventions ? (
                <p className="text-xs text-muted-foreground text-center py-4">Loading...</p>
              ) : pendingInterventions.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <CheckCircle2 size={20} className="text-emerald-500/60" />
                  <p className="text-xs text-muted-foreground">No pending interventions</p>
                </div>
              ) : (
                pendingInterventions.map((intervention) => (
                  <InterventionCard
                    key={intervention.id}
                    intervention={intervention}
                    onApprove={(id) => approveMutation.mutate(id)}
                    onReject={(id) => rejectMutation.mutate(id)}
                    isPending={approveMutation.isPending || rejectMutation.isPending}
                  />
                ))
              )}
            </div>
          </div>

          {/* Recent Actions */}
          <div className="glass-panel flex flex-1 flex-col rounded-2xl p-5">
            <h3 className="mb-4 font-heading text-sm font-semibold text-[#1a1c1d]">Recent Actions</h3>
            <div className="relative flex flex-col gap-4 max-h-[180px] overflow-y-auto pr-1">
              <div className="absolute bottom-2 left-[11px] top-2 w-px bg-slate-200" />

              {interventions.filter((i) => i.status !== "pending").length === 0 ? (
                <p className="pl-8 text-xs text-muted-foreground">
                  No actions yet — approve or reject an intervention to see it here.
                </p>
              ) : (
                interventions
                  .filter((i) => i.status !== "pending")
                  .slice(0, 3)
                  .map((action) => {
                    const isPrimary = action.status === "accepted";
                    return (
                      <div key={action.id} className="relative pl-8">
                        <div
                          className={`absolute left-0 top-0.5 flex h-[20px] w-[20px] items-center justify-center rounded-full border ${
                            isPrimary ? "border-[#112478] bg-white" : "border-slate-200 bg-white"
                          }`}
                        >
                          <div className={`h-1.5 w-1.5 rounded-full ${isPrimary ? "bg-[#112478]" : "bg-slate-300"}`} />
                        </div>
                        <p className="text-[11px] font-medium uppercase tracking-tight text-muted-foreground">
                          {({ accepted: "APPROVED", rejected: "REJECTED", dismissed: "DISMISSED" } as Record<string, string>)[action.status] ?? action.status.toUpperCase()} — {(action.action_type ?? "INTERVENTION").replace(/_/g, " ").toUpperCase()}
                        </p>
                        <p className="mt-0.5 text-xs text-[#1a1c1d] line-clamp-2">
                          {action.rationale ?? "Intervention resolved."}
                        </p>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Error Toast ──────────────────────────────────────────────────────── */}
      {toastVisible && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 shadow-lg">
          <p className="text-sm text-red-700">
            <span className="font-semibold">Pipeline scan failed</span>
            <span className="text-muted-foreground"> — try again.</span>
          </p>
          <button
            onClick={handleRetry}
            className="rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
          <button
            onClick={handleDismissToast}
            className="text-red-400 hover:text-red-600 transition-colors"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
