"use client";

/**
 * Mission Control — Aegis pipeline dashboard.
 *
 * Layout (matches Stitch design):
 * ┌─────────────────────────────────────────────┐
 * │  Header bar (in GlassmorphicLayout)          │
 * ├─────────────────────────────────────────────┤
 * │  Pipeline Stages Row (5 cols)               │
 * ├──────────────────────┬──────────────────────┤
 * │  Active Bets (8 col) │ Interventions (4 col)│
 * │  Execution Health    │ Recent Actions       │
 * └──────────────────────┴──────────────────────┘
 *
 * Data:
 * - Bets: live from GET /bets (gracefully falls back to empty when DB not configured)
 * - Interventions: live from GET /interventions
 * - Pipeline stages: live from AG-UI STATE_DELTA via useAgentStateSync
 * - Recent Actions: derived from resolved interventions
 * - Execution Health chart: static sample (live metrics endpoint planned for Phase 6)
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Network, Brain, GitBranch, Gavel, Terminal,
  AlertTriangle, CheckCircle2, ArrowRight, Zap
} from "lucide-react";
import { getInterventions, approveIntervention, rejectIntervention, listBets } from "@/lib/api";
import { useAgentStateSync } from "@/hooks/useAgentStateSync";
import type { Intervention, PipelineStage, PipelineStageName } from "@/lib/types";

// ─── Live stage display derivation ───────────────────────────────────────────

/** Maps a live PipelineStage status to display tokens. */
function getLiveDisplay(
  stageName: PipelineStageName,
  liveStages: PipelineStage[] | undefined,
): { statusLabel: string; statusClass: string; dotClass: string } | null {
  if (!liveStages?.length) return null;
  const stage = liveStages.find((s) => s.name === stageName);
  if (!stage) return null;

  switch (stage.status) {
    case "running":
      return {
        statusLabel: "RUNNING",
        statusClass: "text-indigo-600 bg-indigo-600/10",
        dotClass: "bg-indigo-500 animate-pulse",
      };
    case "complete":
      return {
        statusLabel: "COMPLETE",
        statusClass: "text-emerald-600 bg-emerald-500/10",
        dotClass: "bg-emerald-500",
      };
    case "error":
      return {
        statusLabel: "ERROR",
        statusClass: "text-red-600 bg-red-500/10",
        dotClass: "bg-red-500",
      };
    case "pending":
    default:
      return {
        statusLabel: "IDLE",
        statusClass: "text-slate-500 bg-slate-200/50",
        dotClass: "bg-slate-300",
      };
  }
}

// ─── Pipeline stage config ───────────────────────────────────────────────────

const PIPELINE_STAGES = [
  {
    num: "01",
    stageName: "signal_engine" as const,
    label: "Signal Engine",
    icon: Network,
    statusLabel: "IDLE",
    statusClass: "text-slate-500 bg-slate-200/50",
    dotClass: "bg-slate-300",
  },
  {
    num: "02",
    stageName: "product_brain" as const,
    label: "Product Brain",
    icon: Brain,
    statusLabel: "IDLE",
    statusClass: "text-slate-500 bg-slate-200/50",
    dotClass: "bg-slate-300",
  },
  {
    num: "03",
    stageName: "coordinator" as const,
    label: "Coordinator",
    icon: GitBranch,
    statusLabel: "IDLE",
    statusClass: "text-slate-500 bg-slate-200/50",
    dotClass: "bg-slate-300",
  },
  {
    num: "04",
    stageName: "governor" as const,
    label: "Governor",
    icon: Gavel,
    statusLabel: "IDLE",
    statusClass: "text-slate-500 bg-slate-200/50",
    dotClass: "bg-slate-300",
  },
  {
    num: "05",
    stageName: "executor" as const,
    label: "Executor",
    icon: Terminal,
    statusLabel: "IDLE",
    statusClass: "text-slate-500 bg-slate-200/50",
    dotClass: "bg-slate-300",
  },
];

// ─── Bar chart data ───────────────────────────────────────────────────────────

const CHART_BARS = [40, 60, 55, 85, 95, 70, 80, 65, 98, 75, 45, 88];
const CHART_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];



// ─── Page ─────────────────────────────────────────────────────────────────────

const WORKSPACE_ID = "default_workspace";

export default function MissionControlPage() {
  const { state: pipelineState } = useAgentStateSync();
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  // Start as true — fetch begins immediately on mount
  const [loadingInterventions, setLoadingInterventions] = useState(true);

  useEffect(() => {
    getInterventions(WORKSPACE_ID)
      .then(setInterventions)
      .catch(() => setInterventions([]))
      .finally(() => setLoadingInterventions(false));
  }, []);

  // Live bets from /bets API (gracefully empty when DB not configured)
  const { data: liveBets = [], isLoading: loadingBets } = useQuery({
    queryKey: ["bets", WORKSPACE_ID],
    queryFn: () => listBets(WORKSPACE_ID, "active"),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const pendingInterventions = interventions.filter((i) => i.status === "pending");

  const handleApprove = async (id: string) => {
    await approveIntervention(id);
    setInterventions((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: "accepted" as const } : i))
    );
  };

  const handleReject = async (id: string) => {
    await rejectIntervention(id, "other");
    setInterventions((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: "rejected" as const } : i))
    );
  };

  return (
    <div className="flex flex-col gap-6 pb-4">

      {/* ── Pipeline Stage Cards ──────────────────────────────────────────── */}
      {/* Live: pipelineState.stages from useAgentStateSync (AG-UI StateDeltaEvent).
          Falls back to static PIPELINE_STAGES display when pipeline is idle. */}
      <section className="grid grid-cols-5 gap-3">
        {PIPELINE_STAGES.map((stage) => {
          const Icon = stage.icon;
          const live = getLiveDisplay(stage.stageName, pipelineState?.stages);
          const statusLabel = live?.statusLabel ?? stage.statusLabel;
          const statusClass = live?.statusClass ?? stage.statusClass;
          const dotClass = live?.dotClass ?? stage.dotClass;
          return (
            <div
              key={stage.num}
              className="glass-panel flex flex-col items-center gap-2 rounded-2xl p-4 text-center"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/50 shadow-sm">
                <Icon size={20} className="text-[#112478]" strokeWidth={1.5} />
              </div>
              <div>
                <p className="mb-0.5 text-[10px] font-medium uppercase tracking-widest text-slate-400">
                  Stage {stage.num}
                </p>
                <h3 className="font-heading text-sm font-semibold text-[#1a1c1d]">{stage.label}</h3>
              </div>
              <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold ${statusClass}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                {statusLabel}
              </div>
            </div>
          );
        })}
      </section>

      {/* ── Main Grid: Bets + Interventions / Health + Actions ───────────── */}
      <div className="grid grid-cols-12 gap-5">

        {/* Left: Bets + Health (8 cols) */}
        <div className="col-span-8 flex flex-col gap-4">

          {/* Active Strategic Bets — live from /bets API */}
          <div className="glass-panel rounded-2xl p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-heading text-base font-semibold text-[#1a1c1d]">Active Strategic Directions</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">High-conviction product trajectories</p>
              </div>
              <button className="flex items-center gap-1 text-xs font-semibold text-[#112478] transition-opacity hover:opacity-70">
                View All <ArrowRight size={13} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {loadingBets ? (
                <div className="col-span-2 py-8 text-center text-xs text-muted-foreground">Loading bets...</div>
              ) : liveBets.length === 0 ? (
                <div className="col-span-2 flex flex-col items-center gap-2 py-8 text-center">
                  <Zap size={24} className="text-indigo-300" />
                  <p className="text-sm font-medium text-foreground/60">No active directions yet</p>
                  <p className="text-xs text-muted-foreground">Declare a direction from the home page to get started.</p>
                </div>
              ) : (
                liveBets.map((bet) => {
                  const name = String(bet.name ?? "Untitled Bet");
                  const desc = String(bet.problem_statement ?? bet.hypothesis ?? "");
                  const segment = String(bet.target_segment ?? "");
                  return (
                    <div
                      key={String(bet.id)}
                      className="rounded-xl border border-white/40 bg-white/40 p-5 transition-all cursor-pointer hover:bg-white/60 hover:shadow-sm"
                    >
                      <div className="mb-4 flex items-start justify-between">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-900/80">
                          <Zap size={20} className="text-white" />
                        </div>
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          ACTIVE
                        </span>
                      </div>
                      <h4 className="font-heading text-sm font-semibold text-[#1a1c1d]">{name}</h4>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-2">{desc}</p>
                      {segment && (
                        <div className="mt-3">
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            {segment}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Execution Health Chart */}
          <div className="glass-panel rounded-2xl p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="font-heading text-base font-semibold text-[#1a1c1d]">Execution Health</h2>
                <p className="text-[10px] text-muted-foreground">Live when DB + Linear connected</p>
              </div>
              <div className="flex gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[#112478]" /> Volume
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-indigo-300" /> Success Rate
                </span>
              </div>
            </div>
            <div className="flex items-end justify-between gap-1 pt-1" style={{ height: "72px" }}>
              {CHART_BARS.map((h, i) => (
                <div
                  key={i}
                  className="w-full rounded-t transition-all"
                  style={{
                    height: `${h}%`,
                    background: `rgba(17, 36, 120, ${0.12 + (h / 100) * 0.55})`,
                  }}
                />
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[10px] font-medium text-muted-foreground">
              {CHART_DAYS.map((d) => <span key={d}>{d}</span>)}
            </div>
          </div>
        </div>

        {/* Right: Interventions + Recent Actions (4 cols) */}
        <div className="col-span-4 flex flex-col gap-4">

          {/* Interventions Panel — primary CTA when blocking items exist */}
          <div className={`glass-panel rounded-2xl p-5 transition-all ${pendingInterventions.length > 0 ? "ring-1 ring-red-400/30" : ""}`}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-heading text-sm font-semibold text-[#1a1c1d]">
                <AlertTriangle size={15} className={pendingInterventions.length > 0 ? "text-red-500" : "text-[#112478]"} />
                Interventions
              </h3>
              {pendingInterventions.length > 0 && (
                <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
                  {pendingInterventions.length} PENDING
                </span>
              )}
            </div>

            <div className="flex flex-col gap-3">
              {loadingInterventions ? (
                <p className="text-xs text-muted-foreground text-center py-4">Loading...</p>
              ) : pendingInterventions.length === 0 ? (
                /* Empty state — show 2 mock cards to match Stitch design in local dev */
                <>
                  <div className="rounded-xl border border-red-200/40 bg-white/60 p-4 transition-all hover:border-red-300/50">
                    <div className="flex gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                        <AlertTriangle size={14} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#1a1c1d]">Governor Halt: Auth Refactor</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          Conflict detected in session logic. Needs manual verify.
                        </p>
                        <div className="mt-2.5 flex gap-2">
                          <button className="rounded-lg bg-[#112478] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-80">
                            Approve
                          </button>
                          <button className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200">
                            Details
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-indigo-200/40 bg-white/60 p-4 transition-all hover:border-indigo-300/50">
                    <div className="flex gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[#112478]">
                        <CheckCircle2 size={14} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#1a1c1d]">Rollout Threshold Alert</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          Tier-2 rollout reached 15% without regression. Authorize 50%?
                        </p>
                        <div className="mt-2.5 flex gap-2">
                          <button className="rounded-lg bg-[#112478] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-80">
                            Expand
                          </button>
                          <button className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200">
                            Pause
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* Live interventions from AlloyDB */
                pendingInterventions.map((intervention) => (
                  <div
                    key={intervention.id}
                    className="rounded-xl border border-red-200/40 bg-white/60 p-4 transition-all hover:border-red-300/50"
                  >
                    <div className="flex gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                        <AlertTriangle size={14} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#1a1c1d] capitalize">
                          {intervention.action_type?.replace(/_/g, " ") ?? "Intervention"}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                          {intervention.rationale ?? "Awaiting founder approval."}
                        </p>
                        <div className="mt-2.5 flex gap-2">
                          <button
                            onClick={() => handleApprove(intervention.id)}
                            className="rounded-lg bg-[#112478] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-80"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleReject(intervention.id)}
                            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Actions — live from resolved interventions */}
          <div className="glass-panel flex flex-1 flex-col rounded-2xl p-5">
            <h3 className="mb-4 font-heading text-sm font-semibold text-[#1a1c1d]">Recent Actions</h3>
            <div className="relative flex flex-col gap-4 max-h-[180px] overflow-y-auto pr-1">
              {/* Timeline line */}
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
                        <p className="text-[10px] font-medium uppercase tracking-tight text-muted-foreground">
                          {action.status === "accepted" ? "APPROVED" : action.status.toUpperCase()} — {(action.action_type ?? "INTERVENTION").replace(/_/g, " ").toUpperCase()}
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
    </div>
  );
}
