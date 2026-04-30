# Plan — 002 Pipeline State Fixes

**Created:** April 2026

---

## Approach

Four independent fixes plus one contract alignment. Fix the AG-UI state delta bug first — it blocks verifying all other pipeline fixes in the browser.

**Fix order:**
1. `applyStateDelta` (frontend) — unblocks visual verification of all other fixes
2. `pipeline_status` contract alignment (backend + frontend) — unblocks approval UI
3. `_run_sub_pipeline` error handling (backend)
4. `write_action` missing return (backend)
5. ADK singleton refactor (backend)
6. `httpx.AsyncClient` lifecycle (backend)
7. `_make_stages` sentinel (backend)
8. Governor denial reason surfaced in UI (backend + frontend) — NEW from E2E audit
9. Executor per-tool error boundaries (backend) — NEW from E2E audit

---

## Files to Change

### Fix 1 — `applyStateDelta` (`lib/delta.ts`)
- Change `applyPatch(draft as T, delta, true, false)` → `applyPatch(draft as T, delta, true, true)`
- OR remove Immer entirely: `const cloned = JSON.parse(JSON.stringify(state)) as T; return applyPatch(cloned, delta, true, true).newDocument`
- Preferred: remove Immer from this function (simpler, no Immer interaction complexity)

### Fix 2 — `pipeline_status` contract (`backend/app/agents/conversational.py` + `executor.py` + `frontend/lib/types.ts`)
- Audit all `pipeline_status` assignments in backend: `executor.py`, `conversational.py`, `governor.py`
- Normalize to: `"scanning"`, `"complete"`, `"error"`, `"awaiting_approval"`, `"approved"`
- Replace `"awaiting_founder_approval"` → `"awaiting_approval"` everywhere in backend
- Replace `"executed"` → `"complete"` everywhere in backend
- Replace `"execution_failed"` → `"error"` everywhere in backend
- Update `PipelineStatus` union in `frontend/lib/types.ts` to include all 5 values
- Update any frontend conditional: `=== "awaiting_founder_approval"` → `=== "awaiting_approval"`

### Fix 3 — `_run_sub_pipeline` (`backend/app/agents/conversational.py`)
- In the `except` block: return `{"pipeline_status": "error", "error": str(exc)}` instead of `{}`
- In `run_pipeline_scan`: check `pipeline_state.get("pipeline_status") == "error"` → emit error to LLM, not success

### Fix 4 — `write_action` (`backend/tools/linear_tools.py`)
- Remove dead code inside `whoami()` (lines 519-520)
- Add explicit `return {"status": "no_op", "action": str(action)}` at the true end of `write_action` (after the `create_issue` block, before `async def whoami`). Use `action` dict — there is no `action_type` variable in scope at that point.
- Ensure every branch in `write_action` has an explicit `return dict`

### Fix 5 — ADK Singleton Refactor (`backend/app/agent.py`, `backend/app/main.py`)
- Wrap inline `SequentialAgent(...)` at `agent.py:69` in `create_aegis_pipeline() -> SequentialAgent` factory
- Update `App` instantiation to call `create_aegis_pipeline()` (not the module-level variable)
- `create_conversational_agent()` already exists as a factory — do NOT create a separate `create_conversational_agent_fresh()`. The module-level `conversational_agent = create_conversational_agent()` at `agent.py:103` is a singleton. Fix: call `create_conversational_agent()` directly in `main.py` when constructing `ADKAgent`, instead of importing the module-level variable.

### Fix 6 — `httpx.AsyncClient` lifecycle (`backend/tools/linear_tools.py`, `backend/app/main.py`)
- Add `_real_linear_client: RealLinearMCP | None = None` module-level variable in `linear_tools.py`
- Add `close()` async method to `RealLinearMCP` that calls `await self._client.aclose()`
- Update `get_linear_mcp()` to return the singleton (create on first call) instead of `RealLinearMCP(api_key=api_key)` on every call
- **The FastAPI `lifespan` already exists at `main.py:40-43`** (do not create a new one). Extend it: add Linear client init before `yield` and `await close()` after `yield`. The existing `await close_connector()` call must be preserved.

### Fix 7 — `_make_stages` sentinel (`backend/app/agents/conversational.py`)
- Define `_ALL_STAGES_COMPLETE = len(STAGE_NAMES)` sentinel
- Replace `_make_stages(5, ...)` call with `_make_stages(len(STAGE_NAMES) - 1, dict.fromkeys(STAGE_NAMES, "complete"))`

---

### Fix 8 — Governor Denial Reason in UI (`backend/app/agents/governor.py`, `backend/app/agents/conversational.py`, frontend approval cards)
- `PolicyCheckResult` already has `check_name`, `denial_reason`, `details` on every failed check
- `GovernorDecision` (in `models/responses.py`) already holds the first failed check's data
- Add `governor_denial_reason` and `governor_denial_details` keys to the `pipeline_state` dict when Governor emits `pipeline_status = "awaiting_approval"`
- Mission Control and Inbox approval cards: render these fields below the intervention summary (truncate at 120 chars; full text in tooltip)

### Fix 9 — Executor Per-Tool Error Boundaries (`backend/app/agents/executor.py`)
- Wrap each call to `MockLinearMCP.write_action`, `RealLinearMCP.write_action`, `JulesClient.trigger_task` in individual `try/except Exception as exc` blocks
- On exception: log error, add `{"tool": "<name>", "status": "error", "error": str(exc)}` to a results accumulator
- After all tool calls complete: if any tool in results has `status == "error"` → set final `pipeline_status = "error"` and include all partial results
- This is additive to Phase 3 fix (`_run_sub_pipeline` outer catch) — the outer catch handles unexpected crashes; per-tool boundaries handle expected tool failures gracefully

---

## Design Decisions

- **Remove Immer from `applyStateDelta`**: The function already deep-clones via JSON parse in tests; Immer adds complexity with no benefit here. A plain deep-clone + `applyPatch` is correct and simpler.
- **Backend is authoritative on `pipeline_status` vocabulary**: Frontend extends its union to include all backend values rather than the backend adapting to frontend naming.
- **`RealLinearMCP` singleton via lifespan**: Follows the existing `close_connector()` pattern in `engine.py`. One client, properly closed.
- **Governor denial reason via pipeline_state**: The `GovernorDecision` is already in session state. Adding `governor_denial_reason`/`governor_denial_details` top-level keys avoids frontend needing to parse nested objects from the AG-UI delta.
- **Per-tool exceptions, not outer catch only**: Fix 3 is a safety net for crashes. Fix 9 is for graceful degradation — if Jules timeouts but Linear writes succeed, we should preserve the Linear result and mark Jules as errored, not throw away everything.
