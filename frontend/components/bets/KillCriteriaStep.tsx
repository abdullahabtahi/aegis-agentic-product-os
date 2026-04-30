"use client";

import { type KillCriteriaAction } from "@/lib/types";

const ACTION_OPTIONS: { value: KillCriteriaAction; label: string; description: string }[] = [
  { value: "pivot",  label: "Pivot",  description: "Adjust strategy and continue" },
  { value: "kill",   label: "Kill",   description: "Shut down this direction entirely" },
  { value: "extend", label: "Extend", description: "Reassess with new timeline" },
];

interface KillCriteriaStepProps {
  value: {
    condition: string;
    deadline: string;
    committed_action: KillCriteriaAction;
  };
  onChange: (v: { condition: string; deadline: string; committed_action: KillCriteriaAction }) => void;
  onSkip: () => void;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
}

export function KillCriteriaStep({
  value,
  onChange,
  onSkip,
  onBack,
  onSubmit,
  isSubmitting,
}: KillCriteriaStepProps) {
  const isValid =
    value.condition.trim().length >= 10 &&
    value.deadline !== "" &&
    value.committed_action != null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-foreground/90">Pre-Declare Your Kill Criteria</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Define the condition that would make this bet no longer worth pursuing.
          This becomes your forcing function — you&apos;ll thank yourself later.
        </p>
      </div>

      {/* Condition textarea */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground/70">Condition</label>
        <textarea
          value={value.condition}
          onChange={(e) => onChange({ ...value, condition: e.target.value })}
          placeholder="e.g. Ship to 3 paying users by May 1, 2026"
          rows={3}
          className="w-full rounded-lg border border-white/30 bg-white/60 px-3 py-2 text-sm text-foreground/90 placeholder:text-muted-foreground/60 focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/20 resize-none"
        />
      </div>

      {/* Deadline date input */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground/70">Deadline</label>
        <input
          type="date"
          value={value.deadline}
          onChange={(e) => onChange({ ...value, deadline: e.target.value })}
          className="w-full rounded-lg border border-white/30 bg-white/60 px-3 py-2 text-sm text-foreground/90 focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/20 [color-scheme:light]"
        />
      </div>

      {/* Committed action radio cards */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground/70">If condition is not met, I will…</label>
        <div className="grid grid-cols-3 gap-2">
          {ACTION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ ...value, committed_action: opt.value })}
              className={`rounded-lg border p-3 text-left transition-colors ${
                value.committed_action === opt.value
                  ? "border-indigo-400/60 bg-indigo-500/10"
                  : "border-white/30 bg-white/40 hover:border-indigo-400/30 hover:bg-white/60"
              }`}
            >
              <div className="text-xs font-semibold text-foreground/90">{opt.label}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{opt.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="text-xs text-muted-foreground hover:text-foreground/80 transition-colors"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="text-xs text-muted-foreground hover:text-foreground/80 underline underline-offset-2 transition-colors"
          >
            Skip for now
          </button>
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!isValid || isSubmitting}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 hover:bg-indigo-600 transition-colors"
        >
          {isSubmitting ? "Saving…" : "Set Kill Criteria"}
        </button>
      </div>
    </div>
  );
}
