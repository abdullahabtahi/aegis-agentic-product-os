# Validation: 009 — Weekly Founder Brief

## How to Verify

---

### TC-WB-01: GET /brief — Response Shape

```bash
curl "http://localhost:8000/brief?workspace_id=default_workspace"
```

**Expected response shape:**
```json
{
  "workspace_id": "default_workspace",
  "generated_at": "2026-04-28T09:00:00Z",
  "week_label": "Week of April 28, 2026",
  "bets_improving": [...],
  "bets_at_risk": [...],
  "pending_intervention_count": 1,
  "most_urgent_intervention": { ... },
  "weekly_question": "...",
  "total_bets": 2,
  "avg_conviction": 52,
  "scans_this_week": 1
}
```

**Expected**: Response arrives within 300ms (no LLM)

---

### TC-WB-02: GET /brief — No Workspace ID

```bash
curl "http://localhost:8000/brief"
# Expected: 400 with "workspace_id required"

curl "http://localhost:8000/brief?workspace_id=nonexistent"
# Expected: 400 or 404 with appropriate error
```

---

### TC-WB-03: Weekly Question — Kill Criteria Priority

```python
# tests/unit/test_brief_builder.py

from backend.app.app_utils.brief_builder import build_founder_brief

# With triggered kill criteria
bets = [bet_with_kill_criteria_triggered]
result = build_founder_brief("ws1", bets, {}, [])
assert "committed to" in result.weekly_question
assert bet_with_kill_criteria_triggered.kill_criteria.condition in result.weekly_question
```

---

### TC-WB-04: Conviction Delta Computation

```python
# Bet with snapshot 7 days ago (score 50) and latest (score 62)
# Expected: conviction_delta = +12, in bets_improving

# Bet with no prior snapshot
# Expected: conviction_delta = None (not 0)

result = build_founder_brief("ws1", [bet_no_prior], {}, [])
assert result.bets_improving[0].conviction_delta is None
```

---

### TC-WB-05: At-Risk Includes Kill Criteria Triggered

```python
bets = [bet_with_kill_criteria_triggered_and_developing_score]
result = build_founder_brief("ws1", bets, {}, [])

# Even if conviction is "developing" (not critical), triggered kill criteria = at risk
assert any(b.bet_id == bet_with_kill_criteria_triggered_and_developing_score.id
           for b in result.bets_at_risk)
```

---

### TC-WB-06: max 3 Items per Section

```python
# 5 at-risk bets
bets = [make_critical_bet(i) for i in range(5)]
result = build_founder_brief("ws1", bets, {}, [])
assert len(result.bets_at_risk) <= 3
assert len(result.bets_improving) <= 3
```

---

### TC-WB-07: No Bets — Empty Brief

```bash
curl "http://localhost:8000/brief?workspace_id=empty_workspace"
```
**Expected:**
```json
{
  "total_bets": 0,
  "bets_improving": [],
  "bets_at_risk": [],
  "weekly_question": "Declare your first strategic direction to get started.",
  "avg_conviction": null,
  "pending_intervention_count": 0
}
```

---

### TC-WB-08: Chat Panel — First Open of Week Shows BriefCard

1. Clear localStorage for `aegis_brief_week_*` keys
2. Open `/workspace/chat` for the first time this week
3. **Expected**: `BriefCard` appears at the top of the message list
4. **Expected**: Card shows: week label, at least one bet row, weekly question
5. **Expected**: `[Open Inbox →]` and `[View Directions →]` buttons visible

---

### TC-WB-09: Chat Panel — Brief Not Shown When Dismissed

1. See brief card → click `[✕ Dismiss]`
2. **Expected**: Card unmounts immediately
3. Refresh the page or navigate away and back
4. **Expected**: Card does NOT reappear

---

### TC-WB-10: Chat Panel — Brief Reappears Next Week

1. Set localStorage `aegis_brief_week_2026-W18` = `"dismissed"` (simulate this week dismissed)
2. Open chat — **Expected**: no brief card
3. Set localStorage `aegis_brief_week_2026-W19` — remove the key (simulate next week)
4. Open chat — **Expected**: brief card reappears

---

### TC-WB-11: ConvictionDelta Display

1. Bet with `conviction_delta: 12` → **Expected**: `"+12 ↑"` in emerald text
2. Bet with `conviction_delta: -8` → **Expected**: `"-8 ↓"` in red text
3. Bet with `conviction_delta: null` → **Expected**: `"—"` in slate text (not `"+0 ↑"` or `"null"`)

---

### TC-WB-12: BriefCard Links Work

1. Click `[Open Inbox →]` → **Expected**: navigates to `/workspace/inbox`
2. Click `[View Directions →]` → **Expected**: navigates to `/workspace/directions`

---

### TC-WB-13: Brief Does Not Block Chat

1. BriefCard is visible
2. Type a message in the chat input
3. **Expected**: Message sends normally; brief card remains above conversation
4. **Expected**: No error or loading block caused by brief presence

---

### TC-WB-14: Brief Loading State

1. Throttle network to slow 3G (DevTools)
2. Open `/workspace/chat`
3. **Expected**: Brief section shows a skeleton loader (not a blank gap or error)
4. When data arrives: skeleton replaced by `BriefCard`

---

### TC-WB-15: useBrief Cache

1. Navigate to chat page — brief loads
2. Navigate away and back within 1 hour
3. **Expected**: No new API call to `GET /brief` (staleTime = 1h)
4. Wait 1 hour (or mock staleTime in tests)
5. **Expected**: New API call fires

---

## Automated Test Targets

```bash
# Backend unit tests
uv run pytest tests/unit/test_brief_builder.py -v
# Expected: 0 failures covering:
#   - weekly question template selection (all 5 branches)
#   - conviction delta null vs 0
#   - max 3 items per section
#   - no bets empty brief
#   - at_risk includes triggered kill criteria regardless of level

# Full regression
uv run pytest tests/unit -v
npm run build
```
