"use client";

/**
 * BetDeclarationModal — Phase 6 Bet Declaration flow.
 *
 * Minimal form to declare a strategic bet. Calls POST /bets, then
 * sends the bet as context to the conversational agent via onBetDeclared.
 *
 * Design: glassmorphic overlay, minimal required fields, progressive disclosure.
 */

import { useState, useRef, useEffect } from "react";
import { X, Target, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { createBet } from "@/lib/api";
import { type KillCriteriaAction } from "@/lib/types";
import { KillCriteriaStep } from "./KillCriteriaStep";

interface BetDeclarationModalProps {
  open: boolean;
  workspaceId: string;
  onClose: () => void;
  onBetDeclared: (bet: Record<string, unknown>) => void;
}

const DEFAULT_WORKSPACE = "default_workspace";

export function BetDeclarationModal({
  open,
  workspaceId,
  onClose,
  onBetDeclared,
}: BetDeclarationModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [killCriteria, setKillCriteria] = useState<{
    condition: string;
    deadline: string;
    committed_action: KillCriteriaAction;
  }>({ condition: "", deadline: "", committed_action: "kill" });

  // Form state
  const [name, setName] = useState("");
  const [targetSegment, setTargetSegment] = useState("");
  const [problemStatement, setProblemStatement] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [timeHorizon, setTimeHorizon] = useState("");
  const [metricName, setMetricName] = useState("");
  const [metricTarget, setMetricTarget] = useState("");
  const [metricUnit, setMetricUnit] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [open]);

  function resetForm() {
    setName("");
    setTargetSegment("");
    setProblemStatement("");
    setHypothesis("");
    setTimeHorizon("");
    setMetricName("");
    setMetricTarget("");
    setMetricUnit("");
    setShowAdvanced(false);
    setError(null);
    setStep(1);
    setKillCriteria({ condition: "", deadline: "", committed_action: "kill" });
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function doSubmit(killCriteriaPayload?: {
    condition: string;
    deadline: string;
    committed_action: KillCriteriaAction;
    status: "pending";
  }) {
    setError(null);
    const successMetrics =
      metricName.trim()
        ? [{ name: metricName.trim(), target_value: metricTarget.trim(), unit: metricUnit.trim() }]
        : [];

    setIsLoading(true);
    try {
      const bet = await createBet({
        workspace_id: workspaceId || DEFAULT_WORKSPACE,
        name: name.trim(),
        target_segment: targetSegment.trim(),
        problem_statement: problemStatement.trim(),
        hypothesis: hypothesis.trim(),
        success_metrics: successMetrics,
        time_horizon: timeHorizon.trim(),
        ...(killCriteriaPayload ? { kill_criteria: killCriteriaPayload } : {}),
      });
      if (bet.persisted === false) {
        setError("Direction saved in memory only — no database configured. It will be lost on backend restart.");
        onBetDeclared(bet);
        setIsLoading(false);
        return;
      }
      resetForm();
      onBetDeclared(bet);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create direction. Is the backend running?");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !targetSegment.trim() || !problemStatement.trim()) {
      setError("Name, target segment, and problem statement are required.");
      return;
    }
    setStep(2);
  }

  return (
    <dialog
      ref={dialogRef}
      className="m-auto w-full max-w-lg rounded-2xl border border-white/20 bg-white/80 p-0 backdrop-blur-xl shadow-2xl shadow-black/20 open:animate-in open:fade-in open:zoom-in-95 backdrop:bg-black/40 backdrop:backdrop-blur-sm"
      onClose={handleClose}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/20 px-6 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15">
            <Target size={16} className="text-indigo-500" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground/90">Declare a Direction</h2>
            <p className="text-xs text-muted-foreground">Aegis will monitor it continuously</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
          aria-label="Close"
        >
          <X size={15} />
        </button>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 px-6 pt-4">
        <div className={`h-1.5 w-8 rounded-full transition-colors ${step >= 1 ? "bg-indigo-400" : "bg-slate-200"}`} />
        <div className={`h-1.5 w-8 rounded-full transition-colors ${step >= 2 ? "bg-indigo-400" : "bg-slate-200"}`} />
        <span className="text-xs text-muted-foreground ml-1">Step {step} of 2</span>
      </div>

      {/* Form — Step 1 */}
      {step === 1 && (
      <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
        {/* Direction name */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground/70">
            Direction name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ship v2 onboarding by Q2"
            className="w-full rounded-lg border border-white/30 bg-white/60 px-3 py-2 text-sm text-foreground/90 placeholder:text-muted-foreground/60 focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/20"
            required
          />
        </div>

        {/* Target segment */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground/70">
            Target segment <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={targetSegment}
            onChange={(e) => setTargetSegment(e.target.value)}
            placeholder="e.g. First-time SaaS founders, SMB teams"
            className="w-full rounded-lg border border-white/30 bg-white/60 px-3 py-2 text-sm text-foreground/90 placeholder:text-muted-foreground/60 focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/20"
            required
          />
        </div>

        {/* Problem statement */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground/70">
            Problem statement <span className="text-red-400">*</span>
          </label>
          <textarea
            value={problemStatement}
            onChange={(e) => setProblemStatement(e.target.value)}
            placeholder="What problem are you solving and why does it matter?"
            rows={3}
            className="w-full resize-none rounded-lg border border-white/30 bg-white/60 px-3 py-2 text-sm text-foreground/90 placeholder:text-muted-foreground/60 focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/20"
            required
          />
        </div>

        {/* Advanced toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg px-0 py-1 text-xs font-medium text-muted-foreground hover:text-foreground/80 transition-colors"
        >
          <span>Hypothesis & success metric (optional)</span>
          {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>

        {showAdvanced && (
          <div className="space-y-4 pt-1">
            {/* Hypothesis */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/70">Hypothesis</label>
              <textarea
                value={hypothesis}
                onChange={(e) => setHypothesis(e.target.value)}
                placeholder='We believe [action] will result in [outcome] for [segment]'
                rows={2}
                className="w-full resize-none rounded-lg border border-white/30 bg-white/60 px-3 py-2 text-sm text-foreground/90 placeholder:text-muted-foreground/60 focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/20"
              />
            </div>

            {/* Time horizon */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/70">Time horizon</label>
              <input
                type="text"
                value={timeHorizon}
                onChange={(e) => setTimeHorizon(e.target.value)}
                placeholder="e.g. Q2 2026, 6 weeks, 2026-06-30"
                className="w-full rounded-lg border border-white/30 bg-white/60 px-3 py-2 text-sm text-foreground/90 placeholder:text-muted-foreground/60 focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/20"
              />
            </div>

            {/* Success metric (single) */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/70">Success metric</label>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={metricName}
                  onChange={(e) => setMetricName(e.target.value)}
                  placeholder="Metric name"
                  className="col-span-1 rounded-lg border border-white/30 bg-white/60 px-3 py-2 text-sm text-foreground/90 placeholder:text-muted-foreground/60 focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/20"
                />
                <input
                  type="text"
                  value={metricTarget}
                  onChange={(e) => setMetricTarget(e.target.value)}
                  placeholder="Target"
                  className="col-span-1 rounded-lg border border-white/30 bg-white/60 px-3 py-2 text-sm text-foreground/90 placeholder:text-muted-foreground/60 focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/20"
                />
                <input
                  type="text"
                  value={metricUnit}
                  onChange={(e) => setMetricUnit(e.target.value)}
                  placeholder="Unit"
                  className="col-span-1 rounded-lg border border-white/30 bg-white/60 px-3 py-2 text-sm text-foreground/90 placeholder:text-muted-foreground/60 focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/20"
                />
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="rounded-lg bg-red-400/10 px-3 py-2 text-xs text-red-600">{error}</p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-60"
          >
            Continue →
          </button>
        </div>
      </form>
      )}

      {/* Kill Criteria — Step 2 */}
      {step === 2 && (
        <div className="px-6 py-5">
          <KillCriteriaStep
            value={killCriteria}
            onChange={setKillCriteria}
            onBack={() => setStep(1)}
            onSkip={() => doSubmit()}
            onSubmit={() =>
              doSubmit({ ...killCriteria, status: "pending" })
            }
            isSubmitting={isLoading}
          />
          {error && (
            <p className="rounded-lg bg-red-400/10 px-3 py-2 text-xs text-red-600 mt-4">{error}</p>
          )}
        </div>
      )}
    </dialog>
  );
}
