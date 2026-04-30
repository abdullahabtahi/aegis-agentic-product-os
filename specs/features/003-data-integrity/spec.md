# Spec — 003 Data Integrity

**Created:** April 2026  
**Status:** Open  
**Audit findings addressed:** H1, H9, H10, H12, H13, M2, M6, M11

---

## User Stories

### P1-US-01: Interventions Filtered by Bet
As a founder, I want the direction detail page to show only interventions for that specific direction so I don't see data from other bets.

**Acceptance Scenarios:**
- Given `GET /interventions?workspace_id=ws-1&bet_id=bet-A` → returns only interventions where `bet_id = "bet-A"`
- Given workspace has 10 interventions across 3 bets → each bet's detail page shows its own subset
- Given `bet_id` param absent → returns all interventions for workspace (backward compat)
- Given `bet_id` present but no matching interventions → returns `[]`, not 404

**Edge cases:**
- `bet_id` with SQL special characters → parameterized query handles safely
- `bet_id` of deleted bet → returns `[]` (not error)
- `workspace_id` valid but `bet_id` belongs to different workspace → returns `[]`

---

### P1-US-02: Approve/Reject Returns 404 for Phantom IDs
As a founder, I want approve and reject operations to return an error when the intervention doesn't exist so the UI doesn't falsely report success.

**Acceptance Scenarios:**
- Given `POST /interventions/nonexistent-id/approve` → 404 Not Found
- Given `POST /interventions/nonexistent-id/reject` → 404 Not Found
- Given `POST /interventions/real-id/approve` → 200 and intervention status updated
- Given `POST /interventions/already-approved-id/approve` → 409 Conflict (already resolved)

**Edge cases:**
- Concurrent approve + reject on same ID → one succeeds, one gets 409
- ID is valid UUID format but not in DB → 404 (not 422 or 500)
- DB error during UPDATE → 500 (not falsely 404)

---

### P1-US-03: Control Level Saves Correctly
As a founder, I want my control level setting to persist correctly so that it survives page reload and backend restart.

**Acceptance Scenarios:**
- Given new workspace (no DB row) → `update_workspace_control_level` creates row with all columns
- Given existing workspace → only `control_level` column is updated, other columns unchanged
- Given `GET /workspace/{workspace_id}` after save → returns the newly saved `control_level`
- Given `control_level = "require_approval"` saved → backend restart → `GET /workspace/{id}` still returns `"require_approval"`

**Edge cases:**
- `control_level` value not in allowed set → 422 validation error (backend rejects before DB write)
- DB connection lost during save → `update_workspace_control_level` returns `False`, session state still updated
- Two concurrent saves of different levels → last write wins, no constraint violation

---

### P1-US-04: Single Workspace ID Source
As a developer, I want all frontend pages to use the same workspace ID so that API calls are consistent and correctly scoped.

**Acceptance Scenarios:**
- Given CopilotKit hydrated with `workspace_id = "ws-real"` → all pages query with `"ws-real"`
- Given CopilotKit not yet hydrated → queries are deferred (not fired with fallback ID)
- Given `workspace_id = ""` from backend → `useWorkspaceId` returns fallback, not empty string
- Given home page BetDeclarationModal → uses `useWorkspaceId()` not hardcoded string

**Edge cases:**
- `useWorkspaceId` called before CopilotKit Provider mounts → returns fallback without error
- `workspaceId === FALLBACK` → all `useQuery` calls have `enabled: false`
- Two components simultaneously call `useWorkspaceId` → both return same value

---

### P2-US-05: `workspace_id` Present in Intervention API Response
As a developer, I want `workspace_id` included in every intervention object returned by the API so that TypeScript types match runtime data.

**Acceptance Scenarios:**
- Given `GET /interventions?workspace_id=ws-1` → each intervention in response includes `workspace_id: "ws-1"`
- Given `intervention.workspace_id` accessed in TypeScript → no runtime `undefined`
- Given `Intervention` TypeScript interface → `workspace_id: string` is non-optional and always populated

**Edge cases:**
- Legacy intervention rows in DB without `workspace_id` → return `""` or the query param value, not null

---

### P2-US-06: `inmemory_bets` No Concurrent Mutation
As a developer, I want the in-memory bet list to be safely accessible under concurrent requests so there are no race conditions in local dev mode.

**Acceptance Scenarios:**
- Given 10 concurrent `POST /bets` requests → all 10 bets stored, none lost
- Given concurrent read + write → read returns consistent snapshot

**Edge cases:**
- `declare_direction` and `POST /bets` endpoint both write → no duplicate entries from both paths
- In-memory store cleared between tests → no state leakage across test runs

---

## Functional Requirements

| ID | Requirement |
|---|---|
| FR-001 | `GET /interventions` SQL query filters on `bet_id` when param is provided |
| FR-002 | `GET /interventions` SELECT clause includes `i.workspace_id` |
| FR-003 | `update_intervention_status` checks `result.rowcount == 0` → returns `False` → caller returns 404 |
| FR-004 | `update_workspace_control_level` INSERT includes all non-nullable columns with sensible defaults |
| FR-005 | `useWorkspaceId` is the only allowed workspace ID source in all frontend components |
| FR-006 | All `useQuery` calls depending on `workspaceId` include `enabled: !!workspaceId && workspaceId !== FALLBACK` |
| FR-007 | `workspace/page.tsx` BetDeclarationModal receives `workspaceId` from `useWorkspaceId()` |
| FR-008 | `inmemory_bets` writes use `asyncio.Lock` |
| FR-009 | `control_level` field validated against `ControlLevel` literal before DB write |
| FR-010 | `WorkspaceMeta.control_level` typed as `ControlLevel` in `frontend/lib/api.ts` |

---

## Success Criteria

| ID | Criteria |
|---|---|
| SC-001 | Direction detail page for bet-A shows 0 interventions from bet-B |
| SC-002 | `POST /interventions/fake-uuid/approve` → 404, not 200 |
| SC-003 | Set control level to "require_approval" → restart backend → `GET /workspace/{id}` returns "require_approval" |
| SC-004 | All 6 pages using workspace ID fetch with same value simultaneously |
| SC-005 | `GET /interventions` response → each item has `workspace_id` field |
| SC-006 | `asyncio` concurrent test: 10 simultaneous bet creates → all 10 in `inmemory_bets` |
