# Tasks — 005 Code Quality

**Created:** April 2026  
**Convention:** [P] = can run in parallel with other [P] tasks. All Phase 1 tasks are [P].

---

## Baseline (before any changes)

- [ ] Run `npm run lint` → record current warning/error count
- [ ] Run `uv run ruff check app/` → record current count
- [ ] Run `uv run ty check` → record current count
- [ ] Write counts to `spec/features/005-code-quality/baseline.txt` so regressions are detectable

---

## Phase 1 — All changes are independent [P]

### 1A — Deduplicate Frontend Constants [P]

- [ ] Write test: `test_risk_signal_card_uses_constants_ts_colors` — import both constants; assert same color values
- [ ] Confirm `lib/constants.ts` exports `RISK_LABELS` and `SEVERITY_STYLES` with correct values
- [ ] `RiskSignalCard.tsx`: replace local definitions with imports from `lib/constants.ts`
- [ ] `directions/[id]/page.tsx`: confirm severity colors also import from `lib/constants.ts`
- [ ] Run test → GREEN
- [ ] Visual check: same badge color for "critical" in chat card and direction detail

---

### 1B — Delete `LinearLayout.tsx` [P]

- [ ] `grep -r "LinearLayout" frontend/` → confirm 0 results (no imports)
- [ ] Delete `frontend/components/layout/LinearLayout.tsx`
- [ ] `npm run build` → confirm no missing module errors

---

### 1C — Remove `RISK_ACCENT` dead constant [P]

- [ ] Write test: `test_directions_page_renders_without_risk_accent` — confirm no reference to RISK_ACCENT
- [ ] `frontend/app/workspace/directions/page.tsx`: remove `RISK_ACCENT` constant (lines ~26-31)
- [ ] `npm run lint` → confirm ESLint warning for RISK_ACCENT is gone

---

### 1D — Remove `PipelineProgressCard.currentStage` dead prop [P]

- [ ] Confirm `currentStage` is not used inside the component body
- [ ] Remove from `PipelineProgressCardProps` interface
- [ ] Remove from function signature
- [ ] `npm run build` → no errors

---

### 1E — Remove Backend Dead Code in `linear_tools.py` [P]

- [ ] Write test: `test_mock_linear_has_no_fixture_method` — confirm `MockLinearMCP` has no `get_linear_signals_from_fixture`
- [ ] Remove `get_linear_signals_from_fixture` from `MockLinearMCP`
- [ ] Remove `list_linear_issues` and `list_linear_relations` module-level FunctionTool wrappers
- [ ] `grep -r "list_linear_issues\|list_linear_relations\|get_linear_signals_from_fixture" backend/` → 0 results
- [ ] Run `pytest tests/unit` → no new failures

---

### 1F — Stubs Raise `NotImplementedError` [P]

- [ ] Write `tests/unit/test_stubs.py`:
  - Import each stub module; call each exported function
  - Assert `pytest.raises(NotImplementedError)` for each
- [ ] `auto_research.py`: add `raise NotImplementedError(...)` to each function body [P]
- [ ] `graphiti.py`: same [P]
- [ ] `memory_synthesis.py`: same [P]
- [ ] `workspace_fact.py`: same [P]
- [ ] Run `pytest tests/unit/test_stubs.py` → GREEN

---

### 1G — `propose_intervention` Action Type Validation [P]

- [ ] Write `test_propose_intervention_rejects_invalid_action_type`:
  - Call with `action_type="made_up_action"` → returns dict with `"error": "invalid_action_type"`
  - State not written when invalid
- [ ] `coordinator.py`: add validation at start of `propose_intervention`
- [ ] Run test → GREEN

---

### 1H — `repository.py` Helper Order [P]

- [ ] Move `_json_str`, `_now_iso`, `_new_id` to top of `repository.py`
- [ ] Move `import json` to module-level imports
- [ ] Run `pytest tests/unit` → no regressions

---

### 1I — `JulesClient` Env Var at Call Time [P]

- [ ] Write `test_jules_client_reads_env_at_init_not_import`:
  - Set env var after module import → `JulesClient()` uses the new value
- [ ] Remove `_JULES_API_KEY` module-level constant
- [ ] Read `os.environ.get("JULES_API_KEY", "")` inside `JulesClient.__init__`
- [ ] Run test → GREEN

---

### 1J — Coordinator Jules Prerequisite Check [P]

*Source: E2E audit finding E2E-03. Governor already rejects Jules when `github_repo` is unset (see `governor.py` `check_jules_gate`). But Coordinator recommends Jules first, wasting an entire pipeline run.*

- [ ] Write `test_coordinator_skips_jules_without_github_repo`:
  - Set `workspace.github_repo = ""` in session context
  - Run Coordinator
  - Assert returned `action_type` is not any Jules action type
- [ ] Write `test_coordinator_recommends_jules_with_github_repo`:
  - Set `workspace.github_repo = "org/repo"`
  - Run Coordinator
  - Assert Jules actions are included in candidates
- [ ] `coordinator.py`: in `propose_intervention` (or wherever action type is selected), add guard: if `action_type` is Jules-type and `workspace.github_repo` is falsy → skip Jules and select next-best action
- [ ] Define `JULES_ACTION_TYPES: frozenset[str]` constant with all Jules action type strings — check against this set
- [ ] Run tests → GREEN

---

## Phase 2 — Final Validation

- [ ] Run `npm run lint` → 0 errors (≤ pre-existing warnings)
- [ ] Run `npm run build` → succeeds
- [ ] Run `uv run ruff check app/` → 0 errors
- [ ] Run `uv run ty check` → 0 new errors vs baseline
- [ ] Run `pytest tests/unit -v` → all GREEN, count ≥ pre-spec count
- [ ] Mark spec 005 as **Closed**

---

## Completion Gate — All 5 Specs Closed

When spec 005 is marked Closed:
- [ ] `make eval-all` → all 5 traces ≥ 0.8
- [ ] App running at Cloud Run public URL
- [ ] Open spec 006 for deployment hardening
