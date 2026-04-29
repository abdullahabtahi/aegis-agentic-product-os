# Requirements — Control Level Persistence

## Behavioral Requirements

### R1 — Persisted on Every adjust_autonomy Call
Every successful `adjust_autonomy()` tool invocation writes `control_level` to the `Workspace` row in the database via `upsert_workspace(workspace_id, control_level)`.

### R2 — Survives Backend Restart
After a backend process restart, the last-set `control_level` is retrievable from the database. It is not reset to `"draft_only"` unless `adjust_autonomy("draft_only")` was explicitly called.

### R3 — Survives Page Reload
After a full browser page reload (which clears AG-UI state), the Settings page reads `control_level` from `GET /workspace/{workspace_id}` and displays the correct active card.

### R4 — Upsert Is Idempotent
Calling `upsert_workspace("ws-test", "require_approval")` twice produces the same result as calling it once. No duplicate rows, no database error.

### R5 — Workspace Not Found Returns Default
`GET /workspace/{workspace_id}` returns `{ "id": workspace_id, "control_level": "draft_only" }` when no workspace row exists yet.

### R6 — Session State Updated Before DB Write
`tool_context.state["control_level"]` is updated first so AG-UI state is immediately consistent. The database write happens after, as a durable side effect. If the DB write fails, session state is still correct for the current session.

### R7 — Works in Local Dev (SQLite)
`upsert_workspace` works on SQLite for local development. PostgreSQL `ON CONFLICT DO UPDATE` syntax must not be used on SQLite directly.

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| `workspace_id` not in session state | Falls back to `"default_workspace"` as workspace ID for the upsert |
| DB write fails (transient error) | Error is logged; session state still updated; `adjust_autonomy()` returns `status: "ok"` (best-effort persist) |
| Same level set twice | Upsert is idempotent; no error; no duplicate row |
| `WorkspaceModel` row does not exist | Upsert creates it; no foreign key violation |
| `GET /workspace/{id}` called for unknown ID | Returns `{ "id": id, "control_level": "draft_only" }` — safe default |
