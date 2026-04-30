"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, PauseCircle, RefreshCw, AlertTriangle, FlaskConical, ArrowLeft, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { ADVISOR_CONFIG } from "./AdvisorTile";
import type { BoardroomVerdict } from "@/lib/types";

interface VerdictPanelProps {
  verdict: BoardroomVerdict;
  onCreateIntervention: () => Promise<void>;
  interventionCreated: boolean;
}

export function VerdictPanelSkeleton() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-start bg-[#f9f9ff] px-4 py-12">
      <div className="w-full max-w-xl animate-pulse space-y-4">
        <div className="h-8 w-48 rounded-full bg-gray-200 mx-auto" />
        <div className="h-4 w-64 rounded-full bg-gray-100 mx-auto" />
        <div className="mt-8 rounded-2xl border border-gray-100 bg-white/70 p-5">
          <div className="flex items-center gap-4">
            <div className="h-[130px] w-[130px] rounded-full bg-gray-100" />
            <div className="flex-1 space-y-3">
              <div className="h-6 w-24 rounded-full bg-gray-200" />
              <div className="h-3 w-full rounded bg-gray-100" />
              <div className="h-3 w-4/5 rounded bg-gray-100" />
            </div>
          </div>
        </div>
        <div className="h-9 rounded-xl bg-gray-100" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-gray-100 bg-white/70 p-4">
            <div className="mb-2 h-4 w-32 rounded bg-gray-200" />
            <div className="h-3 w-full rounded bg-gray-100" />
            <div className="mt-1 h-3 w-3/4 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

type VerdictTab = "verdict" | "risks" | "experiments";

const TAB_LABELS: { id: VerdictTab; label: string }[] = [
  { id: "verdict", label: "Verdict" },
  { id: "risks", label: "Key Risks" },
  { id: "experiments", label: "Next Experiments" },
];

const SEVERITY_CHIP: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};

const RECOMMENDATION_CONFIG = {
  proceed: {
    label: "PROCEED",
    icon: <CheckCircle2 className="h-4 w-4" />,
    class: "bg-emerald-100 text-emerald-700",
  },
  pause: {
    label: "PAUSE",
    icon: <PauseCircle className="h-4 w-4" />,
    class: "bg-amber-100 text-amber-700",
  },
  pivot: {
    label: "PIVOT",
    icon: <RefreshCw className="h-4 w-4" />,
    class: "bg-red-100 text-red-700",
  },
};

function ConfidenceMeter({ score }: { score: number }) {
  const color =
    score >= 70 ? "#059669" : score >= 40 ? "#d97706" : "#dc2626";
  const r = 52;
  const circumference = 2 * Math.PI * r;
  const progress = (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[130px] w-[130px]">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={r} fill="none" stroke="#f1f5f9" strokeWidth="10" />
          <motion.circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference - progress }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tabular-nums" style={{ color }}>
            {score}
          </span>
        </div>
      </div>
      <span className="mt-1 text-xs text-gray-500">Confidence Score</span>
    </div>
  );
}

export function VerdictPanel({
  verdict,
  onCreateIntervention,
  interventionCreated,
}: VerdictPanelProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<VerdictTab>("verdict");
  const [isCreating, setIsCreating] = useState(false);

  const recConfig = RECOMMENDATION_CONFIG[verdict.recommendation] ?? RECOMMENDATION_CONFIG.pause;

  const handleCreateIntervention = useCallback(async () => {
    if (interventionCreated || isCreating) return;
    setIsCreating(true);
    try {
      await onCreateIntervention();
    } finally {
      setIsCreating(false);
    }
  }, [interventionCreated, isCreating, onCreateIntervention]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-start bg-[#f9f9ff] px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none fixed left-1/2 top-0 -z-10 h-[50vh] w-[80vw] -translate-x-1/2 rounded-full blur-[120px] opacity-20"
        style={{ background: "radial-gradient(circle, #818cf8 0%, #3b2bee 50%, transparent 70%)" }}
      />

      <div className="w-full max-w-xl">
        {/* Back navigation */}
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-6 flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Direction
        </button>

        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Boardroom Verdict</h1>
          <p className="mt-1 text-sm text-gray-500">Your advisors have reached a conclusion</p>
        </div>

        {/* Top summary — confidence + recommendation */}
        <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-xl">
          <ConfidenceMeter score={verdict.confidence_score} />
          <div className="flex-1 space-y-2">
            <div className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold", recConfig.class)}>
              {recConfig.icon}
              {recConfig.label}
            </div>
            <p className="text-sm leading-relaxed text-gray-700">{verdict.summary}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-1 rounded-xl bg-gray-100 p-1">
          {TAB_LABELS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex-1 rounded-lg py-2 text-xs font-medium transition-all",
                activeTab === id
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {activeTab === "verdict" && (
              <div className="space-y-3">
                {ADVISOR_CONFIG.map((advisor) => {
                  const text =
                    advisor.id === "bear"
                      ? verdict.bear_assessment
                      : advisor.id === "bull"
                        ? verdict.bull_assessment
                        : verdict.sage_assessment;
                  if (!text) return null;
                  return (
                    <div
                      key={advisor.id}
                      className="rounded-xl border bg-white/70 p-4 backdrop-blur-sm"
                      style={{ borderLeftColor: advisor.accent, borderLeftWidth: 3 }}
                    >
                      <div className="mb-1.5 flex items-center gap-2">
                        <div
                          className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold"
                          style={{ backgroundColor: advisor.avatarBg, color: advisor.accent }}
                        >
                          {advisor.initials}
                        </div>
                        <span className="text-sm font-semibold text-gray-900">{advisor.name}</span>
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ backgroundColor: `${advisor.accent}15`, color: advisor.accent }}
                        >
                          {advisor.role}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">{text}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === "risks" && (
              <div className="rounded-2xl border border-white/60 bg-white/70 p-4 backdrop-blur-xl">
                {verdict.key_risks.length === 0 ? (
                  <p className="py-4 text-center text-sm text-gray-400">
                    No significant risks flagged — confidence is high.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {verdict.key_risks.map((risk, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                        <div className="flex-1">
                          <span className={cn("mr-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", SEVERITY_CHIP[risk.severity] ?? SEVERITY_CHIP.low)}>
                            {risk.severity}
                          </span>
                          <span className="text-sm text-gray-700">{risk.text}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {activeTab === "experiments" && (
              <div className="space-y-2">
                {verdict.next_experiments.length === 0 ? (
                  <div className="rounded-2xl border border-white/60 bg-white/70 p-4 text-center text-sm text-gray-400 backdrop-blur-xl">
                    No experiments proposed.
                  </div>
                ) : (
                  verdict.next_experiments.map((exp, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 rounded-xl border border-white/60 bg-white/70 p-4 backdrop-blur-sm"
                    >
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">
                        {i + 1}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-gray-800">{exp.text}</p>
                        <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                          <FlaskConical className="mr-1 inline h-3 w-3" />
                          {exp.timeframe}
                        </span>
                      </div>
                    </div>
                  ))
                )}

                {/* Create Intervention CTA */}
                <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
                  <p className="mb-3 text-sm text-gray-700">
                    Anchor this verdict in your Aegis audit trail as an actionable Intervention.
                  </p>
                  {interventionCreated ? (
                    <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-2.5">
                      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" />
                        Intervention created
                      </div>
                      <button
                        type="button"
                        onClick={() => router.push("/workspace/inbox")}
                        className="flex items-center gap-1 text-xs font-medium text-emerald-600 underline-offset-2 hover:underline"
                      >
                        <Inbox className="h-3.5 w-3.5" />
                        View in Inbox
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleCreateIntervention}
                      disabled={isCreating}
                      className={cn(
                        "flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all",
                        isCreating
                          ? "cursor-not-allowed bg-gray-200 text-gray-400"
                          : "bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.98]",
                      )}
                    >
                      {isCreating ? "Creating…" : "Create Intervention"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
