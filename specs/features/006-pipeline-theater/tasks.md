# Tasks — 006 Pipeline Theater

**Convention:** [P] = can run in parallel with other [P] tasks. Sequential otherwise.

---

## Phase 1 — Backend: forward debate state

**Context:** `_run_sub_pipeline` returns `cynic_assessment` and `optimist_assessment` in its state dict but they are not in the forwarding loop in `run_pipeline_scan`.

### Implementation
- [ ] `backend/app/agents/conversational.py` — add `"cynic_assessment"` and `"optimist_assessment"` to the `for key in (...)` forwarding loop in `run_pipeline_scan`

### Verify
- [ ] `uv run python -c "import ast, pathlib; ast.parse(pathlib.Path('app/agents/conversational.py').read_text()); print('OK')"` → OK

---

## Phase 2 — Frontend: types + chat page [P]

### 2a — Types [P]
- [ ] `frontend/lib/types.ts` — add to `AegisPipelineState`:
  - `cynic_assessment?: { risk_type: string; severity: string; confidence: number; evidence_summary: string; key_concerns: string; perspective: "cynic" }`
  - `optimist_assessment?: { risk_type: string; confidence: number; mitigating_factors: string; adjusted_severity: string; perspective: "optimist" }`
  - `policy_checks?: Array<{ check_name: string; passed: boolean; reason?: string | null }>`

### 2b — Chat page [P]
- [ ] Create `frontend/app/workspace/chat/page.tsx` — copy of existing `/workspace/page.tsx` (hero + chat mode, no changes to behaviour)

### Verify
- [ ] `npm run build` → 0 TypeScript errors

---

## Phase 3 — Frontend: Pipeline Theater page [P with 4]

- [ ] Rewrite `frontend/app/workspace/page.tsx` as Pipeline Theater:
  - Header: "Aegis Pipeline" title + last run timestamp + pipeline_status badge
  - 5-column stage cards (reuse `PipelineStageCard` from mission-control)
  - Stage 2 (Product Brain): expandable `DebatePanel` showing cynic/optimist/synthesis
  - Stage 4 (Governor): expandable `GovernorChecklist` showing 8 policy checks
  - "Active Directions" section: direction cards with "Scan ▶" button per card
  - "Scan ▶" calls `sendMessage("Scan my <bet.name> direction for risks")` via `useChatController`

---

## Phase 4 — Frontend: Sidebar + layout updates [P with 3]

- [ ] `frontend/components/layout/Sidebar.tsx`:
  - Add `{ href: "/workspace/chat", icon: MessageSquare, label: "Chat" }` to `NAV_ITEMS` (after Home)
  - Import `MessageSquare` from lucide-react
- [ ] `frontend/components/layout/GlassmorphicLayout.tsx`:
  - Change `router.push(\`/workspace?session=${sessionId}\`)` → `router.push(\`/workspace/chat?session=${sessionId}\`)`
  - Change `router.push("/workspace")` in `handleNewSession` → `router.push("/workspace/chat")`

---

## Phase 5 — Final validation

- [ ] `npm run build` → ✓ Compiled successfully, 0 TypeScript errors
- [ ] All 13+ routes compiled (new /workspace/chat route present)
- [ ] `uv run python -c "import ast, pathlib; ast.parse(pathlib.Path('app/agents/conversational.py').read_text()); print('OK')"` → OK
- [ ] Mark spec 006 as **Closed**
