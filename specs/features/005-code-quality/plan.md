# Plan — 005 Code Quality

**Created:** April 2026

---

## Approach

All changes are safe to implement in parallel — no runtime behavior changes, only cleanup, type narrowing, and dead code removal. Lowest risk spec; run lint/type-check before and after each change.

---

## Files to Change

### Fix 1 — Deduplicate Constants (`frontend/lib/constants.ts`, `frontend/components/chat/RiskSignalCard.tsx`)
- `lib/constants.ts`: ensure `RISK_LABELS`, `SEVERITY_STYLES` (color classes) are exported with consistent values
- `RiskSignalCard.tsx`: remove local `RISK_LABELS` and severity color definitions; import from `lib/constants.ts`
- Cross-check: `directions/[id]/page.tsx` severity color usage → should also import from `lib/constants.ts`

### Fix 2 — Dead Code Removal Frontend
- `frontend/components/layout/LinearLayout.tsx`: delete file
- `frontend/app/workspace/directions/page.tsx`: remove `RISK_ACCENT` constant (lines ~26-31) if unused, or wire it to actual risk type from intervention data
- `frontend/components/chat/PipelineProgressCard.tsx`: remove `currentStage` from interface and function signature if unused

### Fix 3 — Dead Code Removal Backend (`backend/tools/linear_tools.py`)
- Remove `MockLinearMCP.get_linear_signals_from_fixture()` method
- Remove module-level `list_linear_issues` and `list_linear_relations` FunctionTool wrappers (lines 197-254)
- Verify nothing imports these

### Fix 4 — Stubs Raise `NotImplementedError` (`backend/app/stubs/`)
- `auto_research.py`: add `raise NotImplementedError("Phase 4 stub — not yet implemented")` to each function body
- `graphiti.py`: same
- `memory_synthesis.py`: same
- `workspace_fact.py`: same

### Fix 5 — `propose_intervention` Validation (`backend/app/agents/coordinator.py`)
- Import `ActionType` literal set from `models/schema.py`
- At start of `propose_intervention` tool: validate `action_type in get_args(ActionType)`
- If invalid: return structured error `{"error": "invalid_action_type", "received": action_type}`, do not write to state

### Fix 6 — Helper Order in `repository.py` (`backend/db/repository.py`)
- Move `_json_str`, `_now_iso`, `_new_id` to top of file (after imports, before first function)
- Move `import json` inside `_json_str` → to module-level imports

### Fix 7 — `JulesClient` env var at call time (`backend/tools/jules_service.py`)
- Remove `_JULES_API_KEY = os.environ.get("JULES_API_KEY", "")` module-level constant
- In `JulesClient.__init__`: read `os.environ.get("JULES_API_KEY", "")` directly
- In `get_jules_client()` singleton: re-read env on first call, not at import

---

## Design Decisions

- **Prefer import from `lib/constants.ts`** over copying: one source of truth, one place to update colors when design changes.
- **Delete `LinearLayout.tsx`** completely: zero references, 167 lines of dead code with links to non-existent routes. No deprecation notice needed.
- **`RISK_ACCENT` removal over wiring**: Wiring requires joining bet with intervention data across pages — that's a feature scope change, not a quality fix. Remove for now; add back in a feature spec if needed.
- **`NotImplementedError` in stubs**: Fail loud and early. Silent returns from stubs are harder to debug than a clear error message.
