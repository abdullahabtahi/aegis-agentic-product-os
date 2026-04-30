# Plan — 003 Data Integrity

**Created:** April 2026

---

## Approach

Six independent fixes across backend SQL, frontend hooks, and a UI component. All are safe to implement in parallel after the workspace ID consolidation plan is agreed.

---

## Files to Change

### Fix 1 — `bet_id` filter in `/interventions` (`backend/app/main.py`, `backend/db/repository.py`)
- `main.py`: Add `bet_id: str | None = Query(None)` to `list_interventions` signature
- `repository.py` `list_interventions` SQL: add `AND (:bet_id IS NULL OR i.bet_id = :bet_id)` to WHERE clause
- Pass `bet_id` through from endpoint to repository function

### Fix 2 — `workspace_id` in SELECT (`backend/db/repository.py`)
- `list_interventions` SQL SELECT: add `i.workspace_id` to the selected columns
- Verify `Intervention` TypeScript interface `workspace_id: string` is non-optional

### Fix 3 — `update_intervention_status` rowcount check (`backend/db/repository.py`)
- After `session.execute(UPDATE ...)`: check `result.rowcount == 0` → return `False`
- `main.py` approve/reject endpoints: when repository returns `False` → raise `HTTPException(404)`
- Add 409 Conflict for already-resolved interventions (optional but clean)

### Fix 4 — `update_workspace_control_level` full INSERT (`backend/db/repository.py`)
- Inspect `migrations/` to get all non-nullable columns on `workspaces` table
- Update INSERT to include all non-nullable columns with sensible defaults (`""` for strings, `[]` for arrays, `now()` for timestamps)
- Use `ON CONFLICT (id) DO UPDATE SET control_level = EXCLUDED.control_level` (only update control_level, not other columns)
- Add `control_level` validation against `ControlLevel` set before DB write

### Fix 5 — Single workspace ID source (`frontend/hooks/`, multiple pages)
- `hooks/useAgentStateSync.ts`: remove `localState`, `handleStateDelta`, `handleStateSnapshot` dead code. Return `{ state: agentState, ... }` directly.
- `app/workspace/page.tsx:81`: replace hardcoded `"default_workspace"` with `useWorkspaceId()`
- All `useQuery` calls using `workspaceId`: add `enabled: !!workspaceId && workspaceId !== FALLBACK`
- Consolidate `"ws-agentic-os"` fallback in `useWorkspaceState` to match `useWorkspaceId` fallback (`"default_workspace"`)

### Fix 6 — `inmemory_bets` concurrency (`backend/app/bet_store.py` or `conversational.py`)
- Add `_bets_lock = asyncio.Lock()` module-level
- Wrap all `inmemory_bets.append(bet)` calls in `async with _bets_lock`
- Wrap `list(inmemory_bets)` reads in lock for snapshot consistency

### Fix 7 — `BetDeclarationModal` reset (`frontend/components/bets/BetDeclarationModal.tsx`)
- In the `persisted === false` early return branch: call `resetForm()` before `return`

### Fix 8 — `WorkspaceMeta.control_level` type (`frontend/lib/api.ts`)
- Change `control_level: string` → `control_level: ControlLevel`
- Import `ControlLevel` from `@/lib/types`
- Remove `as ControlLevel` cast in `settings/page.tsx`

---

## Design Decisions

- **`bet_id IS NULL OR ...` in SQL**: preserves backward compatibility — callers without `bet_id` still get all interventions.
- **`useAgentStateSync` dead code removal**: `handleStateDelta`/`handleStateSnapshot` were never called. Removing them simplifies the hook to a thin wrapper around `useCoAgent`, which is the correct abstraction.
- **Lock for `inmemory_bets`**: asyncio lock is sufficient for single-process local dev. When DB is wired, this code path is eliminated entirely.
