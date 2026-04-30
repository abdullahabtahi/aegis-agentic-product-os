# Requirements: 010 — 4Ps Pivot Diagnosis

---

## Schema Requirements

### SR-PD-001: PivotDiagnosis Value Object
Add to `context/data-schema.ts` **before** any implementation:

```typescript
export type PivotRecommendation = "stay_course" | "small_pivot" | "large_pivot" | "kill"

export interface PivotPScore {
  p: "problem" | "persona" | "product" | "positioning"
  label: string
  confidence: number | null    // 1–5; null when skipped
  founder_note: string         // empty string when not provided, never null
  is_weakest: boolean
}

export interface PivotDiagnosis {
  id: string
  intervention_id: string
  bet_id: string
  conducted_at: string
  scores: PivotPScore[]         // always 4 items, one per P
  recommendation: PivotRecommendation
  recommendation_rationale: string
  weakest_p: "problem" | "persona" | "product" | "positioning"
}
```

Add to `Intervention` interface:
```typescript
pivot_diagnosis?: PivotDiagnosis  // null until a diagnosis session is completed
```

**Edge cases:**
- `confidence` is `null` for skipped questions — never coerce to `0`
- All 4 questions skipped → `recommendation = "stay_course"` (insufficient data; cannot recommend pivot)

---

## Backend Requirements

### BR-PD-001: compute_pivot_recommendation() Pure Function
- Location: `backend/app/app_utils/pivot_scoring.py`
- Signature: `def compute_pivot_recommendation(scores: list[PivotPScore]) -> tuple[PivotRecommendation, str, str]`
  - Returns `(recommendation, rationale, weakest_p)`
- Logic (null scores excluded from comparisons; null treated as "not evaluated"):
  1. If `problem.confidence` is not null AND `problem.confidence <= 2` → `"kill"` (overrides all)
  2. Count of non-null scores ≤ 2: 0 → `"stay_course"`, 1–2 → `"small_pivot"`, 3–4 → `"large_pivot"`
  3. `weakest_p` = P with lowest non-null confidence (ties broken by order: Problem > Persona > Product > Positioning)
  4. If all confidences are null (all skipped) → `"stay_course"` with rationale `"Insufficient data — all questions were skipped"`

**Rationale templates per recommendation:**
- `stay_course`: `"Strong conviction across all four lenses. The issue may be execution, not strategy."`
- `small_pivot`: `"{weakest_p_label} is the weakest lens. Adjust targeting before concluding this bet is dead."`
- `large_pivot`: `"Multiple foundational assumptions are weak. A significant rethink is warranted."`
- `kill`: `"If the problem isn't genuinely painful enough, no other adjustment saves the bet."`

**Edge cases:**
- Problem confidence = 2 (exactly) → `"kill"` (threshold is ≤ 2, inclusive)
- Problem confidence = 3, two other Ps = 1 → `"large_pivot"` (problem alone doesn't trigger kill; counts 2 weak Ps)
- Problem confidence = null (skipped), two other Ps = 1 → `"large_pivot"` (can't trigger kill without problem score)

---

### BR-PD-002: POST /interventions/{id}/pivot-diagnosis Endpoint
- Accepts `PivotDiagnosisPayload` (all `PivotPScore` data)
- Computes recommendation via `compute_pivot_recommendation`
- Persists to `interventions.pivot_diagnosis` JSONB column via `repository.save_pivot_diagnosis`
- Returns full `PivotDiagnosis` including computed `recommendation`, `rationale`, `weakest_p`
- `intervention_id` not found → 404
- `scores` array must have exactly 4 items (one per P) → 422 otherwise

---

### BR-PD-003: run_pivot_diagnosis Tool (conversational.py)
- Tool: `run_pivot_diagnosis(bet_id: str, intervention_id: str | None) → str`
- Behavior: sets `tool_context.state["pivot_diagnosis_active"] = True` and `tool_context.state["pivot_bet_id"] = bet_id`
- Returns a formatted opening message for the agent to relay to the founder
- Does NOT run all 4 questions in one turn — the agent handles each turn conversationally

- Tool: `record_p_score(p: Literal["problem", "persona", "product", "positioning"], confidence: int | None, note: str) → str`
  - Appends to `tool_context.state["pivot_scores"]` list
  - Returns `"Recorded"` (agent then asks next question)

- Tool: `save_pivot_diagnosis(intervention_id: str) → str`
  - Called after all 4 Ps recorded (or user types "done")
  - Reads `tool_context.state["pivot_scores"]`
  - Calls `compute_pivot_recommendation` 
  - Posts to `POST /interventions/{id}/pivot-diagnosis`
  - Returns formatted diagnosis summary string for agent to relay
  - Clears `pivot_diagnosis_active` and `pivot_scores` from state

**Trigger conditions (agent must call `run_pivot_diagnosis` when):**
- User message contains any of: `"should I kill"`, `"should I pivot"`, `"what's wrong with"`, `"worth continuing"`, `"give up on"`
- Pipeline state has `kill_criteria_triggered` evidence AND `strategy_unclear` risk type together

**Edge cases:**
- `intervention_id` is None → diagnosis saved without linking to intervention; `PivotDiagnosis.intervention_id` = `null`
- User navigates away mid-session → `pivot_scores` state lost; partial diagnosis not saved; no error surfaced to user
- User types "skip" as answer → `record_p_score(p, confidence=None, note="")` called

---

## Frontend Requirements

### FR-PD-01: PivotScoreRow Component
- Renders one P with:
  - Label: e.g. `"Problem"`, `"Persona"` in `text-sm font-medium`
  - 5-dot confidence scale: filled dots `●` up to `confidence`; outline dots `○` for remainder
  - Filled dots: `text-indigo-600`; outline dots: `text-slate-300`
  - When `confidence === null` (skipped): show `"—"` in slate and `text-xs italic "skipped"`
  - Founder note excerpt: `text-[11px] text-muted-foreground` (truncated to 60 chars; full text in `title` attribute)
  - `is_weakest: true` → row highlighted with `bg-amber-50/50 border-l-2 border-amber-400 rounded-r text-amber-800`

**Edge cases:**
- `confidence = 6` (invalid from backend) → cap display at 5 filled dots; no crash
- `founder_note` > 60 chars → truncated with `…`; full note in `title` attribute

---

### FR-PD-02: PivotRecommendationBadge Component
- Pill chip by recommendation:
  - `stay_course` → `bg-emerald-50 text-emerald-700 border-emerald-200` label: `"STAY COURSE"`
  - `small_pivot` → `bg-indigo-50 text-indigo-700 border-indigo-200` label: `"SMALL PIVOT"`
  - `large_pivot` → `bg-amber-50 text-amber-700 border-amber-200` label: `"LARGE PIVOT"`
  - `kill` → `bg-red-50 text-red-700 border-red-200` label: `"KILL"`

---

### FR-PD-03: PivotDiagnosisCard Component
- Header: `"4Ps Pivot Diagnosis"` + `<PivotRecommendationBadge>` + `conducted_at` relative time
- Body: 4 × `<PivotScoreRow>` in order: Problem, Persona, Product, Positioning
- Footer: `recommendation_rationale` text in `text-sm text-muted-foreground italic`
- Card uses `glass-panel` styling (existing class)
- Width: full-width of parent container

---

### FR-PD-04: ApprovalCard — Show PivotDiagnosisCard
- If `intervention.pivot_diagnosis` is present:
  - Render `<PivotDiagnosisCard>` between the blast radius section and the approve/reject buttons
- If absent: no placeholder; ApprovalCard renders as before

---

### FR-PD-05: BetDetailPage — Show PivotDiagnosis
- In `/workspace/directions/[id]`:
  - Query `GET /interventions?bet_id={id}` (existing endpoint)
  - If any intervention has `pivot_diagnosis`: render the most recent `PivotDiagnosisCard` in a dedicated panel
  - Panel title: `"Strategic Diagnosis"`
  - When no diagnosis exists: panel not rendered (not an empty state section)

---

## Acceptance Criteria

| ID | Criterion |
|---|---|
| AC-001 | `compute_pivot_recommendation` is a pure function with unit-testable inputs/outputs |
| AC-002 | Problem confidence ≤ 2 always produces `"kill"` recommendation |
| AC-003 | All 4 questions skipped → `"stay_course"` (insufficient data) |
| AC-004 | Diagnosis saved to `interventions.pivot_diagnosis` JSONB column |
| AC-005 | Agent offers 4Ps session when user asks "should I kill this bet?" |
| AC-006 | Skip handling: `confidence = null` (not 0) for skipped questions |
| AC-007 | `PivotDiagnosisCard` renders on ApprovalCard when diagnosis present |
| AC-008 | Weakest P row highlighted with amber left border |
| AC-009 | `PivotRecommendationBadge` colors correct for all 4 recommendation values |
| AC-010 | No regression: interventions without `pivot_diagnosis` render identically to before |
