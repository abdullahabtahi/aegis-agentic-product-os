# Tasks — 002 Pipeline State Fixes

**Created:** April 2026  
**Convention:** [P] = can run in parallel with other [P] tasks.

---

## Phase 1 — Fix `applyStateDelta` (unblocks all visual verification)

### TDD — Write tests first (RED)
- [ ] Write `frontend/__tests__/delta.test.ts`:
  - `test_delta_applied_to_state` — apply `{op: "replace", path: "/pipeline_status", value: "complete"}` → state.pipeline_status === "complete"
  - `test_delta_does_not_mutate_original` — original state object unchanged after apply
  - `test_empty_delta_returns_same_shape` — empty patch array → state unchanged
  - `test_nested_delta_applied` — `{op: "replace", path: "/stages/0/status", value: "complete"}` → stages[0].status updated
  - `test_invalid_path_throws` — invalid JSON Pointer path → error thrown (not silent)
- [ ] Run tests → confirm RED

### Implementation (GREEN)
- [ ] Open `frontend/lib/delta.ts`
- [ ] Remove Immer `produce` wrapper
- [ ] Replace body with: `const cloned = JSON.parse(JSON.stringify(state)) as T; return applyPatch(cloned, delta, true, true).newDocument`
- [ ] Run tests → confirm GREEN

### Verify
- [ ] In browser: trigger pipeline scan → pipeline stage indicators update in real time

---

## Phase 2 — `pipeline_status` Contract Alignment [P]

### TDD — Write tests first (RED)
- [ ] Write `backend/tests/unit/test_pipeline_status.py`:
  - `test_governor_halt_emits_awaiting_approval` — mock governor halt → state has `pipeline_status: "awaiting_approval"`
  - `test_executor_success_emits_complete` — executor success → `pipeline_status: "complete"`
  - `test_executor_failure_emits_error` — executor failure → `pipeline_status: "error"`

### Implementation (GREEN)
- [ ] Grep all `pipeline_status` assignments in `executor.py`, `conversational.py`, `governor.py`
- [ ] Replace `"awaiting_founder_approval"` → `"awaiting_approval"` [P]
- [ ] Replace `"executed"` → `"complete"` [P]
- [ ] Replace `"execution_failed"` → `"error"` [P]
- [ ] Replace `"founder_approved"` → `"approved"` [P]
- [ ] **`executor.py:119` — update Executor gate check: `pipeline_status != "founder_approved"` → `pipeline_status != "approved"` (NOT [P] — must happen together with the rename above or Executor skips every execution)**
- [ ] Update `frontend/lib/types.ts` `PipelineStatus` union to: `"scanning" | "complete" | "error" | "awaiting_approval" | "approved"` (note: `"awaiting_approval"` already exists — only add the missing values)
- [ ] Update frontend conditionals: any check for old values → new values

### Verify
- [ ] Run `pytest tests/unit/test_pipeline_status.py` → all GREEN
- [ ] Governor halt in live session → approval card renders in UI

---

## Phase 3 — `_run_sub_pipeline` Error Handling [P with Phase 2]

### TDD — Write tests first (RED)
- [ ] Write `test_sub_pipeline_error_returns_error_state`:
  - Mock `_run_sub_pipeline` to raise `RuntimeError("Gemini timeout")`
  - Assert returned dict has `pipeline_status: "error"`
  - Assert `run_pipeline_scan` tool response includes error context, not "pipeline_complete"

### Implementation (GREEN)
- [ ] `conversational.py` — in `_run_sub_pipeline` except block: return `{"pipeline_status": "error", "error": str(exc)}`
- [ ] `conversational.py` — in `run_pipeline_scan`: check for `pipeline_status == "error"` → different LLM message

### Verify
- [ ] Kill Gemini mid-pipeline → UI shows error state, chat message says "scan failed"

---

## Phase 4 — `write_action` Explicit Returns [P with Phase 2]

### TDD — Write tests first (RED)
- [ ] Write `test_write_action_unknown_type_returns_no_op`:
  - Call `write_action({"action_type": "unknown", "target_id": "x"})`
  - Assert returns dict (not None)
  - Assert `result.get("status") == "no_op"`
- [ ] Write `test_write_action_none_type_returns_no_op`
- [ ] Write `test_write_action_empty_type_returns_no_op`

### Implementation (GREEN)
- [ ] `linear_tools.py:519-520` — move the no_op return OUT of `whoami()` body: the two lines are currently after `whoami()`'s try/except always-returns, making them unreachable. Delete them from `whoami()`.
- [ ] Add `return {"status": "no_op", "action": str(action)}` at the true end of `write_action` (after the `create_issue` if-block ends at line ~493, before `async def whoami`). Use `action` dict not `action_type` — there is no `action_type` variable in scope at this point.
- [ ] Audit all branches → every path returns a `dict`

### Verify
- [ ] Run `pytest tests/unit/test_write_action.py` → all GREEN
- [ ] Executor with unrecognized action type → no AttributeError in logs

---

## Phase 5 — ADK Singleton Refactor

### TDD — Write tests first (RED)
- [ ] Write `test_create_pipeline_returns_fresh_instance`:
  - Call `create_aegis_pipeline()` twice → two different object IDs
  - Assert no ADK parent-check error when both are run

### Implementation (GREEN)
- [ ] `agent.py:69` — wrap inline `SequentialAgent(...)` construction in `create_aegis_pipeline() -> SequentialAgent` factory function
- [ ] `agent.py` — update `App` instantiation to call `create_aegis_pipeline()` (not the module-level variable)
- [ ] `agent.py:103` — `conversational_agent = create_conversational_agent()` is already a factory call; the issue is the module-level singleton. Move this call inside `main.py` `ADKAgent` init so a fresh instance is created per server startup. Do NOT create a separate `create_conversational_agent_fresh()` — the existing factory is sufficient.
- [ ] `main.py` — pass `create_conversational_agent()` result directly to `ADKAgent` at startup, not the module-level `conversational_agent` imported from `agent.py`

### Verify
- [ ] `make eval-all` → 5 traces, no "already has a parent" error

---

## Phase 6 — `httpx.AsyncClient` Lifecycle

### TDD — Write tests first (RED)
- [ ] Write `test_get_linear_mcp_returns_singleton`:
  - Call `get_linear_mcp()` twice → same object ID
- [ ] Write `test_linear_client_closed_on_shutdown`:
  - Assert `close()` called during lifespan exit

### Implementation (GREEN)
- [ ] Add `close()` async method to `RealLinearMCP` that calls `await self._client.aclose()`
- [ ] Add `_real_linear_client: RealLinearMCP | None = None` module-level variable in `linear_tools.py`
- [ ] Update `get_linear_mcp()` to return the singleton (create on first call) instead of `RealLinearMCP(api_key=api_key)` each call
- [ ] **Extend the EXISTING `lifespan` in `main.py:40-43`** (do not create a new one — it already exists and runs `close_connector()`). Add before `yield`: `_init_linear_client()`. Add after `yield`: `await _close_linear_client()`. The existing `close_connector()` call must be preserved.

### Verify
- [ ] 50 pipeline scans → `lsof -p <pid>` shows stable file descriptor count
- [ ] App shutdown → no "unclosed client" warnings in logs

---

## Phase 7 — Governor Denial Reason in UI [P with Phase 5]

### Background
`governor.py` already produces `PolicyCheckResult` with `check_name`, `denial_reason`, `details`. `GovernorDecision` already holds the first failed check's fields. The data is in `pipeline_state`; the frontend never surfaces it.

### TDD — Write tests first (RED)
- [ ] Write `test_governor_halt_includes_denial_reason`:
  - Mock a governor halt on `confidence_floor` → assert `pipeline_state` contains `denial_reason` and `details`
- [ ] Write `frontend/__tests__/ApprovalCard.denial.test.tsx`:
  - Render approval card with `denial_reason="confidence_below_floor"`, `details="confidence=0.52, floor=0.70"` → assert text visible

### Implementation (GREEN)
- [ ] `governor.py`: when `GovernorDecision.approved == False`, include `denial_reason` and `details` in the state delta emitted to `pipeline_state`
- [ ] `conversational.py`: ensure `pipeline_state` dict includes `governor_denial_reason` and `governor_denial_details` fields when Governor halts
- [ ] Mission Control approval card: render `governor_denial_reason` + `governor_denial_details` below intervention summary (truncate at 120 chars)
- [ ] Inbox `InterventionInbox` / approval card: same render

### Verify
- [ ] Run tests → GREEN
- [ ] Governor halt in live session → Mission Control shows denial reason

---

## Phase 8 — Executor Per-Tool Error Boundaries [P with Phase 3]

### TDD — Write tests first (RED)
- [ ] Write `test_executor_tool_exception_captured`:
  - Mock `MockLinearMCP.write_action` to raise `RuntimeError("network error")`
  - Run Executor
  - Assert result dict has `pipeline_status: "error"`
  - Assert no unhandled exception propagates

### Implementation (GREEN)
- [ ] `executor.py`: wrap each external tool call (`write_action`, `trigger_task`, etc.) in individual `try/except Exception as exc` blocks
- [ ] On exception: log error, store `{"tool": "<name>", "status": "error", "error": str(exc)}` in results dict
- [ ] After all tool calls: if any tool errored → set final `pipeline_status = "error"`
- [ ] Do NOT catch `SystemExit`, `KeyboardInterrupt`, `BaseException` — only `Exception`

### Verify
- [ ] Run test → GREEN
- [ ] Verify `_run_sub_pipeline` error handling (Phase 3) + per-tool boundaries (this phase) together cover all executor failure modes

---

## Phase 9 — Final Validation

- [ ] `make eval-all` → all 5 traces ≥ 0.8 score
- [ ] Full chat → pipeline → Governor halt → approval card shows denial reason → approve → Linear write (mock) flow works
- [ ] `npm run lint` → 0 errors
- [ ] Mark spec 002 as **Closed**
