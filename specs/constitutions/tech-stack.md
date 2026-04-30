# Tech Stack — Aegis Agentic Product OS

**Ratified:** April 2026

---

## Stack

| Layer | Technology | Locked Decision |
|---|---|---|
| Backend runtime | Python 3.10+, FastAPI | Yes |
| Agent framework | Google ADK (SequentialAgent) | Yes |
| LLM | Vertex AI — `gemini-3-flash-preview` (workers), `gemini-3-pro-preview` (synthesis) | Yes — no other model families |
| Frontend | Next.js 16, React 19, TypeScript 5 | Yes |
| UI kit | Tailwind v4, shadcn/ui, glassmorphic design tokens | Yes |
| State (frontend) | Zustand + Immer (local), CopilotKit AG-UI (agent state) | Yes |
| Data fetching | React Query (TanStack Query v5) | Yes |
| Chat protocol | CopilotKit AG-UI — `useCopilotChatInternal` with `sendMessage` | Yes — not `useCopilotChat` |
| Database | Cloud SQL PostgreSQL 16 (prod), SQLite+aiosqlite (local dev) | Yes |
| ORM pattern | SQLAlchemy 2 async with raw `text()` calls | Yes — no ORM query builder |
| Package mgmt | `uv` (backend), `npm` (frontend) | Yes |
| Type checker | `ty` (Astral) — not mypy | Yes |
| Linter | `ruff` (backend), ESLint (frontend) | Yes |
| Testing | pytest + ADK evals (backend), Playwright (frontend) | Yes |
| Secrets | GCP Secret Manager (prod), `.env` file (local only, never committed) | Yes |
| Deployment | Cloud Run (backend + frontend), Docker multi-stage | Yes |

---

## Agent Pipeline

```
Signal Engine → Product Brain → Coordinator → Governor → Executor
```

| Agent | Role | Model |
|---|---|---|
| Signal Engine | Fetches Linear issues, detects risk signals | gemini-3-flash-preview |
| Product Brain | Cynic/Optimist debate, synthesizes risk assessment | gemini-3-pro-preview |
| Coordinator | Maps risk to intervention type | gemini-3-flash-preview |
| Governor | 8 deterministic policy checks — NO LLM | Pure Python |
| Executor | Executes approved action against Linear | gemini-3-flash-preview |

**Rule:** Governor never calls an LLM. All 8 checks are deterministic Python.

---

## Key Hooks (frontend)

| Hook | Purpose | Note |
|---|---|---|
| `useWorkspaceId()` | Single source of workspace ID | Uses `\|\|` not `??` — catches empty string |
| `useCoAgent<AegisPipelineState>({ name: "aegis" })` | AG-UI state sync | Do not read agent state any other way |
| `useCopilotChatInternal` | Send messages to agent | Not `useCopilotChat` — internal API, documented in `useChatController.ts` |
| `useQuery` | All data fetching | Must include `enabled` guard when depending on `workspaceId` |

---

## Database Patterns

```python
# CORRECT — parameterized, session-scoped
async with get_session() as session:
    result = await session.execute(text("SELECT ... WHERE id = :id"), {"id": workspace_id})

# WRONG — f-string interpolation
await session.execute(text(f"SELECT ... WHERE id = '{workspace_id}'"))

# CORRECT — check rowcount after UPDATE
result = await session.execute(text("UPDATE ... WHERE id = :id"), {...})
if result.rowcount == 0:
    return False  # caller converts to 404
```

---

## Pipeline Status Contract

Backend must emit exactly these values into AG-UI state. Frontend `PipelineStatus` union must match exactly.

| Backend emits | Meaning | Frontend renders |
|---|---|---|
| `"scanning"` | Pipeline started | Progress spinner |
| `"complete"` | All stages done | Risk card |
| `"error"` | Sub-pipeline failed | Error state |
| `"awaiting_approval"` | Governor halted | Approval card |
| `"approved"` | Founder approved | Executing state |

---

## Environment Variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `GOOGLE_CLOUD_PROJECT` | Yes (prod) | — | GCP project ID |
| `GOOGLE_CLOUD_LOCATION` | Yes | `global` | Must be `global`, not `us-central1` |
| `GOOGLE_GENAI_USE_VERTEXAI` | Yes | `True` | |
| `DATABASE_URL` | Yes | `sqlite+aiosqlite:///aegis_local.db` | Local dev uses SQLite |
| `ALLOWED_ORIGINS` | Yes (prod) | `*` (with warning) | Must be explicit in prod |
| `API_TOKEN` | Yes (prod) | — | Bearer token for all write endpoints |
| `DEBUG_ENABLED` | No | `false` | Gates `/debug/*` and `/diag/*` routes |
| `AEGIS_MOCK_LINEAR` | No | `false` | Uses MockLinearMCP when true |
| `BACKEND_URL` | Yes (prod frontend) | `http://localhost:8000/adk/v1/app` | Must be set; startup assertion required |
| `LINEAR_API_KEY` | No | — | Real Linear writes; omit for mock mode |
| `JULES_API_KEY` | No | — | Jules L3 actions |
