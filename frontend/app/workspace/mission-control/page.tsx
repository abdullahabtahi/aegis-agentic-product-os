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
 * Data: Interventions wired to /interventions API.
 * Bets, health chart, recent actions use mock data
 * (TODO: wire to /bets, /activity when backend endpoints exist).
 *
 * Deployment note: AlloyDB AI vector search will power the semantic
 * "similar past bets" feature on bet cards. AgentMemory (Vertex Memory Bank)
 * stores bet_context and intervention_memory namespaces — same data shapes.
 */

import { useEffect, useState } from "react";
import {
  Network, Brain, GitBranch, Gavel, Terminal,
  AlertTriangle, CheckCircle2, ArrowRight, Zap
} from "lucide-react";
import { getInterventions, approveIntervention, rejectIntervention } from "@/lib/api";
import { useAgentStateSync } from "@/hooks/useAgentStateSync";
import type { Intervention } from "@/lib/types";

// ─── Pipeline stage config ───────────────────────────────────────────────────

const PIPELINE_STAGES = [
  {
    num: "01",
    label: "Signal Engine",
    icon: Network,
    statusLabel: "12 ACTIVE",
    statusClass: "text-indigo-600 bg-indigo-600/10",
    dotClass: "bg-indigo-500 animate-pulse",
  },
  {
    num: "02",
    label: "Product Brain",
    icon: Brain,
    statusLabel: "4 INFERENCE",
    statusClass: "text-indigo-600 bg-indigo-600/10",
    dotClass: "bg-indigo-500 animate-pulse",
  },
  {
    num: "03",
    label: "Coordinator",
    icon: GitBranch,
    statusLabel: "8 AGENTS",
    statusClass: "text-indigo-600 bg-indigo-600/10",
    dotClass: "bg-indigo-500 animate-pulse",
  },
  {
    num: "04",
    label: "Governor",
    icon: Gavel,
    statusLabel: "2 BLOCKED",
    statusClass: "text-red-600 bg-red-500/10",
    dotClass: "bg-red-500",
  },
  {
    num: "05",
    label: "Executor",
    icon: Terminal,
    statusLabel: "RUNNING",
    statusClass: "text-emerald-600 bg-emerald-500/10",
    dotClass: "bg-emerald-500",
  },
] as const;

// ─── Mock bets (TODO: wire to /bets endpoint + AlloyDB) ──────────────────────

const MOCK_BETS = [
  {
    id: "bet-1",
    name: "Mobile Retention Pivot",
    description: "Transitioning onboarding flow to agent-led discovery sessions for users in APAC.",
    progress: 70,
    tags: ["ALPHA-9", "Q3 PRIORITY"],
    tagColors: ["bg-slate-100 text-slate-600", "bg-indigo-100 text-indigo-600"],
    iconColor: "bg-indigo-900/80",
    strokeColor: "#112478",
  },
  {
    id: "bet-2",
    name: "Revenue Self-Healing",
    description: "Automated agent intervention for failed renewals and churn signals.",
    progress: 30,
    tags: ["BRAIN-X", "STABILITY"],
    tagColors: ["bg-slate-100 text-slate-600", "bg-indigo-100 text-indigo-600"],
    iconColor: "bg-indigo-800/60",
    strokeColor: "#2b456d",
  },
] as const;

// ─── Mock recent actions (TODO: wire to /activity endpoint) ──────────────────

const MOCK_ACTIONS = [
  { time: "14:22", stage: "EXECUTOR", text: "Production hotfix applied to API-Gate-04.", primary: true },
  { time: "13:05", stage: "PRODUCT BRAIN", text: 'Strategic alignment score updated for "Retention Pivot".', primary: false },
  { time: "12:15", stage: "COORDINATOR", text: "Agent 'Optimus' provisioned for data migration task.", primary: false },
  { time: "11:50", stage: "GOVERNOR", text: "Risk assessment completed for Q3 roadmap branch.", primary: false },
] as const;

// ─── Bar chart data ───────────────────────────────────────────────────────────

const CHART_BARS = [40, 60, 55, 85, 95, 70, 80, 65, 98, 75, 45, 88];
const CHART_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─── Circular progress SVG ───────────────────────────────────────────────────

function CircularProgress({ pct, color }: { pct: number; color: string }) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <div className="relative h-12 w-12">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r={r} fill="transparent" stroke="#e2e8f0" strokeWidth="4" />
        <circle
          cx="24" cy="24" r={r} fill="transparent"
          stroke={color} strokeWidth="4"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-foreground/75">
        {pct}%
      </span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const WORKSPACE_ID = "default_workspace";

export default function MissionControlPage() {
  const { state: pipelineState } = useAgentStateSync();
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [loadingInterventions, setLoadingInterventions] = useState(false);

  useEffect(() => {
    setLoadingInterventions(true);
    getInterventions(WORKSPACE_ID)
      .then(setInterventions)
      .catch(() => setInterventions([]))
      .finally(() => setLoadingInterventions(false));
  }, []);

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
    <div className="flex flex-col gap-4 pb-4">

      {/* ── Pipeline Stage Cards ──────────────────────────────────────────── */}
      <section className="grid grid-cols-5 gap-3">
        {PIPELINE_STAGES.map((stage) => {
          const Icon = stage.icon;
          return (
            <div
              key={stage.num}
              className="glass-panel flex flex-col items-center gap-3 rounded-2xl p-5 text-center"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/50 shadow-sm">
                <Icon size={24} className="text-[#112478]" strokeWidth={1.5} />
              </div>
              <div>
                <p className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Stage {stage.num}
                </p>
                <h3 className="font-heading text-sm font-bold text-[#1a1c1d]">{stage.label}</h3>
              </div>
              <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold ${stage.statusClass}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${stage.dotClass}`} />
                {stage.statusLabel}
              </div>
            </div>
          );
        })}
      </section>

      {/* ── Main Grid: Bets + Interventions / Health + Actions ───────────── */}
      <div className="grid grid-cols-12 gap-4">

        {/* Left: Bets + Health (8 cols) */}
        <div className="col-span-8 flex flex-col gap-4">

          {/* Active Strategic Bets */}
          <div className="glass-panel rounded-2xl p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-heading text-lg font-bold text-[#1a1c1d]">Active Strategic Bets</h2>
                <p className="mt-0.5 text-xs text-slate-500">High-conviction product trajectories</p>
              </div>
              <button className="flex items-center gap-1 text-xs font-semibold text-[#112478] transition-opacity hover:opacity-70">
                View All <ArrowRight size={13} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {MOCK_BETS.map((bet) => (
                <div
                  key={bet.id}
                  className="rounded-xl border border-white/40 bg-white/40 p-5 transition-all cursor-pointer hover:bg-white/60 hover:shadow-sm"
                >
                  <div className="mb-4 flex items-start justify-between">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${bet.iconColor}`}>
                      <Zap size={20} className="text-white" />
                    </div>
                    <CircularProgress pct={bet.progress} color={bet.strokeColor} />
                  </div>
                  <h4 className="font-heading text-sm font-bold text-[#1a1c1d]">{bet.name}</h4>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{bet.description}</p>
                  <div className="mt-3 flex gap-2">
                    {bet.tags.map((tag, i) => (
                      <span key={tag} className={`rounded px-2 py-0.5 text-[10px] font-semibold ${bet.tagColors[i]}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Execution Health Chart */}
          <div className="glass-panel rounded-2xl p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-lg font-bold text-[#1a1c1d]">Execution Health</h2>
              <div className="flex gap-4 text-xs text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-[#112478]" /> Volume
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-indigo-300" /> Success Rate
                </span>
              </div>
            </div>
            <div className="flex items-end justify-between gap-1 pt-2" style={{ height: "112px" }}>
              {CHART_BARS.map((h, i) => (
                <div
                  key={i}
                  className="w-full rounded-t transition-all"
                  style={{
                    height: `${h}%`,
                    background: `rgba(17, 36, 120, ${0.15 + (h / 100) * 0.75})`,
                  }}
                />
              ))}
            </div>
            <div className="mt-3 flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {CHART_DAYS.map((d) => <span key={d}>{d}</span>)}
            </div>
          </div>
        </div>

        {/* Right: Interventions + Recent Actions (4 cols) */}
        <div className="col-span-4 flex flex-col gap-4">

          {/* Interventions Panel */}
          <div className="glass-panel rounded-2xl p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-heading text-sm font-bold text-[#1a1c1d]">
                <AlertTriangle size={16} className="text-[#112478]" />
                Interventions
              </h3>
              {pendingInterventions.length > 0 && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">
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
                        <p className="text-[11px] font-bold text-[#1a1c1d]">Governor Halt: Auth Refactor</p>
                        <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                          Conflict detected in session logic. Needs manual verify.
                        </p>
                        <div className="mt-2.5 flex gap-2">
                          <button className="rounded-lg bg-[#112478] px-3 py-1.5 text-[10px] font-bold text-white transition-opacity hover:opacity-80">
                            Approve
                          </button>
                          <button className="rounded-lg bg-slate-100 px-3 py-1.5 text-[10px] font-bold text-slate-600 transition-colors hover:bg-slate-200">
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
                        <p className="text-[11px] font-bold text-[#1a1c1d]">Rollout Threshold Alert</p>
                        <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                          Tier-2 rollout reached 15% without regression. Authorize 50%?
                        </p>
                        <div className="mt-2.5 flex gap-2">
                          <button className="rounded-lg bg-[#112478] px-3 py-1.5 text-[10px] font-bold text-white transition-opacity hover:opacity-80">
                            Expand
                          </button>
                          <button className="rounded-lg bg-slate-100 px-3 py-1.5 text-[10px] font-bold text-slate-600 transition-colors hover:bg-slate-200">
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
                        <p className="text-[11px] font-bold text-[#1a1c1d] capitalize">
                          {intervention.action_type?.replace(/_/g, " ") ?? "Intervention"}
                        </p>
                        <p className="mt-1 text-[10px] leading-relaxed text-slate-500 line-clamp-2">
                          {intervention.rationale ?? "Awaiting founder approval."}
                        </p>
                        <div className="mt-2.5 flex gap-2">
                          <button
                            onClick={() => handleApprove(intervention.id)}
                            className="rounded-lg bg-[#112478] px-3 py-1.5 text-[10px] font-bold text-white transition-opacity hover:opacity-80"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleReject(intervention.id)}
                            className="rounded-lg bg-slate-100 px-3 py-1.5 text-[10px] font-bold text-slate-600 transition-colors hover:bg-slate-200"
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

          {/* Recent Actions Feed */}
          <div className="glass-panel flex flex-1 flex-col rounded-2xl p-5">
            <h3 className="mb-5 font-heading text-sm font-bold text-[#1a1c1d]">Recent Actions</h3>
            <div className="relative flex flex-col gap-5">
              {/* Timeline line */}
              <div className="absolute bottom-2 left-[11px] top-2 w-px bg-slate-200" />

              {MOCK_ACTIONS.map((action, i) => (
                <div key={i} className="relative pl-8">
                  <div
                    className={`absolute left-0 top-0.5 flex h-[23px] w-[23px] items-center justify-center rounded-full border ${
                      action.primary
                        ? "border-[#112478] bg-white"
                        : "border-slate-300 bg-white"
                    }`}
                  >
                    <div className={`h-1.5 w-1.5 rounded-full ${action.primary ? "bg-[#112478]" : "bg-slate-300"}`} />
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-tight text-slate-400">
                    {action.time} — {action.stage}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-[#1a1c1d]">{action.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
