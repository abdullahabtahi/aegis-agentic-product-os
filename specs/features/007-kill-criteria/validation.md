# Validation: 007 — Kill Criteria Declaration

## How to Verify

All manual test cases assume: backend running (`uv run uvicorn app.main:app --reload`), frontend running (`npm run dev`), workspace ID set.

---

### TC-KC-01: Declaration Modal — Step Flow

1. Open `/workspace` → click "Declare a Direction"
2. **Expected**: Step 1 shows with header `"Step 1 of 2"` and existing fields (name, target segment, etc.)
3. Fill in name: `"Voice Capture"`, target segment: `"Solo founders"`, problem statement: `"Users lose meeting context"`
4. Click "Next →" (or equivalent step advance)
5. **Expected**: Step 2 appears with header `"Step 2 of 2: Set Kill Criteria"`
6. **Expected**: Step 2 has textarea `"This bet is failing if..."`, date input `"Deadline"`, radio group with 3 options, `"Skip →"` link, `"Back"` button, `"Declare Direction →"` button

---

### TC-KC-02: Skipping Kill Criteria

1. In Step 2, click `"Skip →"` without filling any fields
2. **Expected**: Modal closes, bet is created, success toast shown
3. **Expected**: Bet appears on Directions page **without** a Kill Criteria card below it
4. **Expected**: `KillCriteriaStatusBadge` is NOT rendered on the BetCard
5. `GET /bets` response → `kill_criteria` field is `null` or absent

---

### TC-KC-03: Declaring with Kill Criteria — Happy Path

1. In Step 2, enter condition: `"We haven't shipped to 3 paying users"`, set deadline to 2 weeks from today, select `"Kill the bet"`
2. Click `"Declare Direction →"`
3. **Expected**: Modal closes, bet created with kill criteria
4. Navigate to `/workspace/directions`
5. **Expected**: BetCard for "Voice Capture" shows `MONITORING` badge (slate pill)
6. **Expected**: Below the card, `KillCriteriaCard` shows:
   - `"This bet is failing if: We haven't shipped to 3 paying users"`
   - `"X days remaining"` (countdown to deadline)
   - `"Committed response: Kill the bet"`

---

### TC-KC-04: Past Deadline Rejection

1. In Step 2, enter a valid condition, set deadline to **yesterday's date**
2. Click `"Declare Direction →"`
3. **Expected**: `POST /bets` returns 400
4. **Expected**: Modal shows inline error: `"Kill criteria deadline cannot be in the past"`
5. **Expected**: Modal remains open; form data not cleared

---

### TC-KC-05: Partial Fill Validation

1. Enter condition text but leave deadline empty
2. Click `"Declare Direction →"`
3. **Expected**: Button stays disabled OR inline error: `"Deadline required when condition is set"`
4. Clear condition, enter deadline only
5. **Expected**: Same error: `"Condition required when deadline is set"`

---

### TC-KC-06: Signal Engine Triggers on Deadline Pass

1. Create a bet with kill criteria — deadline set to **today** (the earliest allowed)
2. Wait for next scan cycle (or manually trigger scan)
3. **Expected**: `GET /bets` response shows `kill_criteria.status: "triggered"` and `kill_criteria.triggered_at` is set
4. **Expected**: On Directions page, badge changes from `MONITORING` (slate) to `TRIGGERED` (red pulsing)
5. **Expected**: Red `KillCriteriaTriggeredAlert` banner appears at top of Directions page quoting the condition

---

### TC-KC-07: TRIGGERED Badge Visual

1. With a triggered bet open on Directions page:
2. **Expected**: Badge pill is `bg-red-50 text-red-700 border-red-200` with `TRIGGERED` label
3. **Expected**: Ring pulses for ~3 cycles then stops (`animate-pulse` with `animation-iteration-count: 3`)
4. **Expected**: `<AlertTriangle>` icon visible in badge
5. **Expected**: `KillCriteriaCard` for the triggered bet has `border-l-4 border-red-400 bg-red-50/30`

---

### TC-KC-08: Alert Banner Dismiss

1. With triggered bet, alert banner is visible
2. Click `✕` dismiss button
3. **Expected**: Banner disappears from current session
4. Refresh the page
5. **Expected**: Banner reappears (localStorage key cleared on reload by spec — session-only dismiss)

---

### TC-KC-09: Intervention Routes to kill_bet

1. Scan completes with kill criteria triggered
2. Navigate to `/workspace/inbox`
3. **Expected**: Intervention card exists with action type `kill_bet` or `pre_mortem_session`
4. **Expected**: Rationale field quotes the founder's exact condition text
5. **Expected**: Rationale format: `"Founder committed: '[condition]'. Deadline was [deadline]."`

---

### TC-KC-10: Back Navigation Preserves Data

1. In Step 2, fill in condition and deadline
2. Click "Back"
3. **Expected**: Step 1 is shown with all previously entered data intact
4. Click "Next →"
5. **Expected**: Step 2 re-shows with condition and deadline still populated

---

### TC-KC-11: MET Status Display

1. Manually set `kill_criteria.status = "met"` in DB (or simulate via backend)
2. Refresh Directions page
3. **Expected**: Badge shows `MET` in `bg-emerald-50 text-emerald-700 border-emerald-200`
4. **Expected**: `KillCriteriaCard` has `border-l-4 border-emerald-400 bg-emerald-50/30`
5. **Expected**: No alert banner rendered (only triggered status shows banner)

---

### TC-KC-12: Regression — Existing Bets Unaffected

1. Bets declared before this feature (no `kill_criteria`) load on Directions page
2. **Expected**: No `KillCriteriaCard` rendered, no `KillCriteriaStatusBadge`, no banner
3. **Expected**: All existing BetCard fields, health score, and other elements render correctly
4. Run `uv run pytest tests/unit -v` → **Expected**: 0 failures

---

## Automated Test Targets

| Test file | What to cover |
|---|---|
| `tests/unit/test_kill_criteria_schema.py` | KillCriteria Pydantic model validation, past-deadline rejection |
| `tests/unit/test_kill_criteria_signal.py` | Signal Engine evaluation logic — triggered/pending/met/waived paths |
| `tests/unit/test_kill_criteria_coordinator.py` | Coordinator routes `kill_criteria_triggered` evidence to correct action types |

## curl Verification

```bash
# Declare bet with kill criteria
curl -X POST http://localhost:8000/bets \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "default_workspace",
    "name": "Voice Capture",
    "target_segment": "Solo founders",
    "problem_statement": "Users lose meeting context",
    "hypothesis": "Voice capture will retain context",
    "kill_criteria": {
      "condition": "Ship to 3 paying users",
      "deadline": "2026-05-15",
      "committed_action": "kill"
    }
  }'
# Expected: 200, kill_criteria.status = "pending"

# Past deadline — should fail
curl -X POST http://localhost:8000/bets \
  -H "Content-Type: application/json" \
  -d '{"workspace_id":"default_workspace","name":"Test","target_segment":"Founders","problem_statement":"Test","kill_criteria":{"condition":"Test","deadline":"2026-04-01","committed_action":"kill"}}'
# Expected: 400, "Kill criteria deadline cannot be in the past"
```
