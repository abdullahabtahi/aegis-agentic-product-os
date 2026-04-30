# Requirements: 007 — Kill Criteria Declaration

---

## Schema Requirements

### SR-001: KillCriteria Value Object
- Add to `context/data-schema.ts` **before** any implementation:
  ```typescript
  export type KillCriteriaAction = "pivot" | "kill" | "extend"
  export type KillCriteriaStatus = "pending" | "triggered" | "met" | "waived"
  export interface KillCriteria {
    condition: string
    deadline: string              // ISO 8601 date (date-only, not datetime)
    committed_action: KillCriteriaAction
    status: KillCriteriaStatus    // default "pending"; computed by Signal Engine
    triggered_at?: string
    waived_at?: string
    waived_reason?: string
  }
  ```
- Add `kill_criteria?: KillCriteria` to the `Bet` interface (optional — not all bets have one)
- Backend `schema.py` must mirror with `Optional[KillCriteriaModel] = None`

**Edge cases:**
- `deadline` is a past date at declaration time → backend rejects with 400: `"Kill criteria deadline cannot be in the past"`
- `condition` is empty string → backend rejects with 422
- `kill_criteria` absent or null → all existing behavior unchanged; Signal Engine skips evaluation

---

## Frontend Requirements

### FR-KC-01: BetDeclarationModal — Kill Criteria Step
- After the existing basic info fields, add Step 2 "Set Kill Criteria"
- Step indicator: `"Step 1 of 2"` / `"Step 2 of 2"` shown above the form header
- Step 2 renders:
  - `<textarea>` labelled `"This bet is failing if..."` — placeholder: `"e.g. We haven't shipped to 3 paying users by May 1"`; max 200 chars; `rows={3}`
  - Date input labelled `"Deadline"` — date-only picker; min value = tomorrow; initial value = `time_horizon` if set, else empty
  - Radio group labelled `"If triggered, I will:"` with options: `"Pivot the approach"` / `"Kill the bet"` / `"Extend and reassess"` — default: `"kill"`
- "Skip →" link visible at top-right of Step 2 header — skips kill criteria entirely; submits the bet without it
- "Back" button returns to Step 1 without losing data
- "Declare Direction →" button on Step 2 submits the bet with `kill_criteria` included

**Edge cases:**
- User fills condition but leaves deadline empty → "Declare Direction" disabled with inline error: `"Deadline required when condition is set"`
- User fills deadline but leaves condition empty → same: `"Condition required when deadline is set"`
- Both empty → treated as "Skip" silently (user typed nothing, not an error)
- `time_horizon` is before today → deadline input min is still tomorrow regardless

---

### FR-KC-02: KillCriteriaStatusBadge Component
- Renders a pill chip based on `bet.kill_criteria?.status`:
  - `"pending"` → `bg-slate-100 text-slate-600 border-slate-200` label: `"MONITORING"`
  - `"triggered"` → `bg-red-50 text-red-700 border-red-200 ring-2 ring-red-400/30` label: `"TRIGGERED"`; `animate-pulse` on the ring for 3 iterations
  - `"met"` → `bg-emerald-50 text-emerald-700 border-emerald-200` label: `"MET"`
  - `"waived"` → `bg-slate-50 text-slate-500 border-slate-100` label: `"WAIVED"`
- When `kill_criteria` is absent: badge not rendered; do not show `"NO CRITERIA"` placeholder
- Badge includes a `<AlertTriangle size={10}>` icon for `"triggered"` status only

---

### FR-KC-03: KillCriteriaCard on Directions Page
- Below each `BetCard`, if `bet.kill_criteria` is present, render `KillCriteriaCard`:
  - Condition text: `"This bet is failing if: {condition}"`
  - Deadline countdown: compute `Math.ceil((new Date(deadline) - new Date()) / 86400000)`:
    - Positive: `"{n} day(s) remaining"`
    - Zero: `"Due today"`
    - Negative: `"Overdue by {|n|} day(s)"` — in `text-red-600`
  - Committed action: `"Committed response: {pivot the approach | kill the bet | extend and reassess}"`
  - When status === "triggered": full card gets `border-l-4 border-red-400 bg-red-50/30`
  - When status === "met": card gets `border-l-4 border-emerald-400 bg-emerald-50/30`
- Card is read-only — no editing in MVP

**Edge cases:**
- `deadline` is malformed (not ISO date) → render `"Deadline unknown"` without throwing
- Countdown shows `"1 day remaining"` not `"1 days remaining"` (singular/plural)

---

### FR-KC-04: KillCriteriaTriggeredAlert Banner
- On the `/workspace/directions` page, when **any** bet has `kill_criteria.status === "triggered"`:
  - Show a dismissible banner at the top of the page above the bet grid:
    ```
    ⚠  Kill criteria triggered on "{bet.name}" — you said: "{condition}"
       [View Intervention →]
    ```
  - `bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3`
  - "View Intervention →" links to `/workspace/inbox`
  - `✕` dismiss button — dismisses for the session only (localStorage key: `aegis_kc_alert_dismissed_{bet.id}`)
  - If multiple bets triggered: show separate banners per bet (stacked)

**Edge cases:**
- No triggered bets → banner not rendered
- Dismissed via `✕` → banner stays dismissed until page refresh closes localStorage key expiry

---

## Backend Requirements

### BR-KC-01: POST /bets — Accept kill_criteria
- Accept optional `kill_criteria: KillCriteriaPayload` in request body
- Validate: if `kill_criteria` present → `condition` non-empty + `deadline` > today
- Persist `kill_criteria` as JSONB in `bets.kill_criteria` column
- Return the saved `kill_criteria` in the response with `status: "pending"`

---

### BR-KC-02: GET /bets — Compute kill_criteria_status
- For each bet with `kill_criteria`:
  - If `status === "pending"` AND `today >= deadline` AND no recent intervention with type `kill_bet | pre_mortem_session` is `accepted`:
    → return `status: "triggered"` (computed at read time — not persisted on every GET; persisted only when Signal Engine fires)
  - Otherwise return stored status

---

### BR-KC-03: Signal Engine — Kill Criteria Evaluation
- On each scan cycle, for each bet with `kill_criteria` and `status === "pending"`:
  - If `today >= deadline`:
    - Append evidence: `{ type: "kill_criteria_triggered", description: f"Kill criteria deadline reached: '{condition}' (committed action: {committed_action})", observed_value: days_overdue, threshold_value: 0 }`
    - Update `kill_criteria.status = "triggered"` in DB
    - Set `kill_criteria.triggered_at = now()`
  - The evidence type `"kill_criteria_triggered"` is passed through to Product Brain as a high-confidence signal

**Edge cases:**
- Signal Engine scans a bet with `kill_criteria.status === "triggered"` already → skip re-evaluation (idempotent)
- `kill_criteria.status === "met"` → skip evaluation (founder already fulfilled the condition)
- `kill_criteria.status === "waived"` → skip evaluation

---

### BR-KC-04: Coordinator — kill_criteria_triggered Routing
- When input evidence includes type `"kill_criteria_triggered"`:
  - Coordinator MUST select one of: `kill_bet` or `pre_mortem_session`
  - Instruction explicitly states: `"kill_criteria_triggered evidence always routes to kill_bet or pre_mortem_session — never to clarify_bet, add_metric, or lower-level interventions"`
  - Intervention `rationale` must quote the original `condition` text: `"Founder committed: '{condition}'. Deadline was {deadline}."`

---

## Acceptance Criteria

| ID | Criterion |
|---|---|
| AC-001 | Declaring a bet with kill criteria → criteria visible on Directions page |
| AC-002 | Kill criteria with past deadline rejected at submission time |
| AC-003 | Signal Engine sets status to "triggered" when deadline passes |
| AC-004 | Triggered bet shows red banner + TRIGGERED badge on Directions page |
| AC-005 | Triggered status routes intervention to `kill_bet` or `pre_mortem_session` |
| AC-006 | "Skip" in Step 2 → bet declared without kill criteria; no error |
| AC-007 | Intervention rationale quotes the founder's own condition text |
| AC-008 | `kill_criteria` absent on bet → no regressions in existing behavior |
