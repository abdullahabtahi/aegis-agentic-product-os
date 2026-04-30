# Spec — 005 Code Quality

**Created:** April 2026  
**Status:** Open  
**Audit findings addressed:** M1, M12, L1–L7, E2E-03

---

## User Stories

### P1-US-01: Consistent Risk Severity Colors Across Views
As a founder, I want risk severity badges to look the same in the chat risk card and the direction detail page so the visual language is coherent.

**Acceptance Scenarios:**
- Given `severity: "critical"` → same color in `RiskSignalCard` and `directions/[id]` detail view
- Given `severity: "high"` → same color in both views
- Given `severity: "medium"` and `"low"` → same colors in both views
- Given color constants updated in one place → both views reflect the change

**Edge cases:**
- Unknown severity value → both views render a neutral/default badge, not crash

---

### P1-US-02: Stub Functions Raise NotImplementedError
As a developer, I want Phase 4+ stub functions to raise `NotImplementedError` when called so accidental usage is caught immediately rather than returning empty/silent results.

**Acceptance Scenarios:**
- Given `auto_research.py` stub function called → raises `NotImplementedError("Phase 4 stub — not yet implemented")`
- Given `graphiti.py`, `memory_synthesis.py`, `workspace_fact.py` stubs called → same error
- Given tests import stubs → can call with `pytest.raises(NotImplementedError)`

**Edge cases:**
- Stub imported but not called → no error (import is safe)
- Stub has `__init__` → class instantiation succeeds; method calls raise `NotImplementedError`

---

### P2-US-03: Dead Code Removed
As a developer, I want unused components, constants, and functions removed so the codebase is easier to navigate and audit.

**Acceptance Scenarios:**
- Given `LinearLayout.tsx` → deleted; no import references it
- Given `RISK_ACCENT` in `directions/page.tsx` → removed or connected to actual usage
- Given `get_linear_signals_from_fixture`, `list_linear_issues`, `list_linear_relations` → removed from `linear_tools.py`
- Given `PipelineProgressCard.currentStage` prop → removed from interface if unused

**Edge cases:**
- Dead code removal triggers a TypeScript or Python import error → that import error is the real bug; fix both

---

### P2-US-03b: Coordinator Jules Prerequisite Check
As a developer, I want the Coordinator to skip Jules actions when `workspace.github_repo` is not set so we don't waste a full pipeline run on an action the Governor will immediately reject.

**Acceptance Scenarios:**
- Given `workspace.github_repo` is empty or None → Coordinator does NOT recommend any Jules action type
- Given `workspace.github_repo` is set → Coordinator may recommend Jules actions as before
- Given Coordinator skips Jules due to missing repo → it picks the next-best action type from the taxonomy

**Edge cases:**
- `workspace.github_repo` is whitespace-only → treated same as empty (strip before check)
- Session state has no `github_repo` key at all → treated as empty
- Coordinator has multiple Jules candidates and all are filtered → falls back to non-Jules actions

**Source:** `governor.py` `check_jules_gate` already rejects Jules actions at Governor stage. Coordinator has no prerequisite check — it recommends Jules actions regardless, wasting a pipeline invocation. This is a code quality / efficiency fix, not a new behavior.

---

### P2-US-04: Type Safety Enforced
As a developer, I want TypeScript and Python types to be precise so type errors are caught at compile time not runtime.

**Acceptance Scenarios:**
- Given `WorkspaceMeta.control_level` in `api.ts` → typed as `ControlLevel`, not `string`
- Given `settings/page.tsx` cast `as ControlLevel` → removed (not needed with correct type)
- Given `propose_intervention` in `coordinator.py` → validates `action_type` against allowed set
- Given `ty` run on backend → no new type errors introduced by fix specs

**Edge cases:**
- `control_level` value from API is not in `ControlLevel` set → TypeScript catches at assignment
- `action_type` from LLM is not in taxonomy → error returned before state write

---

### P2-US-05: Lint and Type Check Pass Clean
As a developer, I want `npm run lint` and `uv run ty check` to produce zero new errors after all fixes so the codebase stays healthy.

**Acceptance Scenarios:**
- Given `npm run lint` → 0 errors (existing 2 pre-existing ESLint warnings acceptable)
- Given `uv run ruff check app/` → 0 errors
- Given `uv run ty check` → 0 new type errors (pre-existing ones documented)
- Given `_json_str`, `_now_iso`, `_new_id` moved to top of `repository.py` → `import json` at module level

**Edge cases:**
- Pre-existing warnings baseline documented before changes so regressions are detectable

---

## Functional Requirements

| ID | Requirement |
|---|---|
| FR-001 | `RISK_LABELS` and severity color styles consolidated in `lib/constants.ts` |
| FR-002 | `RiskSignalCard.tsx` imports severity styles from `lib/constants.ts`, not local definitions |
| FR-003 | All stub functions in `app/stubs/` raise `NotImplementedError` in their bodies |
| FR-004 | `LinearLayout.tsx` deleted |
| FR-005 | `RISK_ACCENT` in `directions/page.tsx` either used or removed |
| FR-006 | `get_linear_signals_from_fixture`, `list_linear_issues`, `list_linear_relations` removed from `linear_tools.py` |
| FR-007 | `WorkspaceMeta.control_level` typed as `ControlLevel` in `frontend/lib/api.ts` |
| FR-008 | `propose_intervention` validates `action_type` against `ActionType` literal |
| FR-011 | Coordinator does not recommend Jules action types when `workspace.github_repo` is empty or None |
| FR-009 | `_json_str`, `_now_iso`, `_new_id` moved to top of `repository.py`; `import json` at module level |
| FR-010 | `PipelineProgressCard` interface cleaned of unused `currentStage` prop |

---

## Success Criteria

| ID | Criteria |
|---|---|
| SC-001 | `RiskSignalCard` and `directions/[id]` show identical hex colors for same severity |
| SC-002 | `from app.stubs.auto_research import some_stub; some_stub()` → `NotImplementedError` |
| SC-003 | `grep -r "LinearLayout" frontend/` → 0 results |
| SC-004 | `api.ts` `WorkspaceMeta.control_level` → TypeScript error if assigned non-ControlLevel value |
| SC-005 | `npm run lint` → 0 errors |
| SC-006 | `uv run ruff check app/` → 0 errors |
