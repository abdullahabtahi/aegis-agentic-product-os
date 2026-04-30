# Validation: 010 — 4Ps Pivot Diagnosis

## How to Verify

---

### TC-PD-01: compute_pivot_recommendation — Problem Kills All

```python
# tests/unit/test_pivot_scoring.py

from backend.app.app_utils.pivot_scoring import compute_pivot_recommendation

def test_weak_problem_overrides_to_kill():
    scores = [
        PivotPScore(p="problem", confidence=2, founder_note=""),
        PivotPScore(p="persona", confidence=5, founder_note=""),
        PivotPScore(p="product", confidence=5, founder_note=""),
        PivotPScore(p="positioning", confidence=5, founder_note=""),
    ]
    rec, rationale, weakest = compute_pivot_recommendation(scores)
    assert rec == "kill"
    assert weakest == "problem"

def test_problem_confidence_3_does_not_kill():
    scores = [
        PivotPScore(p="problem", confidence=3, founder_note=""),
        PivotPScore(p="persona", confidence=5, founder_note=""),
        PivotPScore(p="product", confidence=5, founder_note=""),
        PivotPScore(p="positioning", confidence=5, founder_note=""),
    ]
    rec, _, _ = compute_pivot_recommendation(scores)
    assert rec == "stay_course"
```

---

### TC-PD-02: compute_pivot_recommendation — Pivot Thresholds

```python
def test_one_weak_p_is_small_pivot():
    scores = [
        PivotPScore(p="problem", confidence=4, founder_note=""),
        PivotPScore(p="persona", confidence=2, founder_note=""),  # weak
        PivotPScore(p="product", confidence=4, founder_note=""),
        PivotPScore(p="positioning", confidence=4, founder_note=""),
    ]
    rec, _, weakest = compute_pivot_recommendation(scores)
    assert rec == "small_pivot"
    assert weakest == "persona"

def test_three_weak_ps_is_large_pivot():
    scores = [
        PivotPScore(p="problem", confidence=3, founder_note=""),
        PivotPScore(p="persona", confidence=2, founder_note=""),
        PivotPScore(p="product", confidence=2, founder_note=""),
        PivotPScore(p="positioning", confidence=1, founder_note=""),
    ]
    rec, _, _ = compute_pivot_recommendation(scores)
    assert rec == "large_pivot"

def test_all_skipped_is_stay_course():
    scores = [
        PivotPScore(p="problem", confidence=None, founder_note=""),
        PivotPScore(p="persona", confidence=None, founder_note=""),
        PivotPScore(p="product", confidence=None, founder_note=""),
        PivotPScore(p="positioning", confidence=None, founder_note=""),
    ]
    rec, rationale, _ = compute_pivot_recommendation(scores)
    assert rec == "stay_course"
    assert "skipped" in rationale.lower()
```

---

### TC-PD-03: POST /interventions/{id}/pivot-diagnosis — Happy Path

```bash
curl -X POST "http://localhost:8000/interventions/int-001/pivot-diagnosis" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AEGIS_API_KEY" \
  -d '{
    "scores": [
      {"p": "problem", "confidence": 3, "founder_note": "Real but not urgent", "is_weakest": false},
      {"p": "persona", "confidence": 2, "founder_note": "Teams may be better fit", "is_weakest": true},
      {"p": "product", "confidence": 4, "founder_note": "Approach is solid", "is_weakest": false},
      {"p": "positioning", "confidence": 4, "founder_note": "Framing resonates", "is_weakest": false}
    ]
  }'
```

**Expected response (201):**
```json
{
  "id": "pd-...",
  "intervention_id": "int-001",
  "bet_id": "...",
  "conducted_at": "...",
  "scores": [...],
  "recommendation": "small_pivot",
  "recommendation_rationale": "Persona is the weakest lens. Adjust targeting before concluding this bet is dead.",
  "weakest_p": "persona"
}
```

---

### TC-PD-04: POST /interventions/{id}/pivot-diagnosis — Not Found

```bash
curl -X POST "http://localhost:8000/interventions/nonexistent/pivot-diagnosis" \
  -H "Content-Type: application/json" \
  -d '{ "scores": [...] }'
# Expected: 404
```

---

### TC-PD-05: POST /interventions/{id}/pivot-diagnosis — Invalid scores count

```bash
# Only 3 scores provided (must be exactly 4)
curl -X POST "http://localhost:8000/interventions/int-001/pivot-diagnosis" \
  -H "Content-Type: application/json" \
  -d '{ "scores": [{"p": "problem", "confidence": 3, "founder_note": "", "is_weakest": false}] }'
# Expected: 422 Unprocessable Entity
```

---

### TC-PD-06: Conversational Trigger — "Should I kill?"

1. Open `/workspace/chat`
2. Type: `"Should I kill Voice Capture?"`
3. **Expected**: Agent responds with an opening 4Ps question about the Problem lens (not a generic response)
4. **Expected**: Agent mentions the bet name in the response
5. **Expected**: Agent mentions "1–5" or "confidence" in the question

---

### TC-PD-07: Conversational Session — Full 4 Questions

1. Continue from TC-PD-06
2. Answer Problem: `"3 — it's real but maybe not urgent"`
3. **Expected**: Agent acknowledges and asks Persona question
4. Answer Persona: `"2 — probably teams, not solo founders"`
5. Answer Product: `"4"`
6. Answer Positioning: `"skip"`
7. **Expected**: Agent shows diagnosis summary in chat: 4 scores, recommendation badge, rationale
8. **Expected**: Diagnosis appears on the intervention ApprovalCard in Inbox

---

### TC-PD-08: PivotDiagnosisCard — Weakest P Highlighted

1. Navigate to `/workspace/inbox`
2. Find an intervention that has a `pivot_diagnosis`
3. **Expected**: PivotDiagnosisCard is visible below the blast radius section
4. **Expected**: The row with `is_weakest: true` has amber left border (`border-l-2 border-amber-400`)
5. **Expected**: Other rows have no border highlight

---

### TC-PD-09: PivotRecommendationBadge Colors

| Recommendation | Expected badge color class |
|---|---|
| `stay_course` | `bg-emerald-50 text-emerald-700` |
| `small_pivot` | `bg-indigo-50 text-indigo-700` |
| `large_pivot` | `bg-amber-50 text-amber-700` |
| `kill` | `bg-red-50 text-red-700` |

Verify by inspecting badge element in DevTools for each value.

---

### TC-PD-10: BetDetailPage — Strategic Diagnosis Panel

1. Complete a pivot diagnosis for a bet
2. Navigate to `/workspace/directions/{bet_id}`
3. **Expected**: A section titled `"Strategic Diagnosis"` appears
4. **Expected**: Section contains `PivotDiagnosisCard` with `conducted_at` timestamp
5. **Expected**: No `"Strategic Diagnosis"` section for bets without a diagnosis

---

### TC-PD-11: Skip Handling

1. In chat, answer a question with `"skip"`
2. **Expected**: Agent moves to the next question without recording a confidence score
3. After completing session: response has `confidence: null` for skipped P (not `0`)
4. In `PivotScoreRow`: skipped P shows `"—"` and `"skipped"` label (not `"0/5"`)

---

### TC-PD-12: No Regression — ApprovalCard Without Diagnosis

1. Find an intervention in inbox that does NOT have `pivot_diagnosis`
2. **Expected**: `ApprovalCard` renders exactly as before (no placeholder, no empty section)
3. **Expected**: Approve/Reject buttons are in same position as before

---

### TC-PD-13: PivotScoreRow — Note Truncation

1. Submit a diagnosis with founder_note > 60 characters (e.g. 80-char note)
2. View `PivotDiagnosisCard`
3. **Expected**: Note truncated at 60 chars with `…`
4. **Expected**: Full note visible on hover (`title` attribute present)

---

## Automated Test Targets

```bash
# Backend unit tests
uv run pytest tests/unit/test_pivot_scoring.py -v
# Expected: 0 failures covering:
#   - problem confidence ≤ 2 → kill (including exactly 2)
#   - problem confidence 3 does not trigger kill
#   - 1 weak P → small_pivot
#   - 2 weak Ps → small_pivot  
#   - 3 weak Ps → large_pivot
#   - all Ps skipped → stay_course with "skipped" rationale
#   - null confidence excluded from weak-P count
#   - weakest_p tiebreaker order (Problem > Persona > Product > Positioning)

# Full regression
uv run pytest tests/unit -v
npm run build
```
