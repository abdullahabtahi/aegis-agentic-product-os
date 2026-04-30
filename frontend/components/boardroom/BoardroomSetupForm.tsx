"use client";

import { useCallback, useState } from "react";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useBoardroomStore } from "@/stores/boardroomStore";
import type { BoardroomContext } from "@/lib/types";

function formatRiskType(raw: string): string {
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface BoardroomSetupFormProps {
  betId: string;
  context: BoardroomContext | null;
  contextStatus: "loading" | "ready" | "error";
  onEnter: () => void;
}

const MAX_DECISION = 200;
const MAX_ASSUMPTION = 150;

const SEVERITY_CHIP: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};

export function BoardroomSetupForm({
  betId,
  context,
  contextStatus,
  onEnter,
}: BoardroomSetupFormProps) {
  const router = useRouter();
  const { draft, setDraft } = useBoardroomStore();
  const { decisionQuestion, keyAssumption } = draft;

  const [touched, setTouched] = useState({ decisionQuestion: false, keyAssumption: false });

  const decisionError = touched.decisionQuestion && decisionQuestion.trim().length === 0 ? "Required" : null;
  const assumptionError = touched.keyAssumption && keyAssumption.trim().length === 0 ? "Required" : null;

  const canEnter =
    (contextStatus === "ready" || contextStatus === "error") &&
    decisionQuestion.trim().length > 0 &&
    keyAssumption.trim().length > 0;

  const handleDecisionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value.slice(0, MAX_DECISION);
      setDraft({ decisionQuestion: val });
    },
    [setDraft],
  );

  const handleAssumptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value.slice(0, MAX_ASSUMPTION);
      setDraft({ keyAssumption: val });
    },
    [setDraft],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setTouched({ decisionQuestion: true, keyAssumption: true });
      if (canEnter) onEnter();
    },
    [canEnter, onEnter],
  );

  return (
    <div className="flex min-h-screen items-start justify-center bg-[#f9f9ff] px-4 pt-16">
      {/* Radial gradient glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed left-1/2 top-0 -z-10 h-[50vh] w-[80vw] -translate-x-1/2 rounded-full blur-[120px] opacity-30"
        style={{ background: "radial-gradient(circle, #818cf8 0%, #3b2bee 50%, transparent 70%)" }}
      />

      <div className="w-full max-w-xl">
        {/* Back link */}
        <button
          type="button"
          onClick={() => router.push(`/workspace/directions/${betId}`)}
          className="mb-6 flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Direction
        </button>

        {/* Progress dots */}
        <div className="mb-6 flex items-center gap-2">
          {["Setup", "Boardroom", "Verdict"].map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                i === 0 ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-400"
              )}>
                {i + 1}
              </div>
              <span className={cn("text-xs", i === 0 ? "font-medium text-gray-800" : "text-gray-400")}>
                {label}
              </span>
              {i < 2 && <span className="text-gray-300">›</span>}
            </div>
          ))}
        </div>

        <h1 className="mb-6 text-2xl font-bold text-gray-900">
          Set up your boardroom session
        </h1>

        {/* Bet context card */}
        <div className="mb-6 rounded-2xl border border-white/60 bg-white/60 p-4 shadow-sm backdrop-blur-xl">
          {contextStatus === "loading" && (
            <div className="space-y-2">
              <div className="h-4 w-1/2 animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-3/4 animate-pulse rounded bg-gray-100" />
            </div>
          )}
          {contextStatus === "error" && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertTriangle className="h-4 w-4" />
              <span>Could not load bet context — you can still proceed.</span>
            </div>
          )}
          {contextStatus === "ready" && context && (
            <div className="space-y-3">
              <div>
                <h3 className="font-semibold text-gray-900">{context.betName}</h3>
                {context.hypothesis && (
                  <p className="mt-1 text-sm text-gray-600">{context.hypothesis}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {context.targetSegment && (
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                    {context.targetSegment}
                  </span>
                )}
                {context.riskSignals.length > 0 && (
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                    {context.riskSignals.length} risk signal{context.riskSignals.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              {context.riskSignals.length > 0 && (
                <div className="space-y-1 border-t border-gray-100 pt-2">
                  {context.riskSignals.slice(0, 3).map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-gray-700">
                      <span className={cn("rounded px-1.5 py-0.5 font-medium uppercase", SEVERITY_CHIP[s.severity] ?? SEVERITY_CHIP.low)}>
                        {s.severity}
                      </span>
                      <span className="truncate">{formatRiskType(s.risk_type)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-800">
              What decision are you making?
              <span className="ml-1 text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              maxLength={MAX_DECISION}
              value={decisionQuestion}
              onChange={handleDecisionChange}
              onBlur={() => setTouched((t) => ({ ...t, decisionQuestion: true }))}
              placeholder="e.g. Should we prioritise enterprise customers over SMB for the next quarter?"
              className={cn(
                "w-full resize-none rounded-xl border bg-white/80 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2",
                decisionError
                  ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                  : "border-gray-200 focus:border-indigo-400 focus:ring-indigo-100",
              )}
            />
            <div className="mt-1 flex items-center justify-between">
              {decisionError
                ? <p className="text-xs text-red-500">{decisionError}</p>
                : <span />
              }
              <p className={cn("text-right text-xs", decisionQuestion.length >= MAX_DECISION ? "text-amber-500" : "text-gray-400")}>
                {decisionQuestion.length}/{MAX_DECISION}
              </p>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-800">
              What assumption do you want to stress-test?
              <span className="ml-1 text-red-500">*</span>
            </label>
            <textarea
              rows={2}
              maxLength={MAX_ASSUMPTION}
              value={keyAssumption}
              onChange={handleAssumptionChange}
              onBlur={() => setTouched((t) => ({ ...t, keyAssumption: true }))}
              placeholder="e.g. Enterprise deals will close within 30 days at our current price point."
              className={cn(
                "w-full resize-none rounded-xl border bg-white/80 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2",
                assumptionError
                  ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                  : "border-gray-200 focus:border-indigo-400 focus:ring-indigo-100",
              )}
            />
            <div className="mt-1 flex items-center justify-between">
              {assumptionError
                ? <p className="text-xs text-red-500">{assumptionError}</p>
                : <span />
              }
              <p className={cn("text-right text-xs", keyAssumption.length >= MAX_ASSUMPTION ? "text-amber-500" : "text-gray-400")}>
                {keyAssumption.length}/{MAX_ASSUMPTION}
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={!canEnter}
            className={cn(
              "mt-2 w-full rounded-full py-3 text-sm font-semibold transition-all",
              canEnter
                ? "bg-indigo-600 text-white shadow-md hover:bg-indigo-700 active:scale-[0.98]"
                : "cursor-not-allowed bg-gray-200 text-gray-400",
            )}
          >
            {contextStatus === "loading" ? "Loading context…" : "Enter Boardroom"}
          </button>
        </form>
      </div>
    </div>
  );
}
