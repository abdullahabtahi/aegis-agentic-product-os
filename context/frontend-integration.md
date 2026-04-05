# Frontend Integration Guide

Production-grade integration of CopilotKit, AG-UI, React Flow, and shadcn/ui
for the Continuous Pre-mortem / Risk Radar.

## Architecture overview

```
┌──────────────────────────────────────────────────────────────┐
│  React App                                                   │
│                                                              │
│  ┌────────────────────┐   ┌──────────────────────────────┐  │
│  │  Mission Control   │   │  Side Panels / Modals        │  │
│  │  (React Flow)      │   │  (shadcn Sheet/Dialog)       │  │
│  │                    │   │                              │  │
│  │  BetNode ──────────┼──▶│  RiskSignalPanel             │  │
│  │  HealthEdge        │   │  InterventionCard            │  │
│  │  AgentActivityNode │   │  JulesPlanApproval           │  │
│  └────────┬───────────┘   └──────────────────────────────┘  │
│           │                                                  │
│  ┌────────▼───────────────────────────────────────────────┐  │
│  │  State Layer                                           │  │
│  │                                                        │  │
│  │  useCoAgent (CopilotKit)  ←──▶  AG-UI event stream    │  │
│  │  Coordinator state             StateSnapshot/Delta     │  │
│  │  React Flow node/edge state    ToolCall events         │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## Tool responsibilities

| Tool | Role in this product |
|------|---------------------|
| **React Flow** | Mission control canvas — bets as nodes, risk signals as edges/indicators, agent activity as animated nodes |
| **CopilotKit** | Agent state sync (`useCoAgent`), human-in-the-loop approvals (`useCopilotAction` + `useInterrupt`) |
| **AG-UI** | Streaming agent events to React Flow in real-time (`ToolCallStart/End`, `StateSnapshot/Delta`) |
| **shadcn/ui** | All UI components — cards, badges, progress, dialogs, toasts |

---

## React Flow: Mission Control Canvas

### Node types

```typescript
// Three custom node types registered in nodeTypes
const nodeTypes = {
  bet: BetNode,
  agentActivity: AgentActivityNode,
  riskCluster: RiskClusterNode,
}

// BetNode — the primary unit of the canvas
interface BetNodeData {
  bet: Bet
  health_score: number            // 0–100, drives NodeStatusIndicator
  open_risk_count: number
  pending_intervention_count: number
  agent_running: boolean          // true while Execution/ProductBrain agents scan it
}

// Maps health_score → NodeStatusIndicator status
function healthToStatus(score: number): "success" | "warning" | "error" | "loading" {
  if (score >= 80) return "success"
  if (score >= 50) return "warning"
  return "error"
}
```

```tsx
// BetNode.tsx — wraps NodeStatusIndicator (from React Flow UI)
import { NodeStatusIndicator } from "@/components/node-status-indicator"
import { BaseNode, BaseNodeContent } from "@/components/base-node"
import { Handle, Position } from "@xyflow/react"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"

export function BetNode({ data }: NodeProps<BetNodeData>) {
  const { bet, health_score, open_risk_count, agent_running } = data
  const status = agent_running ? "loading" : healthToStatus(health_score)

  return (
    <NodeStatusIndicator status={status} variant="border">
      <BaseNode onClick={() => openRiskPanel(bet.id)}>
        <BaseNodeContent>
          <div className="space-y-2 p-3 min-w-[200px]">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm truncate">{bet.name}</span>
              {open_risk_count > 0 && (
                <Badge variant="destructive" className="ml-2 shrink-0">
                  {open_risk_count} risks
                </Badge>
              )}
            </div>

            <Progress value={health_score} className="h-1.5" />

            <div className="text-xs text-muted-foreground">
              {bet.target_segment} · {formatTimeHorizon(bet.time_horizon)}
            </div>
          </div>
        </BaseNodeContent>
      </BaseNode>
    </NodeStatusIndicator>
  )
}
```

### Real-time node updates from AG-UI events

```typescript
// useMissionControlSync.ts
// Subscribes to AG-UI StateSnapshot/Delta events and updates React Flow nodes

import { useNodesState, useEdgesState } from "@xyflow/react"

export function useMissionControlSync(workspaceId: string) {
  const [nodes, setNodes, onNodesChange] = useNodesState<BetNodeData>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  // AG-UI state sync — StateSnapshotEvent gives full workspace state
  // StateDeltaEvent gives incremental health_score updates per bet
  useAgentStateSync({
    onSnapshot: (snapshot: WorkspaceAgentState) => {
      setNodes(snapshot.bets.map(betToNode))
      setEdges(snapshot.risk_signals.map(riskToEdge))
    },
    onDelta: (delta: AgentStateDelta) => {
      if (delta.path.startsWith("/bets/")) {
        const betId = delta.path.split("/")[2]
        setNodes(nds => nds.map(n =>
          n.id === betId
            ? { ...n, data: { ...n.data, ...delta.value } }  // immutable update
            : n
        ))
      }
    },
  })

  // ToolCallStart → show AgentActivityNode on the canvas
  useAgentToolCallEvents({
    onToolCallStart: (event) => {
      if (event.toolName === "scan_linear_signals") {
        setNodes(nds => nds.map(n =>
          n.id === event.betId
            ? { ...n, data: { ...n.data, agent_running: true } }
            : n
        ))
      }
    },
    onToolCallEnd: (event) => {
      setNodes(nds => nds.map(n =>
        n.id === event.betId
          ? { ...n, data: { ...n.data, agent_running: false } }
          : n
      ))
    },
  })

  return { nodes, edges, onNodesChange, onEdgesChange }
}
```

### Animated risk signal edges

```tsx
// RiskEdge.tsx — animated edge from source bet to risk indicator node
// Uses AG-UI ToolCall events to animate when a new risk is detected
import { BaseEdge, getBezierPath, EdgeProps } from "@xyflow/react"

export function RiskEdge({ id, sourceX, sourceY, targetX, targetY,
                            sourcePosition, targetPosition, data }: EdgeProps) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition,
                                     targetX, targetY, targetPosition })
  const isNew = data?.is_newly_detected   // true for first 3s after detection

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: riskTypeToColor(data?.risk_type),
        strokeWidth: 2,
        strokeDasharray: isNew ? "5,5" : "none",
        animation: isNew ? "dash 0.5s linear infinite" : "none",
      }}
    />
  )
}
```

---

## CopilotKit: Human-in-the-Loop Approvals

### Coordinator agent state sync

```typescript
// useCoordinatorAgent.ts — syncs Coordinator Agent state to React
import { useCoAgent } from "@copilotkit/react-core"
import type { CoordinatorAgentState } from "@/types/agents"

export function useCoordinatorAgent() {
  const { state, setState, running, start, stop } = useCoAgent<CoordinatorAgentState>({
    name: "coordinator_agent",
    initialState: {
      active_bet_id: null,
      current_risk_signal: null,
      pending_intervention: null,
      jules_session: null,
    },
  })

  // Expose typed helpers so components don't touch raw state
  return {
    pendingIntervention: state.pending_intervention,
    currentRiskSignal: state.current_risk_signal,
    julesSession: state.jules_session,
    agentRunning: running,
    // Founder accepts intervention → updates state → agent proceeds
    acceptIntervention: (note?: string) =>
      setState(s => ({
        ...s,
        pending_intervention: s.pending_intervention
          ? { ...s.pending_intervention, status: "accepted", founder_note: note }
          : null,
      })),
    rejectIntervention: (note?: string) =>
      setState(s => ({
        ...s,
        pending_intervention: s.pending_intervention
          ? { ...s.pending_intervention, status: "rejected", founder_note: note }
          : null,
      })),
    startScan: (betId: string) => {
      setState(s => ({ ...s, active_bet_id: betId }))
      start()
    },
  }
}
```

### Intervention approval — `renderAndWaitForResponse`

```typescript
// useInterventionApproval.ts — blocks agent until founder decides
import { useCopilotAction } from "@copilotkit/react-core"

export function useInterventionApproval() {
  useCopilotAction({
    name: "propose_intervention",
    available: "remote",
    description: "Coordinator proposes a corrective intervention for founder approval.",
    parameters: [
      { name: "intervention", type: "object", required: true },
      { name: "risk_signal",  type: "object", required: true },
    ],

    // Agent blocks here until founder responds
    renderAndWaitForResponse: ({ args, respond, status }) => {
      const intervention = args.intervention as Intervention
      const riskSignal = args.risk_signal as RiskSignal

      return (
        <InterventionApprovalCard
          intervention={intervention}
          riskSignal={riskSignal}
          status={status}
          onAccept={(note) => respond?.(JSON.stringify({ decision: "accepted", note }))}
          onReject={(note) => respond?.(JSON.stringify({ decision: "rejected", note }))}
          onDismiss={() => respond?.(JSON.stringify({ decision: "dismissed" }))}
        />
      )
    },
  })
}
```

### Jules plan approval — `useInterrupt`

```typescript
// useJulesPlanApproval.ts — fires when Jules has generated a plan
import { useInterrupt } from "@copilotkit/react-core/v2"

export function useJulesPlanApproval() {
  useInterrupt({
    render: ({ event, resolve }) => {
      const { jules_session, plan_steps } = event.value as {
        jules_session: JulesSession
        plan_steps: string[]
      }

      return (
        <JulesPlanApprovalDialog
          session={jules_session}
          planSteps={plan_steps}
          onApprove={() => resolve({ approved: true })}
          onReject={(reason) => resolve({ approved: false, reason })}
        />
      )
    },
  })
}
```

---

## Intervention Inbox

The Intervention Inbox is the operational center of Aegis — a persistent side panel listing
all pending interventions across bets, ordered by severity + recency. It replaces the pattern
of surfacing one card at a time, giving founders a queue they can work through on their terms.

```
┌─────────────────────────────────────────────────────────┐
│  Intervention Inbox                          [2 pending] │
│─────────────────────────────────────────────────────────│
│  ● Execution Risk — Mobile Onboarding Bet               │
│    Add hypothesis to 3 rolled-over issues      [Accept] │
│    Confidence: 78%              [Edit]  [Reject] [Snooze]│
│─────────────────────────────────────────────────────────│
│  ● Strategy Unclear — Retention Experiment              │
│    Draft success metric definition             [Accept] │
│    Confidence: 71%              [Edit]  [Reject] [Snooze]│
│─────────────────────────────────────────────────────────│
│  ▸ Suppressed (3)  — click to expand                    │
└─────────────────────────────────────────────────────────┘
```

```typescript
// useInterventionInbox.ts — fetches all pending interventions across bets
import { useQuery } from "@tanstack/react-query"

export function useInterventionInbox(workspaceId: string) {
  const pendingQuery = useQuery({
    queryKey: ["interventions", workspaceId, "pending"],
    queryFn: () => fetchInterventions(workspaceId, { status: "pending" }),
    staleTime: 10_000,
  })

  const suppressedQuery = useQuery({
    queryKey: ["policy-denied", workspaceId],
    queryFn: () => fetchPolicyDeniedEvents(workspaceId, { limit: 10 }),
    staleTime: 30_000,
  })

  return {
    pending: pendingQuery.data ?? [],
    suppressed: suppressedQuery.data ?? [],
    isLoading: pendingQuery.isLoading,
    pendingCount: pendingQuery.data?.length ?? 0,
  }
}
```

```tsx
// InterventionInbox.tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

export function InterventionInbox({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { pending, suppressed, pendingCount } = useInterventionInbox(workspaceId)
  const { acceptIntervention, rejectIntervention } = useCoordinatorAgent()
  const [snoozed, setSnoozed] = useState<Set<string>>(new Set())

  const visible = pending.filter(i => !snoozed.has(i.id))

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Intervention Inbox
            {pendingCount > 0 && (
              <Badge variant="destructive">{pendingCount}</Badge>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {visible.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No pending interventions — all bets healthy.
            </p>
          )}

          {visible.map(intervention => (
            <InboxInterventionCard
              key={intervention.id}
              intervention={intervention}
              onAccept={(note) => acceptIntervention(intervention.id, note)}
              onReject={(note) => rejectIntervention(intervention.id, note)}
              onSnooze={() => setSnoozed(s => new Set([...s, intervention.id]))}
            />
          ))}

          {/* Suppression Log — visible governance, builds trust */}
          {suppressed.length > 0 && (
            <SuppressionLog events={suppressed} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

```tsx
// InboxInterventionCard.tsx — compact approval card for queue context
export function InboxInterventionCard({
  intervention, onAccept, onReject, onSnooze,
}: InboxInterventionCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [note, setNote] = useState("")

  return (
    <Card className="border-l-4" style={{ borderLeftColor: riskTypeToColor(intervention.risk_type) }}>
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center gap-2">
          <ActionTypeBadge type={intervention.action_type} />
          <ConfidencePill confidence={intervention.confidence} />
        </div>
        <CardTitle className="text-sm font-medium mt-1">{intervention.title}</CardTitle>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 pb-2 text-xs text-muted-foreground">
          {intervention.rationale}
          {intervention.proposed_linear_action && (
            <LinearActionPreview action={intervention.proposed_linear_action} className="mt-2" />
          )}
          <Textarea
            placeholder="Optional note..."
            value={note}
            onChange={e => setNote(e.target.value)}
            className="mt-2 text-xs h-16"
          />
        </CardContent>
      )}

      <CardFooter className="pt-2 gap-2">
        <Button size="sm" className="flex-1" onClick={() => onAccept(note)}>Accept</Button>
        <Button size="sm" variant="outline" onClick={() => onReject(note)}>Reject</Button>
        <Button size="sm" variant="ghost" onClick={onSnooze}>Snooze</Button>
      </CardFooter>
    </Card>
  )
}
```

### Suppression Log — visible governance

Shows founders what the Governor quietly suppressed and why. This builds trust by demonstrating
restraint: the system isn't just alerting on everything.

```tsx
// SuppressionLog.tsx
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronDown } from "lucide-react"

const DENIAL_REASON_LABELS: Record<PolicyDeniedEvent["denial_reason"], string> = {
  confidence_below_floor: "Evidence too weak",
  duplicate_suppression:  "Similar action rejected recently",
  rate_cap:               "Too many interventions this week",
  jules_gate:             "GitHub not connected",
  reversibility_check:    "Flagged for extra review",
  acknowledged_risk:      "Already acknowledged by you",
}

export function SuppressionLog({ events }: { events: PolicyDeniedEvent[] }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground w-full py-2">
        <ChevronDown className="h-3 w-3" />
        Suppressed ({events.length}) — Aegis held back these interventions
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-2 pt-1">
          {events.map(event => (
            <div
              key={event.id}
              className="text-xs bg-muted/40 rounded px-3 py-2 text-muted-foreground"
            >
              <span className="font-medium text-foreground">
                {DENIAL_REASON_LABELS[event.denial_reason]}
              </span>
              <span className="mx-1">·</span>
              {formatRelativeTime(event.created_at)}
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
```

---

## AG-UI: Streaming Agent Events

### Event → UI mapping

| AG-UI Event | UI reaction |
|-------------|-------------|
| `ToolCallStart` (scan_linear_signals) | BetNode → `agent_running: true`, spinner on node |
| `ToolCallStart` (classify_risk) | Stream "Analyzing strategy alignment..." in RiskPanel |
| `ToolCallEnd` (classify_risk) | RiskSignalCard appears with streaming explanation |
| `TextMessageChunk` | Stream risk explanation text in RiskSignalCard |
| `StateSnapshotEvent` | Full React Flow canvas refresh from new workspace state |
| `StateDeltaEvent` | Surgical node update (health_score, open_risk_count) |
| `ToolCallStart` (write_linear_action) | Toast: "Writing to Linear..." |
| `ToolCallEnd` (write_linear_action) | Toast success: "Label added to [issue]" |

### AG-UI hook for tool call streaming

```typescript
// useAgentToolCallEvents.ts
import { useEffect } from "react"
import { EventType } from "@ag-ui/core"

export function useAgentToolCallEvents({
  onToolCallStart,
  onToolCallEnd,
}: {
  onToolCallStart: (e: { toolName: string; betId?: string }) => void
  onToolCallEnd:   (e: { toolName: string; betId?: string }) => void
}) {
  const { agentSubscriber } = useCopilotContext()

  useEffect(() => {
    const unsub = agentSubscriber.subscribe({
      onToolCallStartEvent: (e) => onToolCallStart({
        toolName: e.toolCallName,
        betId: e.parentMessageId,   // convention: parentMessageId = betId for scoped tools
      }),
      onToolCallEndEvent: (e) => onToolCallEnd({
        toolName: e.toolCallName,
        betId: e.parentMessageId,
      }),
    })
    return () => unsub()
  }, [agentSubscriber])
}
```

### Risk explanation streaming

```tsx
// RiskSignalCard.tsx — streams explanation text as agent writes it
// Uses TextMessageChunk events via CopilotKit's built-in streaming
import { useCoAgentStateRender } from "@copilotkit/react-core"

export function RiskSignalCard({ riskSignal }: { riskSignal: RiskSignal }) {
  // Render agent's streaming explanation as it arrives
  useCoAgentStateRender({
    name: "product_brain_agent",
    render: ({ state, status }) => {
      if (status === "inProgress" && state.streaming_explanation) {
        return (
          <div className="text-sm text-muted-foreground animate-pulse">
            {state.streaming_explanation}
          </div>
        )
      }
      return null
    },
  })

  return (
    <Card className="border-l-4" style={{ borderLeftColor: riskTypeToColor(riskSignal.risk_type) }}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <RiskTypeBadge type={riskSignal.risk_type} />
          <SeverityBadge severity={riskSignal.severity} />
          <ConfidencePill confidence={riskSignal.confidence} />
        </div>
        <CardTitle className="text-base mt-2">{riskSignal.headline}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm">{riskSignal.explanation}</p>
        <EvidenceList evidence={riskSignal.evidence} className="mt-3" />
        <ProductPrincipleRefs refs={riskSignal.product_principle_refs} className="mt-2" />
      </CardContent>
    </Card>
  )
}
```

---

## shadcn/ui: Component System

### Component selection map

| Product concept | shadcn component | Notes |
|----------------|-----------------|-------|
| Bet card (Detect/Draft/Confirm) | `Card` + `CardHeader` + `CardContent` | Three visual states per BetStatus |
| Risk type label | `Badge` variant by risk type | `destructive`=strategy, `warning`=alignment, `secondary`=execution, `outline`=placebo |
| Health score bar | `Progress` | Color via className based on score range |
| Confidence indicator | Custom `ConfidencePill` built on `Badge` | Shows % + muted if < 0.6 |
| Intervention Inbox | `Sheet` (side panel, persistent) | Named feature — approval queue for all pending interventions |
| Intervention approval card | `Card` inside Sheet | Not modal — keeps canvas visible |
| Jules plan approval | `Dialog` | Full focus — blocking decision |
| Agent activity feedback | `Sonner` toast | Non-blocking, with action buttons |
| Inline risk alert | `Alert` + `AlertDescription` | Within bet detail view |
| Quick action (accept/reject all) | `Command` inside `Dialog` | Power user flow |
| Bet declaration confirm step | `Card` + `AlertDialog` for "Not a bet" | Confirm requires AlertDialog |
| Agent evolution log | `Table` + `Badge` + `Accordion` | Each HeuristicVersion as accordion row |
| Suppression Log | `Collapsible` + `Table` | Shows PolicyDeniedEvents — builds trust by showing restraint |
| Replay / Simulation preview | `Card` + `Timeline` + `Badge` | Shown in bet declaration ConfirmStep |

### Core shared components

```tsx
// RiskTypeBadge.tsx
const RISK_TYPE_CONFIG = {
  strategy_unclear:     { label: "Strategy unclear",     variant: "destructive" },
  alignment_issue:      { label: "Alignment issue",      variant: "warning" },
  execution_issue:      { label: "Execution issue",      variant: "secondary" },
  placebo_productivity: { label: "Placebo productivity", variant: "outline" },
} as const

export function RiskTypeBadge({ type }: { type: RiskType }) {
  const config = RISK_TYPE_CONFIG[type]
  return <Badge variant={config.variant}>{config.label}</Badge>
}

// ConfidencePill.tsx — shows confidence, muted if uncertain
export function ConfidencePill({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100)
  return (
    <span className={cn(
      "text-xs px-1.5 py-0.5 rounded-full font-mono",
      confidence >= 0.7 ? "bg-muted text-foreground" : "bg-muted/50 text-muted-foreground"
    )}>
      {pct}% confident
    </span>
  )
}

// EvidenceList.tsx — citable evidence items
export function EvidenceList({ evidence, className }: { evidence: Evidence[], className?: string }) {
  return (
    <ul className={cn("space-y-1", className)}>
      {evidence.map((e, i) => (
        <li key={i} className="text-xs flex items-start gap-1.5">
          <span className="text-muted-foreground mt-0.5">·</span>
          <span>
            {e.description}
            {e.linear_refs.length > 0 && (
              <span className="ml-1 text-muted-foreground">
                ({e.linear_refs.length} issues)
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}
```

### Intervention approval card (non-chatbot surface)

```tsx
// InterventionApprovalCard.tsx
// Designed per product-principles.md: lost upside framing, one action, cite principle
export function InterventionApprovalCard({
  intervention, riskSignal, status, onAccept, onReject, onDismiss,
}: InterventionApprovalCardProps) {
  const [note, setNote] = useState("")

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ActionTypeBadge type={intervention.action_type} />
          <ConfidencePill confidence={intervention.confidence} />
        </div>
        <CardTitle className="text-base">{intervention.title}</CardTitle>
        <CardDescription>{intervention.rationale}</CardDescription>
      </CardHeader>

      {intervention.proposed_linear_action && (
        <CardContent className="pt-0">
          <LinearActionPreview action={intervention.proposed_linear_action} />
        </CardContent>
      )}

      {intervention.proposed_jules_session && (
        <CardContent className="pt-0">
          <JulesSessionPreview spec={intervention.proposed_jules_session} />
        </CardContent>
      )}

      <CardFooter className="flex gap-2 pt-4">
        <Button
          className="flex-1"
          onClick={() => onAccept(note)}
          disabled={status !== "executing"}
        >
          Accept
        </Button>
        <Button
          variant="outline"
          onClick={() => onReject(note)}
          disabled={status !== "executing"}
        >
          Reject
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDismiss}
          disabled={status !== "executing"}
        >
          <X className="h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  )
}
```

### Toast patterns for agent actions

```typescript
// agentToasts.ts — consistent feedback for all agent-initiated actions
import { toast } from "sonner"

export const agentToasts = {
  linearWriteStarted: () =>
    toast.loading("Writing to Linear..."),

  linearWriteSuccess: (action: LinearAction) =>
    toast.success(`Linear updated`, {
      description: action.add_comment
        ? "Comment added to issue"
        : action.add_label
        ? `Label "${action.add_label}" added`
        : "Issue created",
    }),

  julesPlanReady: (session: JulesSession, onReview: () => void) =>
    toast("Jules plan ready for review", {
      description: `${session.plan_summary?.slice(0, 80)}...`,
      action: { label: "Review plan", onClick: onReview },
      duration: Infinity,   // stay until explicitly dismissed
    }),

  julesPrCreated: (prUrl: string) =>
    toast.success("Pull request created", {
      description: "Jules has opened a PR for your review",
      action: { label: "Open PR", onClick: () => window.open(prUrl, "_blank") },
    }),

  riskResolved: (betName: string) =>
    toast.success(`Risk resolved on "${betName}"`),
}
```

---

## State management architecture

### Single source of truth pattern

```
AlloyDB (persisted)
    │
    ▼
FastAPI /api/workspace/{id}/state
    │
    ▼
React Query (client cache, polling every 30s OR websocket push)
    │
    ├──▶ React Flow nodes/edges  (via useMissionControlSync)
    └──▶ useCoAgent state        (via CopilotKit ↔ AG-UI stream)
```

```typescript
// useWorkspaceState.ts — React Query for base state, AG-UI for live agent updates
import { useQuery, useQueryClient } from "@tanstack/react-query"

export function useWorkspaceState(workspaceId: string) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: () => fetchWorkspaceState(workspaceId),
    staleTime: 30_000,
  })

  // AG-UI delta events update React Query cache surgically
  useAgentStateSync({
    onDelta: (delta) => {
      queryClient.setQueryData(
        ["workspace", workspaceId],
        (old: WorkspaceState) => applyStateDelta(old, delta)  // immutable apply
      )
    },
  })

  return query
}
```

---

## Page structure

```
frontend/
├── app/
│   ├── layout.tsx              # CopilotKit provider + shadcn Toaster
│   ├── page.tsx                # redirect to /workspace/{id}
│   └── workspace/
│       └── [id]/
│           ├── page.tsx        # Mission Control (React Flow canvas)
│           ├── bets/
│           │   └── declare/    # Detect/Draft/Confirm flow
│           └── evolution-log/  # Agent Evolution Log
├── components/
│   ├── ui/                     # shadcn/ui (auto-generated)
│   ├── mission-control/
│   │   ├── MissionControl.tsx  # ReactFlow canvas + provider
│   │   ├── BetNode.tsx
│   │   ├── RiskEdge.tsx
│   │   └── AgentActivityNode.tsx
│   ├── risk-signal/
│   │   ├── RiskSignalPanel.tsx # shadcn Sheet — per-bet risk detail
│   │   └── RiskSignalCard.tsx
│   ├── intervention/
│   │   ├── InterventionInbox.tsx          # persistent side panel (approval queue)
│   │   ├── InboxInterventionCard.tsx      # compact card within Inbox
│   │   ├── InterventionApprovalCard.tsx   # full-detail card (opened from Inbox)
│   │   ├── SuppressionLog.tsx             # PolicyDeniedEvents — visible governance
│   │   └── JulesPlanApprovalDialog.tsx
│   ├── bet-declaration/
│   │   ├── DetectStep.tsx
│   │   ├── DraftStep.tsx
│   │   ├── ConfirmStep.tsx                # includes Day1HealthReport + ReplayPreview
│   │   ├── Day1HealthReport.tsx           # instant health snapshot at confirmation
│   │   └── ReplayPreview.tsx              # simulation over last 14 days
│   └── shared/
│       ├── RiskTypeBadge.tsx
│       ├── ConfidencePill.tsx
│       ├── EvidenceList.tsx
│       └── ProductPrincipleRefs.tsx
├── hooks/
│   ├── useCoordinatorAgent.ts
│   ├── useMissionControlSync.ts
│   ├── useInterventionApproval.ts
│   ├── useInterventionInbox.ts            # pending + suppressed interventions
│   ├── useJulesPlanApproval.ts
│   ├── useAgentToolCallEvents.ts
│   └── useWorkspaceState.ts
└── lib/
    ├── risk-colors.ts          # riskTypeToColor, healthToStatus
    ├── agent-toasts.ts         # agentToasts
    └── state-delta.ts          # applyStateDelta (immutable)
```

---

## Key production requirements

1. **No chatbot UI anywhere.** CopilotChat is disabled. All agent interactions go through
   `useCopilotAction` + `renderAndWaitForResponse` or `useInterrupt`.

2. **Immutable state everywhere.** All `setNodes`, `setEdges`, `setState` calls produce
   new objects. Never mutate in place (see global coding-style rules).

3. **Error boundaries on React Flow canvas.** A crashed node renderer must not crash
   the whole canvas. Wrap `BetNode`, `RiskEdge`, `AgentActivityNode` in ErrorBoundary.

4. **React Query for base state, AG-UI for live updates.** Never poll the API for
   agent-driven changes. Use AG-UI `StateDeltaEvent` for surgical React Query cache updates.

5. **Accessibility.** All `Dialog`/`Sheet` components must include `DialogTitle`.
   Intervention cards must support keyboard navigation (Tab through Accept/Reject/Dismiss).
   Risk type colors must not be the only differentiator (use labels + icons too).

6. **Streaming UX.** The risk explanation in `RiskSignalCard` streams via
   `TextMessageChunk`. Never wait for the full explanation before showing the card.
   Show skeleton → stream in → complete.
