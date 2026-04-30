# Validation: 008 — Conviction Score

## How to Verify

---

### TC-CS-01: Score Computation — Pure Function

```python
# tests/unit/test_conviction_score.py

# Case: All dimensions met
bet = BetModel(
    kill_criteria=KillCriteria(status="pending", ...),
    success_metrics=[Metric(name="MRR", ...)],
    last_monitored_at=(now - 1 day).isoformat()
)
snapshot = BetSnapshotModel(
    linear_signals=LinearSignals(
        hypothesis_present=True, metric_linked=True,
        bet_coverage_pct=55, chronic_rollover_count=0
    )
)
result = compute_conviction_score(bet, snapshot)
assert result.total == 100
assert result.level == "strong"
assert all(d.met for d in result.dimensions)
```

```python
# Case: Minimal — no kill criteria, no metrics, not scanned recently
bet_empty = BetModel(kill_criteria=None, success_metrics=[], last_monitored_at=None)
snapshot_empty = BetSnapshotModel(
    linear_signals=LinearSignals(
        hypothesis_present=False, metric_linked=False,
        bet_coverage_pct=0, chronic_rollover_count=3
    )
)
result = compute_conviction_score(bet_empty, snapshot_empty)
assert result.total == 0
assert result.level == "critical"
assert not any(d.met for d in result.dimensions)
```

---

### TC-CS-02: Level Boundary Tests

| Input score | Expected level | Test |
|---|---|---|
| 100 | `"strong"` | `total = 100` |
| 80 | `"strong"` | boundary inclusive |
| 79 | `"developing"` | boundary exclusive |
| 55 | `"developing"` | boundary inclusive |
| 54 | `"nascent"` | boundary exclusive |
| 30 | `"nascent"` | boundary inclusive |
| 29 | `"critical"` | boundary exclusive |
| 0 | `"critical"` | zero edge case |

Run: `uv run pytest tests/unit/test_conviction_score.py -v` → all GREEN

---

### TC-CS-03: BetCard — ConvictionLabel Display

1. Navigate to `/workspace/directions` with at least one scanned bet
2. **Expected**: BetCard shows a colored pill instead of a raw number
3. **Expected**: Pill text is one of: `"Strong N"` / `"Developing N"` / `"Nascent N"` / `"Critical N"`
4. **Expected**: `"Strong"` pill is emerald, `"Critical"` pill is red
5. **Expected**: No raw `health_score` number visible on the card

---

### TC-CS-04: ConvictionLabel Null State

1. View a bet that has never been scanned (newly declared)
2. **Expected**: Label shows `"— Unscanned"` in slate color
3. **Expected**: No error thrown; page renders normally

---

### TC-CS-05: ConvictionScoreGauge on BetDetailPage

1. Click into a bet that has been scanned (has a snapshot)
2. **Expected**: Right column shows a `"Conviction Score"` panel with:
   - SVG semicircle arc gauge visible
   - Score number centered in the arc
   - Level label below score (e.g. `"Developing"`)
   - 6 dimension rows visible in fixed order
3. **Expected**: `"Updated X ago"` timestamp visible

---

### TC-CS-06: Dimension Row Rendering

1. On a bet detail page with a known snapshot:
   - `hypothesis_present: true`, `metric_linked: false`, `bet_coverage_pct: 22`
2. **Expected**:
   - `"Hypothesis Present"` row shows `●` filled, `"15/15"`
   - `"Success Metric Defined"` row shows `○` outline, `"0/15"` (both conditions needed)
   - `"Bet Coverage ≥ 40%"` row shows `○` outline, `"11/20"` (22/40*20 ≈ 11)
   - Detail: `"Coverage: 22% (needs 40%)"`

---

### TC-CS-07: Kill Criteria Dimension

1. Declare a bet **with** kill criteria (not waived)
2. Run a scan
3. On bet detail page: **Expected** `"Kill Criteria Defined"` row shows `●` filled, `"20/20"`
4. Declare another bet **without** kill criteria
5. On that bet's detail page: **Expected** `"Kill Criteria Defined"` row shows `○` outline, `"0/20"`

---

### TC-CS-08: Mission Control — Avg Conviction KPI

1. Navigate to `/workspace/mission-control` with 3 bets having scores: 85, 60, 30
2. **Expected**: `"Avg Conviction"` KPI shows `"58"` (rounded average: (85+60+30)/3 = 58.3)
3. **Expected**: `"58"` is colored indigo (Developing threshold 55–79)
4. With no scanned bets: **Expected** `"—"` shown in KPI slot (no divide-by-zero crash)

---

### TC-CS-09: Unscanned Bet in Average

1. 2 bets scanned with scores 80, 60; 1 bet unscanned (conviction_score: null)
2. On Mission Control: **Expected** `"Avg Conviction"` shows `"70"` (average of 80+60 only)
3. **Expected**: denominator is 2, not 3

---

### TC-CS-10: Regression — Existing Tests Pass

```bash
uv run pytest tests/unit -v
# Expected: 0 failures — conviction_score is additive, not a replacement migration
npm run build
# Expected: 0 type errors
```

---

## Automated Test Targets

| Test file | Coverage |
|---|---|
| `tests/unit/test_conviction_score.py` | All 6 dimension rules, boundary thresholds, null signals, pure function guarantees |
| Frontend — ConvictionLabel renders at each level | `npm run test` or Playwright snapshot |
| Frontend — null state no-crash test | Jest unit test on `ConvictionLabel` with null prop |
