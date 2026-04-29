# Tech Stack

## Backend

**Python 3.10+ · Google ADK · FastAPI · SQLAlchemy 2 async**

- Google ADK: agent orchestration, `LlmAgent`, `SequentialAgent`, `BaseAgent`, `ToolContext`, evals
- FastAPI: REST API + AG-UI SSE endpoint (`/adk/v1/app`)
- SQLAlchemy 2 async: `AsyncSession`, `select`, `upsert` via `on_conflict_do_update`
- Package management: `uv` (never pip directly)
- Type checker: `ty` (Astral) — not mypy
- Linter/formatter: `ruff`

### Agent Pipeline — Sequential, 5 Stages

```
SequentialAgent("aegis_pipeline"):
  1. SignalEngine     → deterministic Python, no LLM
  2. ProductBrain     → debate: Flash(Cynic) + Flash(Optimist) → Pro(Synthesis)
  3. Coordinator      → LlmAgent, proposes intervention
  4. Governor         → deterministic 8-check policy, no LLM
  5. Executor         → runs Linear action if approved
```

Entry: `backend/app/agent.py::create_conversational_agent()`.
Pipeline is triggered via `run_pipeline_scan` tool on the conversational agent.
Sub-pipeline (stages 2–5) runs via `_run_sub_pipeline()` in `conversational.py` — fresh `Runner` + `InMemorySessionService` per scan.

### State Flow

All data passes through ADK session state (`tool_context.state`). Keys:

| Key | Written by | Read by |
|---|---|---|
| `workspace_id` | `declare_bet`, first-message injection | all pipeline stages |
| `bet` | `declare_bet` | Signal Engine |
| `bet_snapshot` | Signal Engine | Product Brain |
| `linear_signals` | Signal Engine | Product Brain |
| `risk_signal_draft` | Product Brain | Coordinator, frontend |
| `intervention_proposal` | Coordinator | Governor |
| `governor_decision` | Governor | Executor, frontend |
| `awaiting_approval_intervention` | Governor | frontend Inbox |
| `pipeline_status` | Governor, Executor | frontend |
| `stages` | `_emit_stage()` | PipelineProgressCard |
| `control_level` | `adjust_autonomy` | Governor (policy check 7) |

### Data Format — risk_signal_draft

Product Brain writes `risk_signal_draft` as a JSON string (serialized `RiskSignal`):

```json
{
  "risk_type": "strategy_unclear",
  "severity": "high",
  "confidence": 0.72,
  "headline": "Bet lacks testable hypothesis",
  "explanation": "...",
  "evidence_summary": "...",
  "linear_evidence": {},
  "product_principle_refs": []
}
```

Valid `risk_type` values: `strategy_unclear | alignment_issue | execution_issue | placebo_productivity`.

### Database

- **Engine:** Cloud SQL PostgreSQL 16 g1-small (local: SQLite via `DATABASE_URL` env var)
- **Sessions:** SQLite (`aegis_sessions.db`) via `DatabaseSessionService` — ADK session state
- **Migrations:** Alembic (`backend/migrations/`)
- **Repository:** `backend/db/repository.py` — async functions: `get_recent_interventions_for_workspace`, `upsert_workspace`, `create_bet`, `list_bets`

### Linear Integration

- MockLinearMCP: always used during eval (`AEGIS_MOCK_LINEAR=true`)
- RealLinearMCP: direct `httpx` GraphQL query in `conversational.py` when `AEGIS_MOCK_LINEAR=false`
- All Linear writes gated by `LinearAction` interface — no free-form API calls

---

## Frontend

**Next.js 16 · React 19 · TypeScript 5 · Tailwind v4**

> **Breaking changes warning:** This Next.js version differs from training data. Read `node_modules/next/dist/docs/` before writing component code. The `use(params)` pattern in client pages requires a Suspense boundary.

- CopilotKit: `useCoAgent`, `useCopilotChatInternal` — AG-UI session state sync
- AG-UI: SSE stream from backend via `HttpAgent` in `app/api/copilotkit/route.ts`
- State: Zustand + immer for local UI state; React Query for REST polling
- Styling: Tailwind v4, CSS custom properties in `linear-theme.css`, glassmorphic design system

### AG-UI → Frontend State

CopilotKit exposes backend session state as `state` from `useCoAgent<AegisPipelineState>({ name: "aegis" })`.

Fields available on the frontend:
```typescript
interface AegisPipelineState {
  bet?: Bet;
  workspace_id?: string;
  risk_signal_draft?: string;          // JSON string — parse before use
  intervention_proposal?: { ... };
  governor_decision?: GovernorDecision;
  awaiting_approval_intervention?: Intervention;
  pipeline_status?: PipelineStatus;
  stages?: PipelineStage[];
  control_level?: string;              // "draft_only" | "require_approval" | "autonomous_low_risk"
}
```

### REST API (non-streaming)

All REST calls go through `frontend/lib/api.ts`. Base URL: `NEXT_PUBLIC_BACKEND_URL` (defaults `http://localhost:8000`).

Key endpoints:
| Endpoint | Method | Use |
|---|---|---|
| `/bets` | POST | Declare bet |
| `/bets?workspace_id=` | GET | List bets |
| `/interventions?workspace_id=` | GET | List interventions |
| `/interventions/{id}/approve` | POST | Approve |
| `/interventions/{id}/reject` | POST | Reject (body: `{ reason }`) |

### Design System

All visual tokens are CSS custom properties on `:root` in `linear-theme.css`. Never use magic hex values in component files.

```css
--bg-primary:       #0a0a0f   /* page background */
--bg-secondary:     #111118   /* card/panel background */
--border-subtle:    rgba(255,255,255,0.06)
--text-primary:     rgba(255,255,255,0.90)
--text-secondary:   rgba(255,255,255,0.50)
--accent-indigo:    #6366f1
--accent-violet:    #8b5cf6
```

Glassmorphic panels: `background: rgba(255,255,255,0.03); backdrop-filter: blur(12px); border: 1px solid var(--border-subtle)`.

Font: Inter. Grid: 8px. Corner radius: 8px (subtle), 12px (cards), 20px (chips).

### Key Hooks

| Hook | Location | Purpose |
|---|---|---|
| `useCoAgent` | CopilotKit | AG-UI session state |
| `useCopilotChatInternal` | CopilotKit | Chat messages |
| `useWorkspaceState` | `hooks/` | Active bet + workspace |
| `useInterventionInbox` | `hooks/` | Inbox with snooze/expiry |
| `useAgentStateSync` | `hooks/` | Syncs AG-UI state to Zustand |

### File Conventions

- Pages: `app/workspace/[feature]/page.tsx` — client components, Suspense boundaries for `use(params)`
- Components: `components/[domain]/ComponentName.tsx`
- Types: `lib/types.ts` — mirrors `context/data-schema.ts` exactly
- API calls: `lib/api.ts` — no inline `fetch` calls in components
- Constants: `lib/constants.ts` — `BACKEND_URL`, workspace defaults

---

## CI / Evals

- Tier-1 CI: `uv run pytest tests/unit -v` — no GCP required (runs on every PR)
- Tier-2 CI: `make eval-all` — requires GCP credentials (runs on main branch only)
- Eval format: `.evalset.json` only — 5 golden traces in `backend/tests/eval/evalsets/`
- Eval tool: `adk eval ./app <evalset>` — never pytest alone for agent behavior
- Gate: `tool_trajectory_avg_score ≥ 0.8` on all 5 traces before Phase 7 ship
