# Governance — Aegis Coding Rules

**Ratified:** April 2026  
**Status:** Active — all specs and implementations must comply

These rules were extracted from the April 2026 comprehensive audit. Each rule has a rationale tied to a specific failure mode found in the codebase.

---

## Immutability

- NEVER mutate shared state in place. `list.append()`, `dict[key] = value` on module-level objects are banned.
- Use `asyncio.Lock` for any shared in-memory structure modified by concurrent requests.
- Return new copies; never modify arguments.

*Why: `inmemory_bets.append()` in `conversational.py` is a race condition under concurrent requests.*

---

## No Module-Level Singletons for ADK Agents

- ADK agents must be constructed via factory functions that return **fresh instances** on every call.
- Never assign `create_*_agent()` to a module-level variable and reuse it.
- The `App` object for playground/evals must also receive a fresh agent tree.

*Why: ADK's parent-check validation fires "already has a parent" errors when agent objects are reused across runs.*

---

## Authentication Required on All Write Endpoints

- Every endpoint that triggers a state change (approve, reject, create bet, set control level) must verify a bearer token via FastAPI `Depends`.
- Read endpoints serving non-public data also require auth.
- `DEBUG_*` and `/diag/*` endpoints must be gated by a `DEBUG_ENABLED` environment flag.

*Why: Unauthenticated `POST /interventions/{id}/approve` allowed any HTTP caller to trigger Linear writes.*

---

## CORS Must Be Explicit

- `allow_origins=["*"]` and `allow_credentials=True` must never appear together.
- `ALLOWED_ORIGINS` must be explicitly set in all non-local environments.
- Local dev may use `*` only when `AEGIS_LOCAL_DEV=true` and `allow_credentials=False`.
- See `spec/features/001-security-hardening/plan.md` Workstream B for the exact implementation pattern including the `AEGIS_LOCAL_DEV` gate.

*Why: Wildcard + credentials is a CORS protocol violation rejected by all modern browsers.*

---

## SQL Parameters Only — No f-strings in Queries

- All SQL values must be passed as named parameters to `text()`. Never interpolate with f-strings or `.format()`.
- Always check `result.rowcount` after UPDATE statements. Return `False`/404 when `rowcount == 0`.
- INSERT statements must include all non-nullable columns. Never rely on implicit defaults.

*Why: `update_workspace_control_level` INSERT silently failed due to missing NOT NULL columns. `update_intervention_status` returned 200 for phantom IDs.*

---

## Pipeline Error Handling

- `_run_sub_pipeline` must never return `{}` on failure. Return `{"pipeline_status": "error", "error": str(exc)}`.
- Every tool function must have an explicit return on all code paths. No implicit `None` returns where `.get()` will be called on the result.
- `pipeline_status` values emitted by the backend must exactly match the `PipelineStatus` union in `frontend/lib/types.ts`.

*Why: Silent `{}` return caused the frontend to report "pipeline complete" when the backend had crashed.*

---

## AG-UI State Deltas

- `applyStateDelta` must use `mutateDocument: true` inside Immer `produce`, or use a plain deep-clone approach without Immer.
- Never use `mutateDocument: false` inside an Immer producer — the returned document is discarded.

*Why: Every STATE_DELTA event was silently dropped, leaving pipeline stages permanently stale.*

---

## Single Workspace ID Source

- `useWorkspaceId()` is the only allowed source of workspace ID in frontend components.
- All React Query calls that depend on `workspaceId` must include `enabled: !!workspaceId && workspaceId !== FALLBACK`.
- No hardcoded workspace ID strings anywhere except the `FALLBACK` constant in `useWorkspaceId.ts`.

*Why: Three different workspace ID sources (`"default_workspace"`, `"ws-agentic-os"`, AG-UI state) caused pages to query different workspaces simultaneously.*

---

## Resource Lifecycle

- Every `httpx.AsyncClient` must be closed. Use `async with` or wire `close()` into FastAPI `lifespan`.
- Module-level constants that capture environment variables (e.g., `_JULES_API_KEY`) must read from `os.environ` at call time, not at import time.

---

## Constants and Types

- No duplicated constants across files. Shared labels, colors, and enums live in `lib/constants.ts` (frontend) or `app/constants.py` (backend).
- Pydantic model fields that have a constrained set of values must use `Literal` or `Enum`, not bare `str`.
- All public functions must have return type annotations. No bare `-> None` omissions on async tools.

---

## Secrets

- No credentials, API keys, or tokens in source files. `.env` is for local dev only and must never be committed.
- Production secrets are injected via GCP Secret Manager using Cloud Run `--set-secrets`.
- Any `.env` file containing real credentials must be rotated immediately upon discovery.
