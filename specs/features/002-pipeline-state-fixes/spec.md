# Spec — 002 Pipeline State Fixes

**Created:** April 2026  
**Status:** Open  
**Audit findings addressed:** C4, C5, C6, H2, H7, H8, H11, E2E-01, E2E-02

---

## User Stories

### P1-US-01: Approval UI Renders on Governor Halt
As a founder, I want to see the intervention approval card when the Governor halts the pipeline so I can make a human decision.

**Acceptance Scenarios:**
- Given the Governor halts (policy check fails) → backend emits `pipeline_status: "awaiting_approval"`
- Given `pipeline_status === "awaiting_approval"` in AG-UI state → frontend renders the approval card
- Given founder clicks Approve → `pipeline_status` transitions to `"approved"`
- Given founder clicks Reject → intervention is rejected, pipeline ends

**Edge cases:**
- Page refresh while pipeline awaiting approval → approval card still visible (state re-hydrated from AG-UI)
- Approval card rendered while pipeline stages still animating → no layout collision
- Intervention ID in approval card references a bet that was deleted → graceful error, not crash

---

### P1-US-02: Pipeline Stage Progress Updates in Real Time
As a founder, I want to see pipeline stage indicators update as each agent completes so I know the system is working.

**Acceptance Scenarios:**
- Given Signal Engine completes → stage 1 shows "complete", stage 2 shows "running"
- Given Product Brain completes → stage 2 shows "complete", stage 3 shows "running"
- Given all 5 stages complete → all show "complete", `pipeline_status` = `"complete"`
- Given STATE_DELTA event arrives → stages update without full page refresh

**Edge cases:**
- STATE_DELTA arrives out of order → later delta wins (last-write-wins on status)
- STATE_DELTA with empty `stages` array → current stages preserved, not cleared
- Network interruption mid-pipeline → stages freeze at last known state, no crash
- Rapid succession of STATE_DELTA events → UI debounces or queues, never crashes

---

### P1-US-03: Pipeline Failure Shows Error State
As a founder, I want to see a clear error state when the pipeline fails so I know something went wrong instead of seeing a fake "complete."

**Acceptance Scenarios:**
- Given `_run_sub_pipeline` raises any exception → returns `{"pipeline_status": "error", "error": "..."}`
- Given `pipeline_status === "error"` → frontend renders error message, not success state
- Given error state → chat message includes the error context, not "scan complete"
- Given retry after error → pipeline can be re-triggered

**Edge cases:**
- Error message contains sensitive internal paths → sanitized before sending to frontend
- Gemini API timeout → captured as error, not hung pipeline
- Partial pipeline failure (stage 3 fails, stages 1-2 succeeded) → `pipeline_status: "error"`, completed stages remain visible

---

### P2-US-04: Fresh ADK Agent Per Request
As a developer, I want ADK agent instances created fresh per pipeline run so that multi-request and multi-eval scenarios work without parent-check errors.

**Acceptance Scenarios:**
- Given two concurrent pipeline runs → each uses an independent agent tree
- Given `make eval-all` running 5 traces sequentially → no "already has a parent" ADK error
- Given playground `adk web` → uses fresh agent tree per session

**Edge cases:**
- Factory function called with invalid args → raises immediately, not at agent run time
- Agent construction fails (missing env var) → clean error at startup, not mid-request

---

### P2-US-05: `write_action` Returns on All Code Paths
As a developer, I want `RealLinearMCP.write_action` to always return a dict so the Executor never receives `None` and crashes.

**Acceptance Scenarios:**
- Given `write_action` called with `action_type="add_comment"` → returns `{"status": "ok", ...}`
- Given `write_action` called with `action_type="create_issue"` → returns `{"status": "ok", ...}`
- Given `write_action` called with unrecognized `action_type` → returns `{"status": "no_op", "action_type": action_type}`
- Given Executor calls `.get("status")` on result → never raises `AttributeError`

**Edge cases:**
- `action_type=None` → returns `{"status": "no_op"}`
- `action_type=""` → returns `{"status": "no_op"}`
- `write_action` raises internal exception → exception propagates cleanly, not swallowed

---

### P2-US-06: `httpx.AsyncClient` Properly Closed
As a developer, I want `RealLinearMCP` HTTP clients closed after use so file descriptors are not leaked under sustained load.

**Acceptance Scenarios:**
- Given FastAPI app starts → `RealLinearMCP` client created once in `lifespan`
- Given FastAPI app shuts down → `client.aclose()` called
- Given 100 sequential pipeline scans → no increase in open file descriptors
- Given `AEGIS_MOCK_LINEAR=true` → no `httpx` client created at all

**Edge cases:**
- `lifespan` raises during startup → client not created, no cleanup needed
- `client.aclose()` raises during shutdown → exception logged, server still shuts down cleanly

---

### P2-US-07: Governor Failure Reason Surfaced in UI
As a founder, I want to see WHY the pipeline was halted (which policy check failed) so I understand what constraint blocked the intervention.

**Acceptance Scenarios:**
- Given Governor halts on `confidence_floor` → UI shows "Confidence below threshold (0.52 < 0.70)" or similar human-readable reason
- Given Governor halts on `jules_gate` → UI shows "Jules action requires GitHub repo connected"
- Given Governor halts on `rate_cap` → UI shows "Rate cap reached: 3 interventions in last 7 days"
- Given Governor halts on `duplicate_suppression` → UI shows duplicate reason
- Given Governor approves (no halts) → no failure reason shown

**Edge cases:**
- Multiple policy checks fail → show the first failure only (Governor stops at first denial)
- `denial_reason` is null (Governor approved) → UI renders nothing in that slot
- `details` field is very long → truncate at 120 chars with tooltip

**Source:** `backend/app/agents/governor.py` → `PolicyCheckResult` already has `check_name`, `denial_reason`, `details` fields. Backend has the data; frontend never surfaces it. The `GovernorDecision` response is already in `pipeline_state` — add it to the AG-UI STATE_DELTA payload and render in Mission Control / Inbox approval card.

---

### P2-US-08: Executor Tool Calls Have Per-Call Error Boundaries
As a developer, I want each external tool call inside Executor (Linear write, Jules trigger) wrapped in try/except so one failing tool doesn't leave the Executor in an indeterminate state.

**Acceptance Scenarios:**
- Given `MockLinearMCP.write_action` raises an exception → Executor catches it, records `{"tool": "linear", "status": "error", "error": "..."}` in result, continues
- Given `JulesClient.trigger_task` raises timeout → Executor catches it, marks that tool's result as error, still emits final `pipeline_status: "error"`
- Given all tool calls succeed → `pipeline_status: "complete"` as normal

**Edge cases:**
- Tool raises `asyncio.TimeoutError` → treated same as any exception
- Tool raises `SystemExit` → NOT caught (let it propagate)
- Executor has 3 tool calls and call 2 fails → calls 1 and 3 results preserved in output dict

---

## Functional Requirements

| ID | Requirement |
|---|---|
| FR-001 | Backend `pipeline_status` values must be exactly: `"scanning"`, `"complete"`, `"error"`, `"awaiting_approval"`, `"approved"` |
| FR-002 | Frontend `PipelineStatus` union must include all 5 values from FR-001 |
| FR-003 | `applyStateDelta` must use `mutateDocument: true` inside Immer or use plain deep-clone |
| FR-004 | `_run_sub_pipeline` must return `{"pipeline_status": "error", "error": str(exc)}` on any exception |
| FR-005 | `write_action` must have an explicit `return` on every code path; no implicit `None` returns |
| FR-006 | All ADK agents created via factory functions; no module-level singleton agent objects |
| FR-007 | `RealLinearMCP` lifecycle managed in FastAPI `lifespan`; `aclose()` called on shutdown |
| FR-008 | `_make_stages` called with `current_idx = len(STAGE_NAMES) - 1` for "all complete", not `len(STAGE_NAMES)` |
| FR-009 | `GovernorDecision.denial_reason` and `details` included in AG-UI STATE_DELTA payload when `pipeline_status = "awaiting_approval"` |
| FR-010 | Mission Control and Inbox approval cards render the Governor's `denial_reason` + `details` when present |
| FR-011 | Each external tool call in `executor.py` wrapped in individual try/except; exceptions logged and captured in result dict |

---

## Success Criteria

| ID | Criteria |
|---|---|
| SC-001 | Governor halt in a live chat session → approval card visible in UI within 2s |
| SC-002 | `STATE_DELTA` event in browser DevTools → pipeline stage updates in UI immediately |
| SC-003 | Kill Gemini connection mid-pipeline → UI shows error state within 5s |
| SC-004 | `make eval-all` runs 5 traces with no "already has a parent" ADK error |
| SC-005 | `write_action(action_type="unknown_type")` → returns dict with `status: "no_op"`, no AttributeError |
| SC-006 | `lsof -p <backend_pid>` after 50 pipeline scans → no unbounded file descriptor growth |
| SC-007 | Governor halt on `confidence_floor` → Mission Control shows human-readable denial reason within the approval card |
| SC-008 | Mock `MockLinearMCP.write_action` to raise `RuntimeError` → Executor still returns a result dict with `pipeline_status: "error"`, no unhandled exception |
