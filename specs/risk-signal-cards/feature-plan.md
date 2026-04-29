# Feature Plan — Risk Signal Cards

## Roadmap Item
Satisfies roadmap item **2. Risk Signal Cards** (`/risk-signal-cards/`)

## Overview

After `run_pipeline_scan` completes, Product Brain writes a structured JSON blob (`risk_signal_draft`) into AG-UI session state. The chat currently shows only a Markdown text reply from the conversational agent. This feature parses `risk_signal_draft` from session state and renders it as a `RiskSignalCard` component inline in the chat, immediately after the assistant's message.

## Dependencies

- **Workspace ID Injection** (recommended first): `risk_signal_draft` only has meaning after a pipeline scan, which requires a `workspace_id` in state.
- `AegisPipelineState.risk_signal_draft` already exists in `lib/types.ts` as `string` (JSON-serialized).
- `RiskSignal` type already defined in `lib/types.ts`.

## Implementation Steps

### Task Group 1 — RiskSignalCard component

```typescript
// frontend/components/chat/RiskSignalCard.tsx
"use client";
import type { RiskSignal } from "@/lib/types";

const RISK_LABELS: Record<string, string> = {
  strategy_unclear: "Strategy Unclear",
  alignment_issue: "Alignment Issue",
  execution_issue: "Execution Issue",
  placebo_productivity: "Placebo Productivity",
};

const SEVERITY_COLOR: Record<string, string> = {
  low: "text-emerald-400 bg-emerald-400/10",
  medium: "text-amber-400 bg-amber-400/10",
  high: "text-orange-400 bg-orange-400/10",
  critical: "text-red-400 bg-red-400/10",
};

export function RiskSignalCard({ signal }: { signal: RiskSignal }) {
  const confidencePct = Math.round(signal.confidence * 100);

  return (
    <div className="glass-panel mt-3 p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="rounded-full bg-indigo-500/15 px-3 py-1 text-xs font-medium text-indigo-400">
          {RISK_LABELS[signal.risk_type] ?? signal.risk_type}
        </span>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${SEVERITY_COLOR[signal.severity] ?? ""}`}>
          {signal.severity.toUpperCase()}
        </span>
      </div>

      {/* Headline */}
      {signal.headline && (
        <p className="text-sm font-semibold text-foreground/90">{signal.headline}</p>
      )}

      {/* Confidence bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-foreground/50">
          <span>Confidence</span>
          <span>{confidencePct}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-indigo-500"
            style={{ width: `${confidencePct}%` }}
          />
        </div>
      </div>

      {/* Explanation */}
      {signal.explanation && (
        <p className="text-xs text-foreground/70 leading-relaxed">{signal.explanation}</p>
      )}

      {/* Evidence summary */}
      <p className="text-xs text-foreground/50 italic">{signal.evidence_summary}</p>
    </div>
  );
}
```

### Task Group 2 — Parse risk_signal_draft safely

```typescript
// frontend/lib/parseRiskSignal.ts
import type { RiskSignal } from "@/lib/types";

const VALID_RISK_TYPES = new Set([
  "strategy_unclear",
  "alignment_issue",
  "execution_issue",
  "placebo_productivity",
]);

export function parseRiskSignal(raw: string | undefined): RiskSignal | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!VALID_RISK_TYPES.has(parsed?.risk_type)) return null;
    if (typeof parsed.confidence !== "number") return null;
    return parsed as RiskSignal;
  } catch {
    return null;
  }
}
```

### Task Group 3 — Wire into ChatMessages

In `ChatMessages.tsx`, accept `pipelineState` (already a prop). After the last assistant message, if `pipeline_status === "complete"` and `risk_signal_draft` is present, render `RiskSignalCard`:

```typescript
// In ChatMessages.tsx — after the messages.map() block, before the typing indicator

{pipelineState?.pipeline_status === "complete" &&
  pipelineState.risk_signal_draft &&
  (() => {
    const signal = parseRiskSignal(pipelineState.risk_signal_draft);
    return signal ? (
      <div className="flex gap-3">
        <div className="w-8 shrink-0" />
        <div className="flex-1">
          <RiskSignalCard signal={signal} />
        </div>
      </div>
    ) : null;
  })()
}
```

## Design Decisions

- **Render after messages, not inside them**: The card represents structured pipeline output, not a chat turn. Placing it after the message list (similar to `PipelineProgressCard`) keeps the data/chat separation clean.
- **Null-safe parsing**: `risk_signal_draft` is a JSON string that may be malformed if Product Brain had an error. `parseRiskSignal` returns `null` on any parsing failure — the UI falls back to Markdown only.
- **pipeline_status gate**: Only show the card when status is `"complete"` — not during scanning or on error. This prevents partial/stale data from appearing mid-pipeline.
- **No backend change**: `risk_signal_draft` is already in session state. This is a pure frontend read + render.
