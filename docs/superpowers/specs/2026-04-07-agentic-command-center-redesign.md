# Design Spec: Agentic Command Center Redesign

**Date:** 2026-04-07  
**Status:** Approved  
**Scope:** Frontend — workspace page layout, chat rail, HITL inline approvals, bet context entry  
**Principle reference:** `context/product-principles.md`  
**Non-goals:** Backend agent logic changes beyond one new tool call; multi-bet portfolio view; mobile layout

---

## Problem Statement

The current workspace page is one-directional: founders watch the pipeline run but cannot interrogate the agent's reasoning, ask why a risk was flagged, or declare a bet through natural interaction. The UI feels like a dashboard viewer, not an agentic instrument. The intervention approval surface is disconnected from any explanatory context. React Flow canvas exists but is unused and adds ~200kb bundle weight.

---

## Approved Design: Three-Column Command Center

### Layout

```
┌──────┬─────────────────────────────────┬──────────────────────────────┐
│      │  INSTRUMENT PANEL               │  CO-PILOT RAIL               │
│  ÆÆ  │                                 │                              │
│  nav │  ┌── Active Bet ─────────────┐  │  ┌── Chat with Aegis ──────┐ │
│      │  │ "Product OS"  72%  🔴     │  │  │                        │ │
│      │  │ execution_issue detected  │  │  │  [agent messages +     │ │
│      │  │ [Scan Now]  [Edit Bet]    │  │  │   generative UI cards] │ │
│      │  └───────────────────────────┘  │  │                        │ │
│      │                                 │  │  ┌─ Confirmation ────┐  │ │
│      │  ┌── Pipeline Trace ──────────┐ │  │  │ Rescope: cut 2    │  │ │
│      │  │  ● Scan initiated          │ │  │  │ Confidence: 78%   │  │ │
│      │  │  ● Signal Engine  ✓        │ │  │  │ [Approve][Reject] │  │ │
│      │  │  ◌ Product Brain  LIVE     │ │  │  └───────────────────┘  │ │
│      │  │  ⏸ Governor  WAIT          │ │  │                        │ │
│      │  │  — Executor                │ │  │  ┌─ Quick Actions ───┐  │ │
│      │  └───────────────────────────┘  │  │  │ Why this signal?  │  │ │
│      │                                 │  │  │ Show evidence     │  │ │
│      │  ┌── Telemetry Minimap ───────┐ │  │  │ Alternatives?     │  │ │
│      │  │  Signal Brain Coord Gov Ex │ │  │  │ I've handled this │  │ │
│      │  └───────────────────────────┘  │  │  └───────────────────┘  │ │
│      │                                 │  │  _______________________ │ │
│      │                                 │  │  Ask about this signal… │ │
│      │                                 │  └────────────────────────┘ │
└──────┴─────────────────────────────────┴──────────────────────────────┘
  48px            ~48%                              ~52% (resizable)
```

**Column responsibilities:**
- **Left nav (48px, unchanged):** Icon navigation. No changes.
- **Center — Instrument Panel (~48%):** Bet Context card + Pipeline Trace (AgentWorkflowFeed) + Telemetry Minimap. Read-only instrument view.
- **Right — Co-Pilot Rail (~52%, resizable):** `CopilotChat` full height. All interactive decisions happen here. Auto-expands when Governor pauses.

---

## Components

### 1. Layout — `ResizablePanelGroup`

Replace the current flex split-screen with shadcn's `ResizablePanelGroup` (wraps `react-resizable-panels`):

```
AppShell
  └── ResizablePanelGroup (horizontal)
        ├── ResizablePanel (center, defaultSize=48, minSize=35)
        │     ├── BetContextCard          ← NEW
        │     ├── AgentWorkflowFeed       ← KEEP (unchanged)
        │     └── TelemetryMinimap        ← KEEP (unchanged, repositioned)
        ├── ResizableHandle
        └── ResizablePanel (right, defaultSize=52, minSize=30)
              └── CopilotChatRail         ← NEW
```

### 2. BetContextCard — `components/dashboard/BetContextCard.tsx` (NEW)

Displays the currently active bet at the top of the center column.

**Data source:** `useWorkspaceState().activeBet` + `agentState.bet`  
**Fields shown:** bet name, health score (% + color), detected risk type (if present), time horizon  
**Actions:**
- `[Scan Now]` — existing ScanTrigger logic, moved here
- `[Edit Bet]` — opens `BetDeclarationDrawer` (see below)

**Copy rule (product-principles §1):** health label reads "execution looks clean" not "no issues detected."

### 3. CopilotChatRail — `components/chat/CopilotChatRail.tsx` (NEW)

Full-height right panel containing:

```
CopilotChatRail
  ├── CopilotChat (from @copilotkit/react-ui)
  │     ├── Message thread (auto-scroll)
  │     │     └── Generative UI cards rendered inline:
  │     │           ├── RiskSignalCard     (useRenderTool "emit_risk_signal")
  │     │           ├── ReasoningCard      (useRenderTool "show_reasoning")
  │     │           └── ApprovalCard       (useRenderTool "request_founder_approval")
  │     └── CopilotChatInput
  │           └── QuickActionChips        ← NEW (above input)
  └── [auto-expand border pulse when Governor enters WAIT state]
```

**CopilotKit wiring:** `CopilotChat` reads from `/api/copilotkit` which already proxies to `aegis_pipeline` agent. No new wiring needed.

**System message (useCopilotReadable):** Inject current `agentState` (bet name, risk type, confidence, pipeline status) so the agent can answer "why did you flag this?" with grounded, evidence-first responses.

### 4. QuickActionChips — `components/chat/QuickActionChips.tsx` (NEW)

Four chips rendered above the chat input when a risk signal is active:

| Chip | Injected message | Purpose |
|------|-----------------|---------|
| "Why this signal?" | "Explain why you flagged this risk, citing the specific Linear evidence and the product principle you used." | Grounds the answer in `product_principle_refs` |
| "Show the evidence" | "List the specific Linear issues that triggered this signal." | Surfaces `evidence_issues` from Signal Engine |
| "Alternatives?" | "What are the other interventions you considered? Show the top 2 alternatives to your recommendation." | Satisfies principle §2 (one default, alternatives on demand) |
| "I've already handled this" | "The founder says this has already been handled. Acknowledge it, log it as acknowledged risk, and confirm no further action needed." | Natural language dismissal path |

Chips are hidden when no `risk_signal_draft` in agent state (idle state).

### 5. Generative UI Cards (inline in chat thread)

Three `useRenderTool` registrations in the workspace page:

#### `request_founder_approval` → `<InlineApprovalCard />`

Renders when Governor calls the new `request_founder_approval` tool. Contains:
- Risk headline (lost-upside framing from `risk_signal_draft.headline`)
- Action type + escalation level badge
- Rationale (2-3 sentences, cites product principle)
- Confidence bar
- `[Approve]` / `[Reject]` buttons
- Replaces the standalone `InterventionProposal` component entirely

#### `show_reasoning` → `<InlineReasoningCard />`

Collapsible. Renders the Product Brain debate trace (cynic/optimist/synthesis summary). Auto-collapses after 3 seconds. Maps to shadcn AI `Reasoning` component pattern.

#### `emit_risk_signal` → `<InlineRiskSignalCard />`

Renders when Product Brain emits a risk signal above confidence floor. Shows risk type, severity, headline, evidence summary. Not interactive — read-only signal card.

### 6. BetDeclarationDrawer — `components/dashboard/BetDeclarationDrawer.tsx` (NEW)

Opens from `[Edit Bet]` in BetContextCard. Per product-principles §"No template filling":

- **Entry:** "Describe your current product bet in your own words."
- **Agent extracts:** name + hypothesis + one success metric (minimum viable)
- **Confirmation:** Founder sees the extracted fields and confirms with one click
- **POST to:** `/bets` (to be built in Phase 6 — stub for now, populates session state only)
- **No multi-step form.** One text area, one confirmation step.

**Rejection handling:** If founder rejects the extracted bet, show: "Got it. We'll use this to get better at recognizing your bets." (per product-principles §"Not a bet is valuable data").

---

## What to Delete

| File | Why |
|------|-----|
| `components/canvas/MissionControl.tsx` | React Flow canvas, unused in current layout |
| `components/canvas/BetNode.tsx` | RF node, no longer needed |
| `components/canvas/AgentActivityNode.tsx` | RF node, no longer needed |
| `components/canvas/RiskEdge.tsx` | RF edge, no longer needed |
| `hooks/useMissionControlSync.ts` | Syncs RF state, no longer needed |
| `components/dashboard/InterventionProposal.tsx` | Replaced by inline `InlineApprovalCard` in chat thread |

**Dependency to remove:** `@xyflow/react` from `package.json` (~200kb bundle reduction).

---

## Backend Change (One Tool Call)

`governor.py` needs one new tool: `request_founder_approval`.

```python
def request_founder_approval(
    intervention_title: str,
    action_type: str,
    rationale: str,
    confidence: float,
    risk_type: str,
    tool_context: ToolContext | None = None,
) -> dict:
    """Signal to the frontend that founder approval is required.
    
    CopilotKit's useRenderTool catches this call and renders InlineApprovalCard
    in the chat thread. Governor writes pipeline_status = "awaiting_founder_approval"
    to session state as before — this tool call is the additional UI signal.
    """
```

This is additive — the existing `governor_decision` session state write continues unchanged. This tool call is a parallel signal to the frontend's generative UI renderer.

---

## Copy Rules (from product-principles.md)

All agent-generated text in the chat rail must follow:

| Context | Wrong | Right |
|---------|-------|-------|
| No risk detected | "Confidence below threshold — no signal surfaced" | "No gaps above 65% confidence — execution looks clean this week." |
| Risk headline | "Your Q2 bet is at risk." | "Keeping these 3 issues unresolved likely costs you 1 hypothesis validation this sprint." |
| Approval prompt | "An intervention has been proposed." | "Based on the Tigers/Elephants pattern, rescoping sprint 6 gives you the highest chance of validating the hypothesis before EOQ." |
| Rejection acknowledgement | "Intervention rejected." | "Got it. If the same pattern appears again, we'll factor in that you've handled this." |

---

## New Dependencies

| Package | Purpose | Install |
|---------|---------|---------|
| `react-resizable-panels` | Resizable panel layout | Already included via shadcn `ResizablePanelGroup` |
| `@copilotkit/react-ui` | CopilotChat component | Already in `package.json` |
| shadcn `resizable` | Layout primitive | `npx shadcn add resizable` |

No new major dependencies. `@xyflow/react` is removed.

---

## What Stays Unchanged

- `AppShell` (nav sidebar, routing)
- `AgentWorkflowFeed` (pipeline trace — center column)
- `TelemetryMinimap` (repositioned to bottom of center column)
- `ScanTrigger` logic (moved into `BetContextCard`)
- All 6 hooks (`useAgentStateSync`, `useInterventionApproval`, `useInterventionInbox`, `useJulesPlanApproval`, `useMissionControlSync` stays until RF deleted, `useWorkspaceState`)
- `/api/copilotkit/route.ts` (CopilotKit runtime, unchanged)
- `Providers.tsx` (CopilotKit + React Query, unchanged)
- All backend agents, models, tools (except one additive tool in `governor.py`)

---

## Success Criteria

1. Chat rail is visible on the workspace page without any toggle or click.
2. When Governor pauses for HITL, an `InlineApprovalCard` appears in the chat thread. No separate modal.
3. Founder can type "Why did you flag this?" and receive a response citing specific Linear evidence + a product principle by name.
4. Quick-action chips are visible and send the correct pre-filled messages.
5. `@xyflow/react` is removed from `package.json` and `npm run build` passes.
6. No regression in `make test` (backend) or `make eval-all`.
