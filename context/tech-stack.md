# Tech Stack

## Full stack — all production, no stubs

| Component | Technology | Why |
|-----------|-----------|-----|
| Agent framework | Google ADK | Native Gemini + MCP support; structured agent lifecycle |
| LLM | Gemini 3 Flash / Pro preview | Flash for Execution Agent (speed); Pro for Product Brain + Coordinator (reasoning) |
| Linear integration | Linear MCP | Read issues/projects; bounded writes on approval |
| Product knowledge | Lenny MCP | Heuristics for risk classification; Tigers/Elephants framing |
| Jules integration | Jules API (v1alpha) | Code actions on accepted interventions; `requirePlanApproval: true` always |
| Backend API | FastAPI (Python) | Lightweight, async, ADK-compatible |
| Deploy | Cloud Run | Stateless, scalable, production-grade |
| Frontend framework | React + TypeScript | CopilotKit + AG-UI require React |
| UI components | shadcn/ui | Accessible, composable, production-ready components |
| Agent surfaces | CopilotKit + AG-UI protocol | `useCopilotAction`/`useInterrupt` for structured approvals; `useCoAgent` for state sync |
| Workflow visualization | React Flow | Mission control: bets as nodes, risk signals as animated edges |
| Client state | React Query + AG-UI events | React Query for base state; AG-UI `StateDeltaEvent` for live agent updates |
| Primary DB | AlloyDB (PostgreSQL) | Relational; all entities from data-schema.ts; vector extension for semantic search |
| Agent memory | Vertex Memory Bank | Long-term bet context, intervention history, product heuristics |
| Semantic search | AlloyDB AI (pgvector) | Similarity search on evidence, heuristics, past risk signals |
| Semantic caching | Vertex context caching | Latency + cost reduction for repeated Lenny MCP + strategy doc reads |
| AutoResearch | Custom ADK eval loop | `adk eval` on golden traces; `HeuristicVersion` mutations tracked in AlloyDB |

## Frontend architecture

See `frontend-integration.md` for full component patterns, hooks, and state management.

```
frontend/
├── app/
│   ├── workspace/[id]/     # Mission Control (React Flow canvas)
│   ├── bets/declare/       # Detect/Draft/Confirm flow
│   └── evolution-log/      # Agent Evolution Log
├── components/
│   ├── ui/                 # shadcn/ui (auto-generated via shadcn MCP)
│   ├── mission-control/    # BetNode, RiskEdge, AgentActivityNode
│   ├── risk-signal/        # RiskSignalPanel (Sheet), RiskSignalCard
│   ├── intervention/       # InterventionApprovalCard, JulesPlanApprovalDialog
│   ├── bet-declaration/    # DetectStep, DraftStep, ConfirmStep
│   └── shared/             # RiskTypeBadge, ConfidencePill, EvidenceList
├── hooks/
│   ├── useCoordinatorAgent.ts      # useCoAgent wrapper
│   ├── useMissionControlSync.ts    # AG-UI → React Flow bridge
│   ├── useInterventionApproval.ts  # useCopilotAction + renderAndWaitForResponse
│   ├── useJulesPlanApproval.ts     # useInterrupt for Jules plan approval
│   └── useWorkspaceState.ts        # React Query + AG-UI delta sync
└── lib/
    ├── risk-colors.ts      # riskTypeToColor, healthToStatus
    ├── agent-toasts.ts     # Sonner toast patterns for all agent actions
    └── state-delta.ts      # applyStateDelta (immutable)
```

**AG-UI integration:** See `../../ag-ui-docs.txt` (grep only, do not auto-load).
Key events used: `TextMessageChunk`, `ToolCallStart`, `ToolCallEnd`,
`StateSnapshotEvent`, `StateDeltaEvent`.

## Backend architecture

```
backend/
├── agents/
│   ├── execution_agent.py     # LinearSignals producer
│   ├── product_brain_agent.py # Risk classifier + copy writer
│   └── coordinator_agent.py  # Synthesizer + intervention proposer
├── models/
│   └── schema.py              # Pydantic mirrors of data-schema.ts
├── tools/
│   ├── linear_tools.py        # Linear MCP wrappers + bounded write enforcement
│   ├── memory_tools.py        # Vertex Memory Bank read/write
│   └── alloydb_tools.py       # AlloyDB CRUD
├── api/
│   └── routes.py              # FastAPI endpoints
└── eval/
    └── golden_traces/         # ADK eval sets (adk eval format)
```

## Storage

### AlloyDB schema (maps to data-schema.ts)
Tables: `workspaces`, `bets`, `bet_snapshots`, `risk_signals`, `evidence`,
`interventions`, `outcomes`, `agent_traces`, `heuristic_versions`,
`bet_rejections`, `product_heuristics`

Key indexes:
- `bets(workspace_id, status)` — active bets per workspace
- `risk_signals(bet_id, status, detected_at)` — open signals per bet
- `interventions(bet_id, status)` — pending interventions
- `outcomes(bet_id, measured_at)` — health history

### Vertex Memory Bank 
Namespaces:
- `bet_context:{workspace_id}` — bet history summaries per workspace
- `intervention_memory:{workspace_id}` — past interventions + outcomes
- `product_heuristics` — Lenny/Tigers-Elephants knowledge base (shared)
- `strategy_docs:{workspace_id}` — embedded strategy doc chunks

## Environment variables
```
GOOGLE_CLOUD_PROJECT=
GOOGLE_CLOUD_LOCATION=global          # use global, not us-central1, for Gemini 3
ALLOYDB_CONNECTION_STRING=
LINEAR_MCP_TOKEN=
LENNY_MCP_TOKEN=
VERTEX_MEMORY_BANK_ID=                
```

## Local dev
```bash
# Install
uv sync

# Run ADK playground (interactive agent testing)
adk web backend/

# Run evals
adk eval backend/ backend/eval/golden_traces/

# Run API
uv run uvicorn backend.api.routes:app --reload

# Run frontend
cd frontend && npm run dev
```
