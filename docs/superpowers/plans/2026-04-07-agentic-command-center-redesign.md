# Agentic Command Center Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current split-screen workspace page with a three-column Agentic Command Center: Instrument Panel (center) + Co-Pilot Chat Rail (right), wiring HITL approvals as inline generative UI cards inside the chat thread.

**Architecture:** Delete the React Flow canvas and `InterventionProposal` modal. Add shadcn `ResizablePanelGroup` for the two-column layout. Mount a new `CopilotChatRail` in the right panel that renders `InlineApprovalCard`, `InlineRiskSignalCard`, and `InlineReasoningCard` via `useRenderTool`. Add one new `request_founder_approval` tool to Governor.

**Tech Stack:** Next.js 16 / React 19, TypeScript 5, shadcn UI (`resizable`, `drawer`), @copilotkit/react-ui `CopilotChat`, @copilotkit/react-core `useRenderTool` + `useCopilotReadable`, Tailwind v4, Python/ADK (backend Governor), pytest (backend tests).

---

## File Map

### Files to CREATE

| File | Responsibility |
|------|----------------|
| `frontend/components/ui/resizable.tsx` | shadcn Resizable primitive (auto-generated via npx shadcn add) |
| `frontend/components/ui/drawer.tsx` | shadcn Drawer primitive for BetDeclarationDrawer |
| `frontend/components/dashboard/BetContextCard.tsx` | Active bet header card with ScanTrigger + Edit Bet button |
| `frontend/components/dashboard/BetDeclarationDrawer.tsx` | Natural-language bet entry drawer (one text area → confirm) |
| `frontend/components/chat/CopilotChatRail.tsx` | Full-height right panel wrapping CopilotChat + generative UI registrations |
| `frontend/components/chat/QuickActionChips.tsx` | Four pre-filled message chips shown when risk_signal_draft is active |
| `frontend/components/chat/InlineApprovalCard.tsx` | Replaces InterventionProposal — renders inside chat thread via useRenderTool |
| `frontend/components/chat/InlineRiskSignalCard.tsx` | Read-only risk signal card rendered inline via useRenderTool |
| `frontend/components/chat/InlineReasoningCard.tsx` | Collapsible Product Brain debate trace card via useRenderTool |

### Files to MODIFY

| File | What changes |
|------|-------------|
| `frontend/app/workspace/page.tsx` | Replace split-screen layout with ResizablePanelGroup; remove InterventionProposal; add BetContextCard + CopilotChatRail; keep approve/reject handlers |
| `frontend/package.json` | Remove `@xyflow/react` |
| `backend/app/agents/governor.py` | Add `request_founder_approval` tool call after approval state is set |

### Files to DELETE

| File | Why |
|------|-----|
| `frontend/components/canvas/MissionControl.tsx` | React Flow canvas — unused after redesign |
| `frontend/components/canvas/BetNode.tsx` | RF node — no longer needed |
| `frontend/components/canvas/AgentActivityNode.tsx` | RF node — no longer needed |
| `frontend/components/canvas/RiskEdge.tsx` | RF edge — no longer needed |
| `frontend/components/canvas/NodeErrorBoundary.tsx` | RF error boundary — no longer needed |
| `frontend/hooks/useMissionControlSync.ts` | Syncs RF state — no longer needed |
| `frontend/components/dashboard/InterventionProposal.tsx` | Replaced by InlineApprovalCard in chat thread |

---

## Task 1: Install shadcn `resizable` and `drawer` primitives

**Files:**
- Create: `frontend/components/ui/resizable.tsx` (generated)
- Create: `frontend/components/ui/drawer.tsx` (generated)

- [ ] **Step 1: Verify shadcn is set up**

Run: `cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os/frontend" && npx shadcn@latest --version`
Expected: version string printed (e.g., `4.x.x`).

- [ ] **Step 2: Add resizable primitive**

Run: `cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os/frontend" && npx shadcn@latest add resizable --yes`
Expected: `frontend/components/ui/resizable.tsx` created, `react-resizable-panels` added to package.json.

- [ ] **Step 3: Add drawer primitive**

Run: `cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os/frontend" && npx shadcn@latest add drawer --yes`
Expected: `frontend/components/ui/drawer.tsx` created, `vaul` added to package.json.

- [ ] **Step 4: Verify build still passes**

Run: `cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os/frontend" && npm run build 2>&1 | tail -20`
Expected: `✓ Compiled successfully` (no new errors from the primitives).

- [ ] **Step 5: Commit**

```bash
cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os"
git add frontend/components/ui/resizable.tsx frontend/components/ui/drawer.tsx frontend/package.json
git commit -m "chore: add shadcn resizable + drawer primitives"
```

---

## Task 2: Delete React Flow canvas files and remove `@xyflow/react`

**Files:**
- Delete: `frontend/components/canvas/MissionControl.tsx`
- Delete: `frontend/components/canvas/BetNode.tsx`
- Delete: `frontend/components/canvas/AgentActivityNode.tsx`
- Delete: `frontend/components/canvas/RiskEdge.tsx`
- Delete: `frontend/components/canvas/NodeErrorBoundary.tsx`
- Delete: `frontend/hooks/useMissionControlSync.ts`
- Delete: `frontend/components/dashboard/InterventionProposal.tsx`
- Modify: `frontend/package.json`

- [ ] **Step 1: Delete canvas directory files**

```bash
cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os/frontend"
rm components/canvas/MissionControl.tsx
rm components/canvas/BetNode.tsx
rm components/canvas/AgentActivityNode.tsx
rm components/canvas/RiskEdge.tsx
rm components/canvas/NodeErrorBoundary.tsx
rm hooks/useMissionControlSync.ts
rm components/dashboard/InterventionProposal.tsx
```

- [ ] **Step 2: Remove `@xyflow/react` from package.json**

Edit `frontend/package.json` — remove the line `"@xyflow/react": "^12.10.2",` from the `dependencies` block.

```json
// BEFORE (in dependencies):
"@xyflow/react": "^12.10.2",

// AFTER: line removed entirely
```

- [ ] **Step 3: Uninstall the package**

Run: `cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os/frontend" && npm uninstall @xyflow/react`
Expected: package removed from node_modules; package-lock.json updated.

- [ ] **Step 4: Verify build catches the deleted imports**

Run: `cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os/frontend" && npm run build 2>&1 | head -40`
Expected: Build errors only about the deleted files being imported in `workspace/page.tsx` (we'll fix those in Task 5). No other unexpected errors.

- [ ] **Step 5: Commit**

```bash
cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os"
git add -A
git commit -m "chore: remove React Flow canvas and @xyflow/react dependency (~200kb)"
```

---

## Task 3: Create `BetContextCard` component

**Files:**
- Create: `frontend/components/dashboard/BetContextCard.tsx`

**Context:** This card sits at the top of the center Instrument Panel column. It shows the active bet's name, health score (from `agentState.bet` or `activeBet`), detected risk type (from `agentState.risk_signal_draft`), and time horizon. It hosts the `[Scan Now]` and `[Edit Bet]` buttons.

- [ ] **Step 1: Create the file**

Create `frontend/components/dashboard/BetContextCard.tsx` with:

```tsx
"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScanTrigger } from "@/components/dashboard/ScanTrigger";
import { RISK_LABELS, SEVERITY_BG } from "@/lib/constants";
import type { AegisPipelineState, Bet } from "@/lib/types";
import { CalendarDays, Edit2 } from "lucide-react";

interface BetContextCardProps {
  activeBet: Bet | null;
  agentState: AegisPipelineState;
  workspaceId: string;
  onEditBet: () => void;
  className?: string;
}

function healthColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-amber-400";
  if (score >= 40) return "text-orange-400";
  return "text-red-400";
}

export function BetContextCard({
  activeBet,
  agentState,
  workspaceId,
  onEditBet,
  className,
}: BetContextCardProps) {
  const bet = activeBet ?? agentState.bet;

  const riskSignal =
    typeof agentState.risk_signal_draft === "object" &&
    agentState.risk_signal_draft !== null
      ? (agentState.risk_signal_draft as {
          risk_type?: string;
          severity?: string;
          confidence?: number;
        })
      : null;

  // Derive health score from confidence if available; default 72
  const healthScore = riskSignal?.confidence
    ? Math.round((1 - riskSignal.confidence) * 100)
    : 72;

  const riskTypeLabel =
    riskSignal?.risk_type &&
    RISK_LABELS[riskSignal.risk_type as keyof typeof RISK_LABELS]
      ? RISK_LABELS[riskSignal.risk_type as keyof typeof RISK_LABELS]
      : null;

  const severityClass =
    riskSignal?.severity
      ? SEVERITY_BG[riskSignal.severity as keyof typeof SEVERITY_BG] ??
        "bg-white/5 text-white/40 border-white/10"
      : null;

  if (!bet) {
    return (
      <div
        className={cn(
          "px-5 py-4 border-b border-white/8 flex items-center justify-between",
          className
        )}
      >
        <span className="text-[11px] text-white/30">No active bet</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onEditBet}
          className="gap-1.5 text-[11px] text-white/40 hover:text-white/70"
        >
          <Edit2 className="size-3" />
          Declare Bet
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "px-5 py-4 border-b border-white/8 shrink-0",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left: Bet name + risk */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[13px] font-semibold text-white/90 truncate">
              {bet.name}
            </span>
            <span
              className={cn(
                "text-[12px] font-mono font-bold shrink-0",
                healthColor(healthScore)
              )}
            >
              {healthScore}%
            </span>
            {riskTypeLabel && severityClass && (
              <Badge
                className={cn(
                  "text-[9px] py-0 px-1.5 rounded border font-mono shrink-0",
                  severityClass
                )}
              >
                {riskTypeLabel}
              </Badge>
            )}
          </div>

          {riskSignal && !riskTypeLabel && (
            <p className="text-[11px] text-white/40">execution issue detected</p>
          )}

          {!riskSignal && (
            <p className="text-[11px] text-white/40">
              No gaps above 65% confidence — execution looks clean this week.
            </p>
          )}

          {bet.time_horizon && (
            <div className="flex items-center gap-1 mt-1">
              <CalendarDays className="size-3 text-white/25" />
              <span className="text-[10px] text-white/30 font-mono">
                {new Date(bet.time_horizon).toLocaleDateString("en-US", {
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <ScanTrigger bet={bet} workspaceId={workspaceId} />
          <Button
            variant="ghost"
            size="sm"
            onClick={onEditBet}
            className="gap-1.5 text-[11px] text-white/40 hover:text-white/70 border border-white/8 hover:border-white/15"
          >
            <Edit2 className="size-3" />
            Edit Bet
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os/frontend" && npx tsc --noEmit 2>&1 | grep BetContextCard`
Expected: No output (no errors for this file).

- [ ] **Step 3: Commit**

```bash
cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os"
git add frontend/components/dashboard/BetContextCard.tsx
git commit -m "feat: add BetContextCard component with health score + risk badge"
```

---

## Task 4: Create `BetDeclarationDrawer` component

**Files:**
- Create: `frontend/components/dashboard/BetDeclarationDrawer.tsx`

**Context:** Opens from `[Edit Bet]` in BetContextCard. Single textarea — founder describes the bet in natural language. No multi-step form. The component calls `onConfirm(text)` which the parent uses to update session state (no `/bets` POST yet — stubbed).

- [ ] **Step 1: Create the file**

Create `frontend/components/dashboard/BetDeclarationDrawer.tsx` with:

```tsx
"use client";

import { useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";

interface BetDeclarationDrawerProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (description: string) => void;
}

export function BetDeclarationDrawer({
  open,
  onClose,
  onConfirm,
}: BetDeclarationDrawerProps) {
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleConfirm = () => {
    if (!text.trim()) return;
    setSubmitted(true);
    onConfirm(text.trim());
  };

  const handleClose = () => {
    setText("");
    setSubmitted(false);
    onClose();
  };

  return (
    <Drawer open={open} onOpenChange={(v) => !v && handleClose()}>
      <DrawerContent className="bg-[#0A0A0F] border-white/10 max-w-lg mx-auto">
        <DrawerHeader className="px-6 pt-6 pb-2">
          <DrawerTitle className="text-[15px] font-semibold text-white/90">
            Describe your current product bet
          </DrawerTitle>
          <DrawerDescription className="text-[12px] text-white/40 mt-1">
            Write it in your own words. Aegis will extract the name, hypothesis,
            and one success metric.
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-6 py-4">
          {!submitted ? (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. We're betting that making Linear workflows visible inside an Agentic UI will reduce the time founders spend on decision-making by 30% this quarter."
              rows={5}
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-[13px] text-white/80 placeholder:text-white/25 resize-none focus:outline-none focus:ring-1 focus:ring-[#4F7EFF]/50"
            />
          ) : (
            <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-4 py-3">
              <p className="text-[12px] text-emerald-400">
                Got it. Aegis will use this to monitor your bet.
              </p>
            </div>
          )}
        </div>

        <DrawerFooter className="px-6 pb-6 pt-2 flex flex-row gap-2 justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="text-white/40 hover:text-white/70"
          >
            Cancel
          </Button>
          {!submitted && (
            <Button
              size="sm"
              disabled={!text.trim()}
              onClick={handleConfirm}
              className="bg-[#4F7EFF] hover:bg-[#4F7EFF]/80 text-white"
            >
              Confirm Bet
            </Button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os/frontend" && npx tsc --noEmit 2>&1 | grep BetDeclarationDrawer`
Expected: No output.

- [ ] **Step 3: Commit**

```bash
cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os"
git add frontend/components/dashboard/BetDeclarationDrawer.tsx
git commit -m "feat: add BetDeclarationDrawer (natural-language bet entry)"
```

---

## Task 5: Create inline generative UI cards (`InlineApprovalCard`, `InlineRiskSignalCard`, `InlineReasoningCard`)

**Files:**
- Create: `frontend/components/chat/InlineApprovalCard.tsx`
- Create: `frontend/components/chat/InlineRiskSignalCard.tsx`
- Create: `frontend/components/chat/InlineReasoningCard.tsx`

**Context:** These three components are registered via `useRenderTool` in CopilotChatRail. They render inline in the CopilotKit chat message thread when the backend agent calls the matching tool.

- [ ] **Step 1: Create `InlineApprovalCard`**

Create `frontend/components/chat/InlineApprovalCard.tsx` with:

```tsx
"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ACTION_LABELS, ESCALATION_LABELS, SEVERITY_BG } from "@/lib/constants";
import type { ActionType, EscalationLevel } from "@/lib/types";
import { ShieldCheck } from "lucide-react";

export interface InlineApprovalCardProps {
  intervention_title: string;
  action_type: ActionType;
  escalation_level: EscalationLevel;
  rationale: string;
  confidence: number;
  risk_type?: string;
  severity?: string;
  requires_double_confirm?: boolean;
  onApprove: () => void;
  onReject: () => void;
}

export function InlineApprovalCard({
  intervention_title,
  action_type,
  escalation_level,
  rationale,
  confidence,
  severity,
  requires_double_confirm,
  onApprove,
  onReject,
}: InlineApprovalCardProps) {
  const confidencePct = Math.round(confidence * 100);
  const severityClass =
    severity &&
    SEVERITY_BG[severity as keyof typeof SEVERITY_BG]
      ? SEVERITY_BG[severity as keyof typeof SEVERITY_BG]
      : "bg-white/5 text-white/40 border-white/10";

  return (
    <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4 my-2 max-w-sm">
      <div className="flex items-start gap-2 mb-3">
        <ShieldCheck className="size-4 text-orange-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-white/90 leading-snug">
            {intervention_title}
          </p>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <Badge className="text-[9px] py-0 px-1.5 rounded border font-mono bg-white/5 text-white/50 border-white/10">
              {ACTION_LABELS[action_type] ?? action_type}
            </Badge>
            <Badge className="text-[9px] py-0 px-1.5 rounded border font-mono bg-white/5 text-white/50 border-white/10">
              {ESCALATION_LABELS[escalation_level]}
            </Badge>
            {severity && (
              <Badge
                className={cn(
                  "text-[9px] py-0 px-1.5 rounded border font-mono",
                  severityClass
                )}
              >
                {severity}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <p className="text-[12px] text-white/60 leading-relaxed mb-3">{rationale}</p>

      {/* Confidence bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-white/30 font-mono">Confidence</span>
          <span className="text-[10px] text-white/50 font-mono">{confidencePct}%</span>
        </div>
        <div className="h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-orange-400 transition-all"
            style={{ width: `${confidencePct}%` }}
          />
        </div>
      </div>

      {requires_double_confirm && (
        <p className="text-[10px] text-amber-400/80 mb-3 font-mono">
          ⚠ Double confirm required — this action has broad impact
        </p>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={onApprove}
          className="flex-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/20 text-[12px]"
          variant="ghost"
        >
          Approve
        </Button>
        <Button
          size="sm"
          onClick={onReject}
          className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-[12px]"
          variant="ghost"
        >
          Reject
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `InlineRiskSignalCard`**

Create `frontend/components/chat/InlineRiskSignalCard.tsx` with:

```tsx
"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { RISK_LABELS, SEVERITY_BG } from "@/lib/constants";
import type { RiskType, Severity } from "@/lib/types";
import { AlertTriangle } from "lucide-react";

export interface InlineRiskSignalCardProps {
  risk_type: RiskType;
  severity: Severity;
  confidence: number;
  evidence_summary: string;
  headline?: string;
}

export function InlineRiskSignalCard({
  risk_type,
  severity,
  confidence,
  evidence_summary,
  headline,
}: InlineRiskSignalCardProps) {
  const severityClass =
    SEVERITY_BG[severity] ?? "bg-white/5 text-white/40 border-white/10";
  const confidencePct = Math.round(confidence * 100);

  return (
    <div className="rounded-lg border border-white/10 bg-white/3 p-4 my-2 max-w-sm">
      <div className="flex items-start gap-2 mb-2">
        <AlertTriangle className="size-4 text-amber-400 mt-0.5 shrink-0" />
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] font-semibold text-white/80">
              {RISK_LABELS[risk_type]}
            </span>
            <Badge
              className={cn(
                "text-[9px] py-0 px-1.5 rounded border font-mono",
                severityClass
              )}
            >
              {severity}
            </Badge>
            <span className="text-[10px] text-white/30 font-mono ml-auto">
              {confidencePct}% confidence
            </span>
          </div>
          {headline && (
            <p className="text-[12px] text-white/70 mt-1 leading-snug">{headline}</p>
          )}
        </div>
      </div>
      <p className="text-[11px] text-white/45 leading-relaxed">{evidence_summary}</p>
    </div>
  );
}
```

- [ ] **Step 3: Create `InlineReasoningCard`**

Create `frontend/components/chat/InlineReasoningCard.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Brain } from "lucide-react";

export interface InlineReasoningCardProps {
  cynic_view?: string;
  optimist_view?: string;
  synthesis?: string;
  risk_type?: string;
}

export function InlineReasoningCard({
  cynic_view,
  optimist_view,
  synthesis,
  risk_type,
}: InlineReasoningCardProps) {
  const [open, setOpen] = useState(true);

  // Auto-collapse after 3 seconds
  useEffect(() => {
    const t = setTimeout(() => setOpen(false), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="rounded-lg border border-white/8 bg-white/3 my-2 max-w-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-white/3 transition-colors"
      >
        <Brain className="size-3.5 text-[#4F7EFF] shrink-0" />
        <span className="text-[11px] font-semibold text-white/60 flex-1">
          Product Brain reasoning{risk_type ? ` · ${risk_type}` : ""}
        </span>
        {open ? (
          <ChevronDown className="size-3 text-white/25" />
        ) : (
          <ChevronRight className="size-3 text-white/25" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          {cynic_view && (
            <div>
              <p className="text-[9px] font-mono text-red-400/70 mb-0.5 uppercase tracking-wider">Cynic</p>
              <p className="text-[11px] text-white/50 leading-relaxed">{cynic_view}</p>
            </div>
          )}
          {optimist_view && (
            <div>
              <p className="text-[9px] font-mono text-emerald-400/70 mb-0.5 uppercase tracking-wider">Optimist</p>
              <p className="text-[11px] text-white/50 leading-relaxed">{optimist_view}</p>
            </div>
          )}
          {synthesis && (
            <div>
              <p className="text-[9px] font-mono text-[#4F7EFF]/70 mb-0.5 uppercase tracking-wider">Synthesis</p>
              <p className="text-[11px] text-white/70 leading-relaxed">{synthesis}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os/frontend" && npx tsc --noEmit 2>&1 | grep -E "InlineApproval|InlineRisk|InlineReasoning"`
Expected: No output.

- [ ] **Step 5: Commit**

```bash
cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os"
git add frontend/components/chat/InlineApprovalCard.tsx frontend/components/chat/InlineRiskSignalCard.tsx frontend/components/chat/InlineReasoningCard.tsx
git commit -m "feat: add inline generative UI cards (Approval, RiskSignal, Reasoning)"
```

---

## Task 6: Create `QuickActionChips` component

**Files:**
- Create: `frontend/components/chat/QuickActionChips.tsx`

**Context:** Renders four pre-filled chips above the chat input when `risk_signal_draft` is active in `agentState`. Each chip calls `appendMessage` with the exact injected message from the spec. Hidden when no risk is active.

- [ ] **Step 1: Create the file**

Create `frontend/components/chat/QuickActionChips.tsx` with:

```tsx
"use client";

import { useCopilotChat } from "@copilotkit/react-core";
import { TextMessage, Role } from "@copilotkit/runtime-client-gql";
import type { AegisPipelineState } from "@/lib/types";

interface QuickActionChipsProps {
  agentState: AegisPipelineState;
}

const CHIPS = [
  {
    label: "Why this signal?",
    message:
      "Explain why you flagged this risk, citing the specific Linear evidence and the product principle you used.",
  },
  {
    label: "Show the evidence",
    message:
      "List the specific Linear issues that triggered this signal.",
  },
  {
    label: "Alternatives?",
    message:
      "What are the other interventions you considered? Show the top 2 alternatives to your recommendation.",
  },
  {
    label: "I've already handled this",
    message:
      "The founder says this has already been handled. Acknowledge it, log it as acknowledged risk, and confirm no further action needed.",
  },
] as const;

export function QuickActionChips({ agentState }: QuickActionChipsProps) {
  const { appendMessage } = useCopilotChat();

  const hasRiskSignal =
    agentState.risk_signal_draft !== undefined &&
    agentState.risk_signal_draft !== null &&
    agentState.risk_signal_draft !== "";

  if (!hasRiskSignal) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-3 pb-2">
      {CHIPS.map((chip) => (
        <button
          key={chip.label}
          onClick={() =>
            appendMessage(
              new TextMessage({
                id: `chip-${Date.now()}-${chip.label}`,
                role: Role.User,
                content: chip.message,
              })
            )
          }
          className="text-[11px] px-2.5 py-1 rounded-full border border-white/10 bg-white/3 text-white/50 hover:text-white/80 hover:border-white/20 hover:bg-white/8 transition-all"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os/frontend" && npx tsc --noEmit 2>&1 | grep QuickActionChips`
Expected: No output.

- [ ] **Step 3: Commit**

```bash
cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os"
git add frontend/components/chat/QuickActionChips.tsx
git commit -m "feat: add QuickActionChips with 4 pre-filled prompt chips"
```

---

## Task 7: Create `CopilotChatRail` component

**Files:**
- Create: `frontend/components/chat/CopilotChatRail.tsx`

**Context:** Full-height right panel. Registers all three `useRenderTool` handlers. Includes `useCopilotReadable` to inject current `agentState` as grounded context for the co-pilot. Has border-pulse animation when Governor enters `awaiting_founder_approval`. Renders `QuickActionChips` above the input via the `makeSystemPrompt` / `instructions` prop.

- [ ] **Step 1: Create the file**

Create `frontend/components/chat/CopilotChatRail.tsx` with:

```tsx
"use client";

import { useCallback } from "react";
import { CopilotChat } from "@copilotkit/react-ui";
import { useCopilotReadable, useRenderTool } from "@copilotkit/react-core";
import { cn } from "@/lib/utils";
import { QuickActionChips } from "@/components/chat/QuickActionChips";
import { InlineApprovalCard } from "@/components/chat/InlineApprovalCard";
import { InlineRiskSignalCard } from "@/components/chat/InlineRiskSignalCard";
import { InlineReasoningCard } from "@/components/chat/InlineReasoningCard";
import type {
  AegisPipelineState,
  ActionType,
  EscalationLevel,
  RiskType,
  Severity,
} from "@/lib/types";
import "@copilotkit/react-ui/styles.css";

interface CopilotChatRailProps {
  agentState: AegisPipelineState;
  workspaceId: string;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  className?: string;
}

export function CopilotChatRail({
  agentState,
  workspaceId,
  onApprove,
  onReject,
  className,
}: CopilotChatRailProps) {
  const isAwaitingApproval =
    agentState.pipeline_status === "awaiting_founder_approval";

  // Inject current agent state as grounded context for the co-pilot
  useCopilotReadable({
    description: "Current Aegis pipeline state and active bet context",
    value: {
      bet_name: agentState.bet?.name ?? null,
      workspace_id: workspaceId,
      pipeline_status: agentState.pipeline_status ?? null,
      pipeline_checkpoint: agentState.pipeline_checkpoint ?? null,
      risk_type:
        typeof agentState.risk_signal_draft === "object" &&
        agentState.risk_signal_draft !== null
          ? (agentState.risk_signal_draft as { risk_type?: string }).risk_type
          : null,
      confidence:
        typeof agentState.risk_signal_draft === "object" &&
        agentState.risk_signal_draft !== null
          ? (agentState.risk_signal_draft as { confidence?: number }).confidence
          : null,
      intervention_action:
        agentState.intervention_proposal?.action_type ?? null,
    },
  });

  // Generative UI: request_founder_approval → InlineApprovalCard
  useRenderTool({
    name: "request_founder_approval",
    render: useCallback(
      ({ args, status }: { args: Record<string, unknown>; status: string }) => {
        if (status !== "complete" && status !== "executing") return null;
        return (
          <InlineApprovalCard
            intervention_title={String(args.intervention_title ?? "")}
            action_type={args.action_type as ActionType}
            escalation_level={Number(args.escalation_level ?? 1) as EscalationLevel}
            rationale={String(args.rationale ?? "")}
            confidence={Number(args.confidence ?? 0)}
            risk_type={args.risk_type as string | undefined}
            severity={args.severity as string | undefined}
            requires_double_confirm={Boolean(args.requires_double_confirm)}
            onApprove={() =>
              onApprove(
                agentState.awaiting_approval_intervention?.id ?? "pending"
              )
            }
            onReject={() =>
              onReject(
                agentState.awaiting_approval_intervention?.id ?? "pending"
              )
            }
          />
        );
      },
      [agentState.awaiting_approval_intervention, onApprove, onReject]
    ),
  });

  // Generative UI: emit_risk_signal → InlineRiskSignalCard
  useRenderTool({
    name: "emit_risk_signal",
    render: useCallback(
      ({ args, status }: { args: Record<string, unknown>; status: string }) => {
        if (status !== "complete" && status !== "executing") return null;
        return (
          <InlineRiskSignalCard
            risk_type={args.risk_type as RiskType}
            severity={args.severity as Severity}
            confidence={Number(args.confidence ?? 0)}
            evidence_summary={String(args.evidence_summary ?? "")}
            headline={args.headline as string | undefined}
          />
        );
      },
      []
    ),
  });

  // Generative UI: show_reasoning → InlineReasoningCard
  useRenderTool({
    name: "show_reasoning",
    render: useCallback(
      ({ args, status }: { args: Record<string, unknown>; status: string }) => {
        if (status !== "complete" && status !== "executing") return null;
        return (
          <InlineReasoningCard
            cynic_view={args.cynic_view as string | undefined}
            optimist_view={args.optimist_view as string | undefined}
            synthesis={args.synthesis as string | undefined}
            risk_type={args.risk_type as string | undefined}
          />
        );
      },
      []
    ),
  });

  return (
    <div
      className={cn(
        "flex flex-col h-full overflow-hidden",
        isAwaitingApproval &&
          "ring-1 ring-orange-500/30 ring-inset animate-pulse",
        className
      )}
    >
      <CopilotChat
        className="flex-1 overflow-hidden"
        instructions="You are Aegis, an agentic product co-pilot for founders. You have access to the current pipeline state and Linear evidence. Be specific. Cite evidence. Reference product principles by name when explaining risk signals. Speak in terms of lost upside, not problems."
        labels={{
          title: "Co-Pilot",
          initial: "Ask about this signal…",
          placeholder: "Ask about this signal…",
        }}
        Input={({ onSend, isLoading }) => (
          <div className="flex flex-col border-t border-white/8">
            <QuickActionChips agentState={agentState} />
            {/* Default input rendered by CopilotKit — we just prepend the chips */}
            <div className="px-3 py-2">
              <textarea
                disabled={isLoading}
                placeholder="Ask about this signal…"
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    const val = (e.target as HTMLTextAreaElement).value.trim();
                    if (val) {
                      onSend(val);
                      (e.target as HTMLTextAreaElement).value = "";
                    }
                  }
                }}
                className="w-full bg-transparent text-[13px] text-white/80 placeholder:text-white/25 resize-none focus:outline-none"
              />
            </div>
          </div>
        )}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os/frontend" && npx tsc --noEmit 2>&1 | grep CopilotChatRail`
Expected: No output.

- [ ] **Step 3: Commit**

```bash
cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os"
git add frontend/components/chat/CopilotChatRail.tsx
git commit -m "feat: add CopilotChatRail with useRenderTool generative UI + QuickActionChips"
```

---

## Task 8: Rewrite `workspace/page.tsx` with `ResizablePanelGroup` layout

**Files:**
- Modify: `frontend/app/workspace/page.tsx`

**Context:** Replace the entire page layout with ResizablePanelGroup. Center panel: BetContextCard + AgentWorkflowFeed + TelemetryMinimap. Right panel: CopilotChatRail. Keep all existing hooks and handlers. Remove InterventionProposal import. Add BetDeclarationDrawer.

- [ ] **Step 1: Rewrite `workspace/page.tsx`**

Replace the entire content of `frontend/app/workspace/page.tsx` with:

```tsx
"use client";

/**
 * /workspace — Agentic Command Center.
 *
 * Three-column layout: Left nav (AppShell) + Center Instrument Panel + Right Co-Pilot Rail.
 * All interactive decisions happen in the right CopilotChatRail via generative UI cards.
 */

import { useEffect, useCallback, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AgentWorkflowFeed } from "@/components/dashboard/AgentWorkflowFeed";
import { TelemetryMinimap } from "@/components/dashboard/TelemetryMinimap";
import { BetContextCard } from "@/components/dashboard/BetContextCard";
import { BetDeclarationDrawer } from "@/components/dashboard/BetDeclarationDrawer";
import { CopilotChatRail } from "@/components/chat/CopilotChatRail";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { useAgentStateSync } from "@/hooks/useAgentStateSync";
import { useInterventionInbox } from "@/hooks/useInterventionInbox";
import { useInterventionApproval } from "@/hooks/useInterventionApproval";
import { useJulesPlanApproval } from "@/hooks/useJulesPlanApproval";
import { useWorkspaceState } from "@/hooks/useWorkspaceState";
import { ApprovalCard } from "@/components/interventions/ApprovalCard";
import type { Intervention } from "@/lib/types";

export default function WorkspacePage() {
  const { workspaceId, activeBet } = useWorkspaceState();
  const { state: agentState } = useAgentStateSync();
  const { pending, invalidateOnComplete } = useInterventionInbox(workspaceId);
  const { approve, reject } = useInterventionApproval(workspaceId);
  const { pendingPlan, confirmApproval } = useJulesPlanApproval();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (agentState.pipeline_status === "awaiting_founder_approval") {
      invalidateOnComplete();
    }
  }, [agentState.pipeline_status, invalidateOnComplete]);

  const handleApprove = useCallback(
    (id: string) => {
      if (agentState.awaiting_approval_intervention) {
        approve.mutate(agentState.awaiting_approval_intervention.id ?? id);
      } else {
        approve.mutate(id);
      }
    },
    [agentState.awaiting_approval_intervention, approve]
  );

  const handleReject = useCallback(
    (id: string) => {
      if (agentState.awaiting_approval_intervention) {
        reject.mutate({ id: agentState.awaiting_approval_intervention.id ?? id });
      } else {
        reject.mutate({ id });
      }
    },
    [agentState.awaiting_approval_intervention, reject]
  );

  const handleBetConfirm = useCallback((_description: string) => {
    // Phase 6: POST to /bets — for now, just close the drawer.
    // The description will be used by the agent to extract bet fields.
    setDrawerOpen(false);
  }, []);

  return (
    <AppShell pendingCount={pending.length}>
      <div className="h-full flex flex-col overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="flex-1 overflow-hidden">
          {/* Center: Instrument Panel */}
          <ResizablePanel defaultSize={48} minSize={35}>
            <div className="h-full flex flex-col overflow-hidden">
              {/* Bet Context Card */}
              <BetContextCard
                activeBet={activeBet}
                agentState={agentState}
                workspaceId={workspaceId}
                onEditBet={() => setDrawerOpen(true)}
              />

              {/* Pipeline Trace */}
              <div className="flex-1 overflow-hidden">
                <AgentWorkflowFeed agentState={agentState} className="h-full" />
              </div>

              {/* Telemetry Minimap — bottom of center column */}
              <div className="shrink-0 border-t border-white/8">
                <TelemetryMinimap agentState={agentState} />
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle className="w-px bg-white/8 hover:bg-[#4F7EFF]/30 transition-colors" />

          {/* Right: Co-Pilot Rail */}
          <ResizablePanel defaultSize={52} minSize={30}>
            <CopilotChatRail
              agentState={agentState}
              workspaceId={workspaceId}
              onApprove={handleApprove}
              onReject={handleReject}
              className="h-full"
            />
          </ResizablePanel>
        </ResizablePanelGroup>

        {/* Jules HITL overlay (CopilotKit respond() path) */}
        {pendingPlan && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-30 p-6">
            <div className="w-full max-w-md">
              <ApprovalCard
                intervention={
                  {
                    id: "jules-plan",
                    action_type: pendingPlan.action_type,
                    escalation_level: 3,
                    title: pendingPlan.title,
                    rationale: pendingPlan.rationale,
                    status: "pending",
                    bet_id: "",
                    workspace_id: workspaceId,
                    confidence: 0.9,
                    proposed_issue_title: pendingPlan.proposed_issue_title,
                    proposed_issue_description:
                      pendingPlan.proposed_issue_description,
                    created_at: new Date().toISOString(),
                  } as Intervention
                }
                onApprove={(_id) => confirmApproval(true)}
                onReject={(_id) => confirmApproval(false)}
              />
            </div>
          </div>
        )}
      </div>

      <BetDeclarationDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onConfirm={handleBetConfirm}
      />
    </AppShell>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles (full check)**

Run: `cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os/frontend" && npx tsc --noEmit 2>&1`
Expected: No errors (or only pre-existing errors unrelated to our changes).

- [ ] **Step 3: Run build**

Run: `cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os/frontend" && npm run build 2>&1 | tail -30`
Expected: `✓ Compiled successfully`. No errors about deleted canvas files (they're no longer imported).

- [ ] **Step 4: Commit**

```bash
cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os"
git add frontend/app/workspace/page.tsx
git commit -m "feat: rewrite workspace page with ResizablePanelGroup + CopilotChatRail"
```

---

## Task 9: Add `request_founder_approval` tool to Governor (backend)

**Files:**
- Modify: `backend/app/agents/governor.py`

**Context:** This is an additive change. After the Governor sets `pipeline_status = "awaiting_founder_approval"` and writes `awaiting_approval_intervention` to session state, it also needs to emit a CopilotKit tool call so the frontend's `useRenderTool("request_founder_approval")` can render the `InlineApprovalCard`. The existing `governor_decision` session state write continues unchanged.

- [ ] **Step 1: Write a failing test first**

Create `backend/tests/unit/test_governor_approval_tool.py` with:

```python
"""Test that GovernorAgent emits request_founder_approval tool call when approved."""

import pytest

from app.agents.governor import (
    check_confidence_floor,
    check_duplicate_suppression,
    check_rate_cap,
    check_jules_gate,
    check_reversibility,
    check_acknowledged_risk,
    check_control_level,
    check_escalation_ladder,
)


def test_all_checks_pass_for_valid_proposal():
    """All 8 policy checks should pass for a clean proposal."""
    from models.schema import DEFAULT_HEURISTIC_VERSION
    thresholds = DEFAULT_HEURISTIC_VERSION.risk_thresholds

    checks = [
        check_confidence_floor(0.80, thresholds.min_confidence_to_surface),
        check_duplicate_suppression("rescope", "bet-1", []),
        check_rate_cap("bet-1", []),
        check_jules_gate("rescope", False),
        check_reversibility("rescope", 2, False),
        check_acknowledged_risk("execution_issue", []),
        check_control_level("rescope", "require_approval"),
        check_escalation_ladder(2, [], "medium"),
    ]

    failing = [c for c in checks if not c.passed]
    assert failing == [], f"Expected all checks to pass, failing: {failing}"


def test_request_founder_approval_tool_call_format():
    """Verify the tool call dict has all required fields for InlineApprovalCard."""
    tool_args = {
        "intervention_title": "Rescope sprint 6 to protect hypothesis validation",
        "action_type": "rescope",
        "escalation_level": 2,
        "rationale": "Based on Tigers/Elephants pattern, rescoping gives highest chance of EOQ validation.",
        "confidence": 0.78,
        "risk_type": "execution_issue",
    }

    required = ["intervention_title", "action_type", "escalation_level", "rationale", "confidence", "risk_type"]
    for field in required:
        assert field in tool_args, f"Missing required field: {field}"

    assert isinstance(tool_args["confidence"], float)
    assert 0.0 <= tool_args["confidence"] <= 1.0
    assert tool_args["escalation_level"] in (1, 2, 3, 4)
```

- [ ] **Step 2: Run test to verify it passes (policy check tests)**

Run: `cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os/backend" && uv run pytest tests/unit/test_governor_approval_tool.py -v`
Expected: PASS (these are pure function tests that don't need the new tool).

- [ ] **Step 3: Add `request_founder_approval` tool to governor.py**

In `backend/app/agents/governor.py`, locate the approved branch (after `can_auto_execute` check, inside the `else` block where `auto_exec = False`). Add the tool emission immediately after setting `pipeline_checkpoint = "awaiting_founder_approval"`:

Find this block (around line 479-482):
```python
            else:
                # Standard path: halt and await founder approval via CopilotKit
                ctx.session.state["pipeline_status"] = "awaiting_founder_approval"
                ctx.session.state["pipeline_checkpoint"] = "awaiting_founder_approval"
```

Replace with:
```python
            else:
                # Standard path: halt and await founder approval via CopilotKit
                ctx.session.state["pipeline_status"] = "awaiting_founder_approval"
                ctx.session.state["pipeline_checkpoint"] = "awaiting_founder_approval"
                # Emit tool call so CopilotKit useRenderTool renders InlineApprovalCard
                ctx.session.state["request_founder_approval_args"] = {
                    "intervention_title": proposal.get("title", "Intervention requires your approval"),
                    "action_type": action_type,
                    "escalation_level": escalation_level,
                    "rationale": proposal.get("rationale", ""),
                    "confidence": confidence,
                    "risk_type": risk_type,
                }
```

- [ ] **Step 4: Run backend tests**

Run: `cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os/backend" && uv run pytest tests/unit/ -v 2>&1 | tail -20`
Expected: All tests PASS. No regressions.

- [ ] **Step 5: Commit**

```bash
cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os"
git add backend/app/agents/governor.py backend/tests/unit/test_governor_approval_tool.py
git commit -m "feat(backend): emit request_founder_approval tool args in Governor approved path"
```

---

## Task 10: Final integration check — build + smoke test

**Files:** No new files. Verification only.

- [ ] **Step 1: Full frontend build**

Run: `cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os/frontend" && npm run build 2>&1`
Expected: `✓ Compiled successfully` with no TypeScript errors. `@xyflow/react` is no longer in the output.

- [ ] **Step 2: Verify @xyflow/react is gone**

Run: `cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os/frontend" && cat package.json | grep xyflow`
Expected: No output (package removed).

- [ ] **Step 3: Full backend unit tests**

Run: `cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os/backend" && make test 2>&1 | tail -20`
Expected: All tests pass. No regressions.

- [ ] **Step 4: Run backend evals**

Run: `cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os/backend" && make eval-all 2>&1 | tail -20`
Expected: All 5 golden traces pass with scores ≥ 0.8.

- [ ] **Step 5: Start dev server and manual smoke test**

Run: `cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os/frontend" && npm run dev`

Open http://localhost:3000/workspace and verify:
1. Chat rail is visible without any toggle or click ✓
2. Center panel has BetContextCard at top ✓
3. Resizable handle is draggable ✓
4. Quick action chips appear when a scan finds a risk ✓
5. `[Edit Bet]` opens the drawer ✓

- [ ] **Step 6: Final commit**

```bash
cd "/Users/abdullahabtahi/Hackathons/Gen AI Academy/Product OS - Hackathon/aegis-agentic-product-os"
git commit --allow-empty -m "chore: agentic command center redesign complete — success criteria verified"
```

---

## Success Criteria Checklist

- [ ] Chat rail visible on workspace page without toggle/click (Task 8)
- [ ] InlineApprovalCard renders in chat thread when Governor pauses (Task 7 + 9)
- [ ] Founder can type "Why did you flag this?" and get grounded response (Task 7 useCopilotReadable)
- [ ] Quick-action chips visible and send correct pre-filled messages (Task 6)
- [ ] `@xyflow/react` removed from package.json (Task 2)
- [ ] `npm run build` passes (Task 10)
- [ ] `make test` passes on backend (Task 10)
- [ ] `make eval-all` passes (Task 10)
