# Tasks — 003 Data Integrity

**Created:** April 2026  
**Convention:** [P] = can run in parallel with other [P] tasks.

---

## Phase 1 — Backend SQL Fixes

### TDD — Write tests first (RED)
- [ ] Write `tests/unit/test_interventions_filter.py`:
  - `test_bet_id_filter_returns_only_matching` — seed 3 interventions across 2 bets → query with bet_id=A → only 2 returned
  - `test_bet_id_absent_returns_all` — no bet_id param → all 3 returned
  - `test_bet_id_no_match_returns_empty` — valid bet_id with no interventions → `[]`
  - `test_workspace_id_in_response` — each intervention in response has `workspace_id` field
  - `test_approve_phantom_id_returns_404` — approve non-existent ID → 404
  - `test_approve_real_id_returns_200` — approve real ID → 200, status updated
  - `test_concurrent_approve_reject_no_error` — concurrent calls → one 200, one 409
- [ ] Run tests → confirm RED

### Implementation (GREEN) — all [P]
- [ ] `repository.py`: add `bet_id: str | None = None` param to `list_interventions`; extend SQL WHERE clause [P]
- [ ] `repository.py`: add `i.workspace_id` to `list_interventions` SELECT [P]
- [ ] `repository.py`: add `result.rowcount == 0` check in `update_intervention_status` [P]
- [ ] `main.py`: add `bet_id: str | None = Query(None)` to `list_interventions` endpoint; pass to repository [P]
- [ ] `main.py`: handle `False` return from `update_intervention_status` → 404 [P]

### Verify
- [ ] Run `pytest tests/unit/test_interventions_filter.py` → all GREEN
- [ ] Direction detail page for bet-A shows 0 items from bet-B

---

## Phase 2 — `update_workspace_control_level` Fix [P with Phase 1]

### TDD — Write tests first (RED)
- [ ] Write `tests/unit/test_workspace_upsert.py`:
  - `test_new_workspace_created_with_all_columns` — no existing row → INSERT succeeds, all columns present
  - `test_existing_workspace_updates_only_control_level` — existing row → only `control_level` updated
  - `test_invalid_control_level_rejected` — `"not_a_level"` → ValueError before DB write
  - `test_upsert_idempotent` — same level twice → single row, no error

### Implementation (GREEN)
- [ ] Locate the `workspaces` table schema: grep `CREATE TABLE workspaces` and `WorkspaceModel` across `backend/models/`, `backend/migrations/`, and `backend/db/`. The migrations directory may be sparse — also check `backend/app/agents/` for inline `CREATE TABLE` statements used in session setup.
- [ ] List all `NOT NULL` columns on `workspaces` (excluding `id` and `control_level` which are already handled). Common expected columns: `linear_team_id`, `strategy_doc_refs`, `active_bet_ids`, `github_repo`, `created_at`.
- [ ] Update `update_workspace_control_level` INSERT to include all non-nullable columns with sensible defaults (`""` for strings, `'[]'` for JSON arrays, current timestamp for `created_at`)
- [ ] Use `ON CONFLICT (id) DO UPDATE SET control_level = EXCLUDED.control_level` only (other columns unchanged on conflict)
- [ ] Add `ControlLevel` validation check before INSERT

### Verify
- [ ] Run `pytest tests/unit/test_workspace_upsert.py` → all GREEN
- [ ] Set level → restart backend → `GET /workspace/{id}` returns saved level

---

## Phase 3 — Frontend Workspace ID Consolidation [P with Phase 1]

### TDD — Write tests first (RED)
- [ ] Write `frontend/__tests__/useWorkspaceId.test.tsx`:
  - `test_returns_agent_state_workspace_id` — coagent has workspace_id → hook returns it
  - `test_returns_fallback_when_state_undefined` — coagent state undefined → fallback
  - `test_returns_fallback_on_empty_string` — state.workspace_id = "" → fallback (|| not ??)
  - `test_queries_disabled_with_fallback_id` — workspaceId === FALLBACK → enabled: false
- [ ] Run tests → confirm RED

### Implementation (GREEN) — all [P]
- [ ] `hooks/useAgentStateSync.ts`: remove `localState`, `handleStateDelta`, `handleStateSnapshot`; return `agentState` directly [P]
- [ ] `app/workspace/page.tsx`: replace hardcoded `"default_workspace"` in BetDeclarationModal with `useWorkspaceId()` [P]
- [ ] `app/workspace/directions/page.tsx`: add `enabled` guard to `useQuery` [P]
- [ ] `app/workspace/mission-control/page.tsx`: add `enabled` guard [P]
- [ ] `app/workspace/settings/page.tsx`: add `enabled` guard [P]
- [ ] `app/workspace/directions/[id]/page.tsx`: add `enabled` guard [P]
- [ ] `app/workspace/inbox/page.tsx`: replace `useWorkspaceState().workspaceId` with `useWorkspaceId()` — **blindspot**: this page was missed in the original spec and uses the old hook [P]
- [ ] `hooks/useWorkspaceState.ts`: change `"ws-agentic-os"` fallback to `"default_workspace"` for consistency [P]

### Verify
- [ ] Run `npm run test` → all GREEN
- [ ] All pages in DevTools Network tab: API calls use same workspace_id value
- [ ] Network tab: no API calls firing during CopilotKit hydration window

---

## Phase 4 — `inmemory_bets` Concurrency + Modal Reset [P with Phase 3]

### TDD — Write tests first (RED)
- [ ] Write `test_concurrent_bet_creates_no_race`:
  - 10 concurrent asyncio tasks each appending a bet → assert all 10 present
- [ ] Write `test_modal_reset_on_persisted_false`:
  - Simulate submit with persisted=false → assert form fields cleared

### Implementation (GREEN)
- [ ] Add `_bets_lock = asyncio.Lock()` to `bet_store.py`
- [ ] Wrap `inmemory_bets.append()` in `async with _bets_lock`
- [ ] `BetDeclarationModal.tsx`: add `resetForm()` call before `persisted === false` early return

### Verify
- [ ] Run tests → GREEN
- [ ] BetDeclarationModal: submit (mock error) → close → reopen → form is empty

---

## Phase 5 — Type Fixes [P]

### Implementation
- [ ] `frontend/lib/api.ts`: change `WorkspaceMeta.control_level: string` → `control_level: ControlLevel` [P]
- [ ] `frontend/lib/api.ts`: import `ControlLevel` from `@/lib/types` [P]
- [ ] `frontend/app/workspace/settings/page.tsx`: remove `as ControlLevel` cast [P]

### Verify
- [ ] `npm run build` → no TypeScript errors on `WorkspaceMeta` usage
- [ ] Assigning non-ControlLevel string to `WorkspaceMeta.control_level` → TypeScript error

---

## Phase 6 — Final Validation

- [ ] Run `pytest tests/unit -v` → all GREEN
- [ ] `npm run lint` → 0 errors
- [ ] Full flow: declare bet → run pipeline → see intervention for that bet only → approve → correct 200
- [ ] Mark spec 003 as **Closed**
