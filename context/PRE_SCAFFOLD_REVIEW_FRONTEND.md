# PRE_SCAFFOLD_REVIEW_FRONTEND.md
# Aegis Agentic Product OS — Frontend Pre-Implementation Review

> **Audience:** Claude Code. Read every section before writing any frontend file.
> **Goal:** Not a demo. This is production-grade infrastructure for real founders.
> **Severity:** 🔴 Blocker (do not scaffold until resolved) · 🟡 Risk (mitigate before merge) · 🟢 Improvement (do in same PR if low cost)
> **Baseline:** ag-ui-docs.txt (11,534 lines) · adk.dev/integrations/ag-ui · agentic-patterns.com · frontend-integration.md (897 lines)

---

## Executive Summary

The `frontend-integration.md` plan is thoughtful and largely correct in architecture. The core stack (React Flow + CopilotKit + AG-UI + shadcn/ui) is validated — Google ADK has **first-party AG-UI support** via CopilotKit (confirmed: adk.dev/integrations/ag-ui). Critical blockers are concentrated in the HITL approval mechanism and the absence of an explicit AG-UI endpoint on the backend. Resolve these before writing a single component.

**Total findings: 5 Blockers · 9 Risks · 7 Improvements**

---

## LENS 1 — AG-UI Protocol Fit

### F1.1 🔴 BLOCKER — No AG-UI endpoint defined on the backend

**Finding:** `frontend-integration.md` references `AG-UI event streams` throughout but never specifies how the ADK backend exposes an AG-UI-compatible HTTP endpoint. The `agent.py` runs an ADK `App` (port 8000 by default), but ADK's default API is not natively AG-UI. AG-UI requires SSE or WebSocket delivery of typed events.

**ADK docs confirm:** The ADK AG-UI integration requires the `FastAPIMiddleware` adapter to expose the ADK agent as an AG-UI endpoint:
```python
# Required: backend/app/main.py
from copilotkit.integrations.fastapi import add_fastapi_endpoint
from copilotkit import CopilotKitSDK, LangGraphAgent

sdk = CopilotKitSDK(agents=[...])
add_fastapi_endpoint(app, sdk, "/copilotkit")  # This is the AG-UI SSE endpoint
```

For ADK specifically, the integration pattern from `adk.dev/integrations/ag-ui`:
```bash
npx copilotkit@latest create -f adk  # Scaffolds the correct stack
```
The backend must expose the agent via the CopilotKit ADK adapter, not raw ADK `App`.

**Fix required:** Create `backend/app/main.py` (FastAPI) that wraps `root_agent` through CopilotKit's ADK integration layer. The ADK playground port (8000/adk web) is NOT the AG-UI endpoint. The CopilotKit adapter runs on a separate port (8000 by convention but separate process).

---

### F1.2 🔴 BLOCKER — `useInterrupt` from `@copilotkit/react-core/v2` does not exist

**Finding:** The plan uses:
```typescript
import { useInterrupt } from "@copilotkit/react-core/v2"
```
The `/v2` subpath is **not a valid export** in any published CopilotKit version. The AG-UI interrupt pattern for ADK uses either:
1. `useCopilotAction` with `renderAndWaitForResponse` (already used for `propose_intervention`) — this IS correct
2. The AG-UI protocol's `RUN_FINISHED { outcome: "interrupt" }` → `resume` pattern (draft spec, not yet stable)

**Fix required:** Delete `useJulesPlanApproval.ts` as written. For Jules Plan Approval, use the same `useCopilotAction` + `renderAndWaitForResponse` pattern applied to a `propose_jules_plan` action name. The `Dialog` still applies — just render it inside `renderAndWaitForResponse`, not inside `useInterrupt`.

```typescript
// CORRECT replacement for useJulesPlanApproval.ts
import { useCopilotAction } from "@copilotkit/react-core"

export function useJulesPlanApproval() {
  useCopilotAction({
    name: "propose_jules_plan",
    available: "remote",
    parameters: [
      { name: "jules_session", type: "object", required: true },
      { name: "plan_steps", type: "array", required: true },
    ],
    renderAndWaitForResponse: ({ args, respond, status }) => (
      <JulesPlanApprovalDialog
        session={args.jules_session as JulesSession}
        planSteps={args.plan_steps as string[]}
        status={status}
        onApprove={() => respond?.(JSON.stringify({ approved: true }))}
        onReject={(reason) => respond?.(JSON.stringify({ approved: false, reason }))}
      />
    ),
  })
}
```

---

### F1.3 🟡 RISK — `agentSubscriber.subscribe(...)` is not a documented AG-UI/CopilotKit API

**Finding:** `useAgentToolCallEvents.ts` uses:
```typescript
const { agentSubscriber } = useCopilotContext()
agentSubscriber.subscribe({ onToolCallStartEvent, onToolCallEndEvent })
```
`agentSubscriber` is not in the public CopilotKit API documentation. The correct approach for reacting to AG-UI tool call events in React is either:
1. Using `useCoAgentStateRender` (already used in `RiskSignalCard`) for state-driven reactions
2. Using the AG-UI middleware pattern on the backend to emit `CUSTOM` events that map to `STATE_DELTA` updates

**Fix required:** Replace `useAgentToolCallEvents.ts` with a state-driven approach. When `scan_linear_signals` starts, the ADK backend emits a `STATE_DELTA` updating `agent_running: true` for the relevant bet. The frontend reacts via `useMissionControlSync`'s `onDelta` handler — no custom subscriber needed.

```typescript
// useMissionControlSync.ts — add to onDelta handler
onDelta: (delta) => {
  // Backend encodes tool activity through state, not custom subscribers
  if (delta.path.startsWith("/bets/") && delta.value?.agent_running !== undefined) {
    const betId = delta.path.split("/")[2]
    setNodes(nds => nds.map(n =>
      n.id === betId
        ? { ...n, data: { ...n.data, agent_running: delta.value.agent_running } }
        : n
    ))
  }
}
```

---

### F1.4 🟡 RISK — `THINKING_*` events referenced implicitly, `REASONING_*` must be used

**Finding:** The plan doesn't explicitly reference `THINKING_*` events, but `RiskSignalCard.tsx` uses `useCoAgentStateRender` to show `streaming_explanation`. If the backend uses Gemini Flash's thinking mode (as the architecture specifies for Cynic/Optimist in Product Brain), the events emitted will be `REASONING_*` events (not `THINKING_*` which are deprecated in AG-UI 1.0). The frontend must not rely on `THINKING_*`.

**Fix required:** In `useCoAgentStateRender`, filter `status === "inProgress"` correctly — this is already right. Additionally, ensure no TypeScript types reference `THINKING_START` or similar deprecated enum values from `@ag-ui/core`.

---

### F1.5 🟢 IMPROVEMENT — Declare `AgentCapabilities` explicitly

**Finding:** The plan never declares `AgentCapabilities` in the CopilotKit provider. AG-UI recommends declaring which capabilities the agent supports:
```typescript
// layout.tsx — CopilotKitProvider
<CopilotKit
  runtimeUrl="/api/copilotkit"
  agent="aegis_pipeline"
  // Declare what this agent supports
>
```
Per CopilotKit-ADK integration: set `agent="aegis_pipeline"` matching the ADK root_agent name. Missing this causes CopilotKit to use the default agent, breaking multi-agent state sync.

**Fix required:** Add `agent="aegis_pipeline"` to `<CopilotKit>` provider in `layout.tsx`.

---

### F1.6 🟢 IMPROVEMENT — Use `ActivityMessage` for pipeline stage progress

**Finding:** AG-UI's `ActivityMessage` type (emitted via `ACTIVITY_SNAPSHOT`/`ACTIVITY_DELTA`) is specifically designed for frontend-only progress UI that never pollutes the agent's conversation history. The plan shows agent activity via `AgentActivityNode` + toasts, but the Signal Engine → Product Brain → Coordinator → Governor stages have no structured progress surface.

**Recommendation:** Replace ad-hoc spinner/toast approach for pipeline stages with ACTIVITY_SNAPSHOT events from the backend. On the frontend, render a `PipelineProgressBar` component that shows the current stage:
```typescript
interface AegisPipelineActivity {
  activityType: "PIPELINE_STAGE"
  content: {
    stage: "signal_engine" | "product_brain" | "coordinator" | "governor" | "executor"
    bet_id: string
    status: "running" | "complete" | "error"
  }
}
```

---

## LENS 2 — CopilotKit HITL Integration

### F2.1 🔴 BLOCKER — `useCopilotAction` with `available: "remote"` misunderstood

**Finding:** The plan uses:
```typescript
useCopilotAction({
  name: "propose_intervention",
  available: "remote",
  ...
  renderAndWaitForResponse: ({ args, respond, status }) => ...
})
```

`available: "remote"` means the action is **offered to the agent but executed on the frontend**. This is correct. However, the critical misunderstanding is in how `respond` works:

- `renderAndWaitForResponse` **blocks the agent run** on the backend only if the backend agent has been instructed to call `propose_intervention` as a frontend tool.
- In ADK, frontend tools must be declared in the agent's `tools` list OR injected via the CopilotKit context. ADK agents do not automatically know about `useCopilotAction`-defined tools unless they are passed in the `RunAgentInput.tools` array.

**Fix required:** In the backend `coordinator.py`, the `propose_intervention` tool must be declared as a tool that the Coordinator should call when it wants founder approval. CopilotKit's ADK adapter automatically injects frontend-registered `useCopilotAction` tools into the `RunAgentInput.tools` array. To enable this:

1. Ensure `@copilotkit/react-core` version ≥ 1.3.x (verified CopilotKit-ADK support)
2. Backend Coordinator must call `propose_intervention` as a normal tool call — the ADK-CopilotKit adapter routes it to the frontend
3. The agent run is **paused at the tool call** until `respond()` is called from the frontend
4. Do NOT use `output_key` for intervention proposals — the tool call pattern handles this

---

### F2.2 🟡 RISK — No timeout handling for `renderAndWaitForResponse`

**Finding:** If a founder closes their browser tab while an intervention approval is pending, the backend agent run will hang indefinitely waiting for `respond()`. There is no timeout mechanism in the plan.

**Fix required:** Implement a server-side timeout in the Governor using ADK's `before_tool_callback`. If `propose_intervention` does not receive a response within N minutes, the Governor auto-rejects with `timeout` status:
```python
# governor.py — add timeout enforcement
MAX_APPROVAL_WAIT_SECONDS = 300  # 5 minutes

async def before_tool_callback(tool_name: str, tool_input: dict, ctx: CallbackContext):
    if tool_name == "propose_intervention":
        # Set a deadline in session state; checked on resume
        ctx.session.state["approval_deadline"] = time.time() + MAX_APPROVAL_WAIT_SECONDS
```

On the frontend, show a countdown timer in `InterventionApprovalCard`:
```tsx
// InterventionApprovalCard.tsx — add deadline awareness
const deadline = intervention.approval_deadline
const [timeLeft, setTimeLeft] = useState(computeTimeLeft(deadline))
// Auto-dismiss renders "Expired — agent auto-rejected" state
```

---

### F2.3 🟡 RISK — `acceptIntervention` / `rejectIntervention` in `useCoordinatorAgent` bypass `respond()`

**Finding:** `useCoordinatorAgent.ts` exposes:
```typescript
acceptIntervention: (note?) => setState(s => ({
  ...s,
  pending_intervention: { ...s.pending_intervention, status: "accepted" }
}))
```

And `InterventionInbox.tsx` calls `acceptIntervention(intervention.id, note)` directly.

This is a **dual-path problem**: the Inbox modifies CoAgent state, but the active `renderAndWaitForResponse` callback is waiting for `respond()`. These two paths are decoupled — accepting via CoAgent state change does NOT call `respond()`. The backend will not resume.

**Fix required:** The Intervention Inbox should NOT call `acceptIntervention` from `useCoordinatorAgent`. Instead:
- **Path A (active intervention card):** Accept/Reject via `respond()` inside `renderAndWaitForResponse`
- **Path B (inbox for historical/queued items not currently blocking):** Accept via a REST POST to `/api/interventions/{id}/decision` which writes to AlloyDB and triggers a new agent run

These are genuinely two different scenarios. Document and implement them separately.

---

### F2.4 🟡 RISK — `useCoAgent` name must match ADK agent name exactly

**Finding:** The plan uses:
```typescript
useCoAgent<CoordinatorAgentState>({ name: "coordinator_agent" })
```

In `agent.py`, the agent is `aegis_pipeline` (the `SequentialAgent` root). Individual sub-agents are `coordinator`, `product_brain_agent`, etc. CopilotKit syncs state from the **root agent** by default, or from a named sub-agent if the ADK adapter supports sub-agent state routing.

**Verify:** Confirm whether CopilotKit's ADK adapter supports `useCoAgent({ name: "coordinator_agent" })` targeting a sub-agent within a `SequentialAgent`, or if it only exposes the root pipeline state.

**Fix required (if sub-agent targeting is unsupported):** Use a single `useCoAgent({ name: "aegis_pipeline" })` and read Coordinator state from a namespaced key within the root pipeline state:
```typescript
interface AegisPipelineState {
  // All sub-agent state lives here, keyed by agent name
  coordinator: CoordinatorAgentState
  product_brain: ProductBrainState
  governor: GovernorState
}
const { state } = useCoAgent<AegisPipelineState>({ name: "aegis_pipeline" })
const coordinatorState = state.coordinator
```

---

### F2.5 🟢 IMPROVEMENT — Snooze state must survive page refresh

**Finding:** `useState<Set<string>>` for snoozed interventions is ephemeral. Founders who snooze an intervention and return after a browser refresh will see it re-appear, eroding trust ("I already dismissed this").

**Fix:** Use `localStorage` with a TTL (snooze expires after N hours):
```typescript
function useSnoozedInterventions(timeoutHours = 4) {
  const [snoozed, setSnoozed] = useState(() => loadSnoozedFromStorage())
  const snooze = (id: string) => {
    const expires = Date.now() + timeoutHours * 60 * 60 * 1000
    const updated = { ...loadSnoozedFromStorage(), [id]: expires }
    localStorage.setItem("aegis_snoozed", JSON.stringify(updated))
    setSnoozed(new Set(Object.keys(updated).filter(k => updated[k] > Date.now())))
  }
  return { snoozed, snooze }
}
```

---

## LENS 3 — State Management Architecture

### F3.1 🔴 BLOCKER — Split-brain between React Query cache and CoAgent state

**Finding:** The plan defines two separate state sources for `WorkspaceState`:

1. `useWorkspaceState` → React Query → `fetchWorkspaceState(workspaceId)` (REST, 30s stale)
2. `useMissionControlSync` → CoAgent → `STATE_DELTA` events (real-time)
3. `useInterventionInbox` → React Query → separate `fetchInterventions()` (10s stale)

When the agent approves an intervention and updates `intervention.status → "executed"`:
- The AG-UI `STATE_DELTA` updates the CoAgent state immediately
- The React Query `interventions` cache is stale for up to 10s
- The Inbox still shows the intervention as "pending" for up to 10s

If the founder clicks Accept during this window, they'll get a double-execution attempt.

**Fix required:** All state that the agent modifies must flow through ONE path. Use the AG-UI `STATE_DELTA` → React Query invalidation pattern consistently:

```typescript
// useAgentStateSync.ts — single source of truth bridge
useAgentDeltaSync({
  onDelta: (delta) => {
    // Surgically invalidate React Query caches based on what changed
    if (delta.path.startsWith("/interventions/")) {
      queryClient.invalidateQueries(["interventions", workspaceId])
    }
    if (delta.path.startsWith("/bets/")) {
      // Update React Flow nodes directly — don't re-fetch
      updateBetNode(delta)
    }
  },
  onSnapshot: (snapshot) => {
    // Full refresh — replace all React Query caches
    queryClient.setQueryData(["workspace", workspaceId], snapshot)
    queryClient.setQueryData(["interventions", workspaceId, "pending"], snapshot.pending_interventions)
  }
})
```

Never poll. Use `staleTime: Infinity` for all agent-managed data and rely exclusively on AG-UI events for updates.

---

### F3.2 🟡 RISK — `applyStateDelta` is not provided by AG-UI — must implement correctly

**Finding:** The plan references `applyStateDelta(old, delta)` as if it's a utility. AG-UI confirms the correct library is `fast-json-patch`:
```typescript
import { applyPatch } from "fast-json-patch"
const result = applyPatch(state, delta, true, false)
// true = validate patch, false = don't mutate original
state = result.newDocument
```

The plan's `lib/state-delta.ts` must implement this correctly. If not immutable (i.e., if `applyPatch` mutates in place), React Flow will not detect state changes and nodes won't re-render.

**Fix required:** In `lib/state-delta.ts`:
```typescript
import { applyPatch, deepClone } from "fast-json-patch"

export function applyStateDelta<T>(state: T, operations: Operation[]): T {
  const cloned = deepClone(state)  // always deep-clone before patching
  const result = applyPatch(cloned, operations, true, false)
  return result.newDocument as T
}
```

---

### F3.3 🟡 RISK — No SSE reconnection strategy

**Finding:** The plan has no handling for SSE connection drops. In production, mobile networks, corporate proxies, and serverless cold-starts will cause AG-UI SSE streams to disconnect. When this happens:
- React Flow nodes freeze in their last state (including `agent_running: true` ghost nodes)
- Pending `renderAndWaitForResponse` modals remain open but disconnected

**Fix required:** Add a reconnection handler that:
1. On reconnect, requests a `STATE_SNAPSHOT` to resync React Flow entirely
2. Clears all `agent_running: true` flags on nodes (safe assumption: agent is not running if disconnected)
3. Shows a non-blocking "Reconnecting..." banner (not a modal — don't block the UI)

CopilotKit handles SSE reconnection internally; but add an `onConnectionStatus` callback:
```typescript
// layout.tsx
<CopilotKit
  runtimeUrl="/api/copilotkit"
  onConnectionStatusChange={(status) => {
    if (status === "reconnected") {
      queryClient.invalidateQueries() // full re-sync
    }
  }}
>
```

---

## LENS 4 — React Flow Canvas

### F4.1 🟡 RISK — `parentMessageId` overloaded as `betId` is fragile

**Finding:** The plan uses:
```typescript
// convention: parentMessageId = betId for scoped tools
betId: e.parentMessageId
```

`ToolCallStartEvent.parentMessageId` is an optional field meant to link a tool call to its parent message — not to carry application-level IDs. This is a semantic hack. If CopilotKit or ADK changes how they populate `parentMessageId`, this silently breaks.

**Fix required:** Encode `betId` in the tool call arguments themselves. The Signal Engine's `scan_linear_signals` tool should accept `bet_id` as an explicit parameter. The frontend reads it from the streamed `TOOL_CALL_ARGS`:
```typescript
// In onToolCallStart handler
// Wait for TOOL_CALL_ARGS to contain { bet_id: "..." }
// Then update the correct node
```
Or: emit a `STATE_DELTA` from the backend setting `active_scan_bet_id` in pipeline state, which the frontend uses to trigger node animation.

---

### F4.2 🟡 RISK — `RiskClusterNode` is declared in `nodeTypes` with no implementation

**Finding:**
```typescript
const nodeTypes = {
  bet: BetNode,
  agentActivity: AgentActivityNode,
  riskCluster: RiskClusterNode,  // ← no implementation exists in the plan
}
```

If `RiskClusterNode` is undefined at runtime, React Flow will throw and crash the entire canvas — no ErrorBoundary will catch a `nodeTypes` reference error.

**Fix required:**
```typescript
// Placeholder until Phase 2
function RiskClusterNodePlaceholder() { return null }

const nodeTypes = {
  bet: BetNode,
  agentActivity: AgentActivityNode,
  riskCluster: RiskClusterNodePlaceholder, // Phase 2
}
```
Additionally, never create nodes of type `riskCluster` in `betToNode()` until Phase 2.

---

### F4.3 🟡 RISK — Missing ErrorBoundary on React Flow node renderers

**Finding:** The plan specifies: "Error boundaries on React Flow canvas. A crashed node renderer must not crash the whole canvas." — but no `ErrorBoundary` implementation is shown anywhere.

**Fix required:** Create `components/mission-control/NodeErrorBoundary.tsx`:
```tsx
class NodeErrorBoundary extends React.Component<
  { children: React.ReactNode; nodeId: string },
  { hasError: boolean }
> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(err: Error) {
    console.error(`[BetNode ${this.props.nodeId}] crashed:`, err)
    // TODO: Phase 3 — report to Sentry/Cloud Trace
  }
  render() {
    if (this.state.hasError) return (
      <div className="p-2 text-xs text-destructive border border-destructive/50 rounded">
        Node error
      </div>
    )
    return this.props.children
  }
}

// BetNode.tsx wraps with:
export function BetNode({ data, id }: NodeProps<BetNodeData>) {
  return (
    <NodeErrorBoundary nodeId={id}>
      {/* existing BetNode JSX */}
    </NodeErrorBoundary>
  )
}
```

---

### F4.4 🟢 IMPROVEMENT — Define a minimum viewport and mobile fallback

**Finding:** React Flow requires a container with explicit dimensions. On 1280×800 laptops or iPads, a full-canvas with 10+ bet nodes will be unusable. The plan specifies no minimum viewport or mobile handling.

**Recommendation:**
- Minimum supported viewport: 1280×768 (typical 13" laptop)
- On `window.innerWidth < 1024`: render an `InterventionInbox`-only view (skip canvas)
- Add `<ReactFlow fitView fitViewOptions={{ padding: 0.2 }}>` for auto-layout on load

---

## LENS 5 — HITL Flow & Product Principles Alignment

### F5.1 🟡 RISK — `Badge variant="destructive"` contradicts brand principles

**Finding:** Per `product-principles.md`: "Reframe risk as lost upside, not threat. Never use alarm language — founders have enough anxiety." Yet:
```tsx
<Badge variant="destructive">{open_risk_count} risks</Badge>
```
And:
```tsx
RISK_TYPE_CONFIG = {
  strategy_unclear: { variant: "destructive" },
  ...
}
```

`destructive` in shadcn renders as RED — alarm language. This directly contradicts the design principle.

**Fix required:**
```typescript
const RISK_TYPE_CONFIG = {
  strategy_unclear:     { label: "Strategy gap",          variant: "warning",   icon: "🎯" },
  alignment_issue:      { label: "Alignment drift",        variant: "secondary", icon: "🧭" },
  execution_issue:      { label: "Execution lag",          variant: "outline",   icon: "⚡" },
  placebo_productivity: { label: "Effort without signal",  variant: "outline",   icon: "🔄" },
} as const
```
For `open_risk_count` on `BetNode`: use `variant="secondary"` (neutral) unless the health score is below 30 (then "warning"). Never use `destructive`.

---

### F5.2 🟡 RISK — `InterventionApprovalCard` buttons disabled on `status !== "executing"` — wrong condition

**Finding:**
```tsx
<Button
  onClick={() => onAccept(note)}
  disabled={status !== "executing"}
>
```

In CopilotKit, `renderAndWaitForResponse` provides `status` as:
- `"executing"` = agent is waiting for the response (buttons should be ENABLED)
- `"complete"` = respond() was already called (buttons should be disabled)
- `"inProgress"` = agent is running but not yet at this tool call

So `disabled={status !== "executing"}` is actually correct. But the founder sees the card appear BEFORE status reaches "executing". During this window, the card is visible but buttons are disabled — founders will try to click and be confused.

**Fix required:** Show a "Agent is analyzing..." loading state instead of a disabled card until `status === "executing"`:
```tsx
if (status !== "executing") {
  return <InterventionCardSkeleton />
}
return <InterventionApprovalCard ... />
```

---

### F5.3 🟡 RISK — `no_intervention` must never appear in any UI surface

**Finding:** Per backend architecture: `no_intervention` is a valid Coordinator output but must be silently dropped — never shown to founders. The Intervention Inbox queries `fetchInterventions(workspaceId, { status: "pending" })`.

**Verify:** Confirm the `fetchInterventions` API call filters `action_type != "no_intervention"` at the database query level (AlloyDB), not at the component level. If this filter is missing from the backend API, founders will see empty-titled cards.

**Fix required:** Add to AlloyDB query in interventions endpoint:
```sql
WHERE status = 'pending'
  AND action_type != 'no_intervention'
ORDER BY severity DESC, created_at DESC
```

---

### F5.4 🟢 IMPROVEMENT — Jules Plan Dialog: use Sheet, not Dialog

**Finding:** The plan uses a `Dialog` (full-screen modal) for Jules Plan Approval. Per the product principles: "Founders should never feel trapped." A blocking dialog for a multi-step plan review (that might require the founder to look up the relevant Linear issues) is friction.

**Recommendation:** Use a `Sheet` (slide-in panel, side="right", width 520px) instead:
- Founder can see the Mission Control canvas behind the sheet
- The sheet stays open while the founder reviews the relevant bet node
- Dismissing with Escape → snooze (not reject)

---

## LENS 6 — Missing Surfaces & Blindspots

### F6.1 🟡 RISK — No error state for Linear MCP timeout

**Finding:** When `scan_linear_signals` tool call fails because Linear MCP is unavailable or returns a 429 rate limit, the plan shows no error state. The `BetNode` would stay in `agent_running: true` state forever (ghost spinner).

**Fix required:**
1. Backend: Governor must detect `TOOL_CALL_ERROR` events and emit a `STATE_DELTA` setting `agent_running: false` and `scan_error: true` for the affected bet
2. Frontend: `BetNode` renders an error indicator when `scan_error === true`:
```tsx
const status = data.scan_error ? "error" : (data.agent_running ? "loading" : healthToStatus(health_score))
```
3. Add to toast system:
```typescript
agentToasts.linearScanFailed = (betName: string) =>
  toast.error(`Linear scan failed for "${betName}"`, {
    description: "Check Linear connection in settings",
  })
```

---

### F6.2 🟡 RISK — No empty state for zero bets (new workspace)

**Finding:** The plan only specifies "No pending interventions — all bets healthy." but not the zero-bet state. A new workspace with no bets renders an empty React Flow canvas — confusing and unguided.

**Fix required:** Add to `MissionControl.tsx`:
```tsx
{nodes.length === 0 && !isLoading && (
  <div className="absolute inset-0 flex flex-col items-center justify-center">
    <p className="text-muted-foreground text-sm">No bets declared yet.</p>
    <Button
      size="sm"
      className="mt-3"
      onClick={() => router.push(`/workspace/${workspaceId}/bets/declare`)}
    >
      Declare your first bet
    </Button>
  </div>
)}
```

---

### F6.3 🟡 RISK — Bet Declaration flow (Detect/Draft/Confirm) has no implementation code

**Finding:** The folder structure includes `detect/`, `draft/`, `confirm/` routes and components (`DetectStep.tsx`, `DraftStep.tsx`, `ConfirmStep.tsx`) but `frontend-integration.md` contains no implementation for any of these. They represent the primary value-creation surface (where bets enter the system).

**Action for Claude Code:** Treat these as a Phase 2 implementation task. For Phase 1, create stubbed placeholder pages at each route that render "Coming soon" with the correct layout. Do NOT skip the routing scaffolding — the nav links must work.

---

### F6.4 🟡 RISK — Evolution Log has no implementation

**Finding:** `/evolution-log` is referenced in the page structure as showing `HeuristicVersion` entries (the AutoResearch loop output), but has no component code in the plan.

**Action for Claude Code:** Stub this route for Phase 1. Phase 2: implement a Table + Accordion (already specified in the component selection map).

---

### F6.5 🟢 IMPROVEMENT — Add pipeline observability to `AgentActivityNode`

**Finding:** The plan shows `AgentActivityNode` on the canvas when the agent is running, but doesn't specify what it shows. Per the `plan-then-execute` pattern from agentic-patterns.com, users should see what stage the agent is in.

**Recommendation:** `AgentActivityNode` should display the current pipeline stage using `ActivityMessage` events:
```tsx
function AgentActivityNode({ data }: { data: { stage: string; bet_name: string } }) {
  const stageLabel = {
    signal_engine: "Scanning Linear...",
    product_brain: "Debating risk...",
    coordinator: "Selecting intervention...",
    governor: "Policy check...",
    executor: "Executing...",
  }[data.stage] ?? "Running..."
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-2 rounded-full bg-muted animate-pulse">
      <Spinner size="xs" />
      {stageLabel}
    </div>
  )
}
```

---

### F6.6 🟢 IMPROVEMENT — Onboarding first-run experience missing

**Finding:** `frontend-integration.md` has no mention of workspace onboarding. Backend architecture (`agent-architecture.md`) references a `workspace_readiness_score` computed by the Signal Engine. If this score is below threshold (no bets, no Linear connection), the agent pipeline cannot run meaningfully.

**Recommendation:** Add to `workspace/[id]/page.tsx`:
```typescript
// Before rendering Mission Control, check workspace readiness
if (workspace.workspace_readiness_score < 0.5) {
  return <WorkspaceSetupCard
    missingItems={workspace.setup_checklist}
    onLinearConnect={() => openLinearOAuth()}
    onDeclareFirstBet={() => router.push(`/workspace/${id}/bets/declare`)}
  />
}
```

---

### F6.7 🟢 IMPROVEMENT — Keyboard shortcut for power users

**Finding:** The plan mentions a `Command` dialog for quick actions but provides no implementation. For production use by busy founders who scan the inbox daily, keyboard shortcuts dramatically increase adoption.

**Recommendation:** Implement a global `useHotkeys` handler:
```typescript
useHotkeys("mod+shift+i", () => setInboxOpen(o => !o))  // Open/close inbox
useHotkeys("a", () => pendingInterventions[0] && acceptFocused())  // Accept focused
useHotkeys("r", () => pendingInterventions[0] && rejectFocused())  // Reject focused
useHotkeys("s", () => pendingInterventions[0] && snoozeFocused())  // Snooze
```
Show hotkey hints in the UI (small grey labels on buttons).

---

## Implementation Order for Claude Code

Implement in this exact sequence to avoid circular dependencies:

```
Phase 1a — Backend endpoint (prerequisite for all frontend work)
  1. Create backend/app/main.py with FastAPI + CopilotKit ADK adapter
  2. Test: curl http://localhost:8000/copilotkit → AG-UI SSE stream

Phase 1b — Foundation
  3. frontend/ scaffold: Next.js 14 App Router, shadcn init, React Flow, @copilotkit/react-core
  4. layout.tsx: CopilotKit provider with agent="aegis_pipeline"
  5. lib/state-delta.ts: applyStateDelta using fast-json-patch (immutable)
  6. lib/risk-colors.ts: riskTypeToColor (no destructive variants)

Phase 1c — State hooks (no UI yet)
  7. hooks/useWorkspaceState.ts (React Query, staleTime: Infinity)
  8. hooks/useMissionControlSync.ts (CoAgent → React Flow, STATE_DELTA handler)
  9. hooks/useCoordinatorAgent.ts (useCoAgent targeting "aegis_pipeline")
 10. hooks/useInterventionInbox.ts (React Query, invalidated by STATE_DELTA)
 11. hooks/useInterventionApproval.ts (useCopilotAction renderAndWaitForResponse)
 12. hooks/useJulesPlanApproval.ts (same pattern, no useInterrupt)

Phase 1d — Mission Control canvas
 13. components/mission-control/NodeErrorBoundary.tsx
 14. components/mission-control/BetNode.tsx (no destructive badges)
 15. components/mission-control/RiskEdge.tsx
 16. components/mission-control/AgentActivityNode.tsx (with pipeline stage labels)
 17. components/mission-control/MissionControl.tsx (ReactFlow + error boundary + empty state)

Phase 1e — Intervention surfaces
 18. components/shared/RiskTypeBadge.tsx (warning/secondary/outline only)
 19. components/intervention/InterventionApprovalCard.tsx (skeleton → active state)
 20. components/intervention/InboxInterventionCard.tsx
 21. components/intervention/SuppressionLog.tsx
 22. components/intervention/InterventionInbox.tsx (Sheet, with localStorage snooze)
 23. components/shared/agentToasts.ts (include linear scan failed toast)

Phase 1f — Routes
 24. workspace/[id]/page.tsx (readiness check → Mission Control or setup card)
 25. workspace/[id]/bets/declare/page.tsx (STUB — "Coming soon")
 26. workspace/[id]/evolution-log/page.tsx (STUB — "Coming soon")
```

---

## Testing Requirements (Phase 1)

| Test | Method | Pass condition |
|------|--------|----------------|
| AG-UI endpoint | `curl -N http://localhost:8000/copilotkit -H "Accept: text/event-stream"` | Emits `event: RUN_STARTED` |
| State sync | Trigger agent run → watch React Flow node update health_score | Node updates within 500ms of STATE_DELTA |
| HITL approval | Trigger `propose_intervention` tool call → approve in UI | Agent resumes, executor writes to Linear |
| Disconnection | Kill backend → reconnect → state consistent | No ghost agents, correct health scores |
| Zero bet state | Load workspace with no bets | Empty state with CTA shown |
| Error state | Disconnect Linear → trigger scan | Scan error indicator on BetNode |

---

## What NOT to Build in Phase 1

- No chatbot UI (`CopilotChat`, `CopilotSidebar`) — architecture spec is explicit
- No `RiskClusterNode` implementation (placeholder only)
- No Bet Declaration multi-step form (stub + routing only)
- No Evolution Log table (stub + routing only)
- No mobile-responsive canvas (1280px+ minimum)
- No Jules GitHub integration UI until Jules API is confirmed available

---

## Version Pins (use exact versions, no caret ranges)

```json
{
  "@copilotkit/react-core": "1.3.x",
  "@copilotkit/react-ui": "1.3.x",
  "@ag-ui/client": "0.x.x",
  "@ag-ui/core": "0.x.x",
  "@xyflow/react": "12.x.x",
  "fast-json-patch": "3.1.x",
  "@tanstack/react-query": "5.x.x",
  "react-hotkeys-hook": "4.x.x",
  "sonner": "1.x.x"
}
```

**Before installing:** Run `npx copilotkit@latest create -f adk` in a throwaway directory to confirm the exact versions the CopilotKit-ADK scaffold uses. Pin to those.

---

*Generated: 2026-04-06 | Reviewer: Antigravity | Baseline: ag-ui-docs.txt + adk.dev/integrations/ag-ui + agentic-patterns.com*
