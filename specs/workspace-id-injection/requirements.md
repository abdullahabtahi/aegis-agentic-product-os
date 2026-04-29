# Requirements — Workspace ID Injection

## Behavioral Requirements

### R1 — No Hardcoded Workspace ID
No frontend file may contain the string literal `"default_workspace"` as a constant assignment. The string may only appear as the fallback value inside `useWorkspaceId`.

### R2 — Reads from AG-UI Session State
`workspace_id` is sourced from `useCoAgent<AegisPipelineState>({ name: "aegis" }).state.workspace_id`.

### R3 — Safe Fallback
When `state.workspace_id` is `undefined` or `null` (no session established yet), the hook returns `"default_workspace"`. The UI must not crash or show an error in this case.

### R4 — Reactive Update
If the user declares a bet mid-session, the workspace_id updates automatically because `useCoAgent` state is reactive. Pages re-fetch their data with the new workspace_id without a full page reload.

### R5 — Three Pages Patched
`app/workspace/directions/page.tsx`, `app/workspace/directions/[id]/page.tsx`, and `app/workspace/mission-control/page.tsx` all use `useWorkspaceId()` instead of a local constant.

### R6 — No New Backend Endpoint
This feature requires zero backend changes. No new API routes, no new session fields, no database migrations.

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| Page loads before any bet declared | `useWorkspaceId()` returns `"default_workspace"`; API calls use fallback |
| User declares a bet in chat | `workspace_id` in AG-UI state updates; React Query refetches with new ID |
| User refreshes page after declaring a bet | Session is restored from SQLite; `workspace_id` re-hydrates into AG-UI state |
| `useCoAgent` state is `null` | Hook returns `"default_workspace"` — no runtime error |
| Two tabs open with different sessions | Each tab has its own CopilotKit session; workspace IDs are independent |
