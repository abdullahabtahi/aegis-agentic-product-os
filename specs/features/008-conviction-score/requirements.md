# Requirements: 008 — Conviction Score

---

## Schema Requirements

### SR-CS-001: ConvictionScore Value Object
Add to `context/data-schema.ts` **before** any implementation:

```typescript
export type ConvictionLevel = "strong" | "developing" | "nascent" | "critical"

export interface ConvictionDimension {
  id: string                      // e.g. "kill_criteria_defined"
  label: string                   // e.g. "Kill Criteria Defined"
  earned: number                  // points actually earned
  max: number                     // maximum points available
  met: boolean                    // earned === max
  detail?: string                 // optional context: "Coverage: 38% (needs 40%)"
}

export interface ConvictionScore {
  total: number                   // 0–100; sum of all dimension earned values
  level: ConvictionLevel          // derived from total thresholds
  dimensions: ConvictionDimension[]  // all 6 dimensions, always present
  computed_at: string             // ISO 8601
}
```

Add to `BetSnapshot`:
```typescript
conviction_score: ConvictionScore | null  // null when no scan data available yet
```

**Edge cases:**
- `BetSnapshot` created before this feature ships → `conviction_score` is `null`; frontend renders gracefully with `"—"` placeholder
- Score computation fails (e.g. null linear_signals) → set `conviction_score: null`; never set to `0` (ambiguous)

---

## Backend Requirements

### BR-CS-001: compute_conviction_score() Pure Function
- Location: `backend/app/agents/signal_engine.py` (or `backend/app/app_utils/scoring.py`)
- Signature: `def compute_conviction_score(bet: BetModel, snapshot: BetSnapshotModel) -> ConvictionScore`
- Must be a **pure function** — no DB reads, no side effects
- Inputs from `bet`: `kill_criteria`, `success_metrics`
- Inputs from `snapshot`: `linear_signals` (`hypothesis_present`, `metric_linked`, `bet_coverage_pct`, `chronic_rollover_count`), `status`, `captured_at`
- Inputs from `bet`: `last_monitored_at`

Dimension rules:
1. `kill_criteria_defined` → 20 pts if `bet.kill_criteria` is not None and `kill_criteria.status != "waived"`
2. `hypothesis_present` → 15 pts if `linear_signals.hypothesis_present is True`
3. `success_metric_defined` → 15 pts if `len(bet.success_metrics) > 0` AND `linear_signals.metric_linked is True`; 8 pts if only one is true; 0 pts if neither
4. `bet_coverage` → 20 pts if `bet_coverage_pct >= 40`; `round(linear_signals.bet_coverage_pct / 40 * 20)` capped at 20 if below; 0 pts if `bet_coverage_pct == 0`
5. `no_chronic_rollovers` → 15 pts if `chronic_rollover_count == 0`; 7 pts if `chronic_rollover_count == 1`; 0 pts otherwise
6. `recently_scanned` → 15 pts if `last_monitored_at` within last 7 days; 7 pts if within 14 days; 0 pts otherwise

Level thresholds: `>= 80` → "strong"; `>= 55` → "developing"; `>= 30` → "nascent"; `< 30` → "critical"

Dimension detail strings (optional but recommended for UI):
- `bet_coverage`: `"Coverage: {pct}% (needs 40%)"`
- `recently_scanned`: `"Last scan: {relative_time}"`
- `no_chronic_rollovers`: `"Chronic rollovers: {count}"`

**Edge cases:**
- `linear_signals` is None (scan errored) → all signal-dependent dimensions earn 0 pts; `recently_scanned` still evaluated from `last_monitored_at`
- `bet_coverage_pct` > 100 (data bug) → cap at 100 before computing
- All 6 dimensions at 0 → score is 0, level is "critical" — valid state

---

### BR-CS-002: BetSnapshot Stores conviction_score
- `compute_conviction_score` called after Signal Engine computes `health_score`
- Result stored in `bet_snapshots.conviction_score` column as JSONB
- `GET /bets` response: include `latest_snapshot.conviction_score` per bet

---

## Frontend Requirements

### FR-CS-01: ConvictionLabel Component
- Render a compact pill: `"{level_label} {total}"` — e.g. `"Strong 88"`, `"Nascent 31"`
- Level label capitalized: `"Strong"`, `"Developing"`, `"Nascent"`, `"Critical"`
- Color by level:
  - `strong` → `bg-emerald-50 text-emerald-700 border-emerald-200`
  - `developing` → `bg-indigo-50 text-indigo-700 border-indigo-200`
  - `nascent` → `bg-amber-50 text-amber-700 border-amber-200`
  - `critical` → `bg-red-50 text-red-700 border-red-200`
- When `conviction_score` is null → render `"— Unscanned"` in slate

**Edge cases:**
- Score of exactly 80 → "Strong" (boundary inclusive at 80)
- Score of exactly 55 → "Developing"
- Score of 0 → "Critical 0" (not "Critical")

---

### FR-CS-02: ConvictionScoreGauge Component
- SVG semicircle arc gauge (180°):
  - Track arc: `stroke-slate-100`
  - Fill arc: color matches level (`emerald` / `indigo` / `amber` / `red`)
  - Arc fill calculated as: `(total / 100) * 180` degrees
  - Score centered inside arc: `text-3xl font-bold`
  - Level label below score: `text-sm text-muted-foreground`
- Below the arc: `ConvictionDimensionRow` × 6, in fixed order:
  1. Kill Criteria Defined
  2. Hypothesis Present
  3. Success Metric Defined
  4. Bet Coverage ≥ 40%
  5. No Chronic Rollovers
  6. Scanned Within 7 Days
- Each `ConvictionDimensionRow`:
  - `●` (filled) in level color when `met: true`; `○` (outline) in slate when `met: false`
  - Label text in `text-sm`
  - Points: `text-xs text-muted-foreground` right-aligned: `"20/20"` or `"8/15"`
  - Optional `detail` string: `text-[11px] text-muted-foreground` below label
- When `conviction_score` is null: gauge not rendered; show skeleton with `animate-pulse`

**Edge cases:**
- Score 100 → arc fills exactly 180° (no overflow)
- Score 0 → arc shows empty track only; score `"0"` centered
- `dimensions` array has fewer than 6 items (schema mismatch) → render available items, show `"—"` for missing

---

### FR-CS-03: BetCard — Replace Raw health_score
- Remove raw `health_score` number display from `BetCard`
- Replace with `<ConvictionLabel conviction={bet.latest_snapshot?.conviction_score} />`
- Position: same location where `health_score` was shown
- When no snapshot yet → `"— Unscanned"` label (same as FR-CS-01 null case)

**Edge cases:**
- Bet created today with no scan → label shows `"— Unscanned"`; no error thrown

---

### FR-CS-04: BetDetailPage — ConvictionScoreGauge Panel
- On `/workspace/directions/[id]`:
  - Add a `ConvictionScoreGauge` panel card in the right column
  - Panel title: `"Conviction Score"`
  - Show `computed_at` as `"Updated {relative_time}"` in `text-[11px] text-muted-foreground`
- The existing LinearSignals section remains unchanged below the gauge

---

### FR-CS-05: Mission Control KpiStatsBar — Avg Conviction
- 5th KPI: `"Avg Conviction"`
- Computed: `Math.round(bets.reduce((sum, b) => sum + (b.latest_snapshot?.conviction_score?.total ?? 0), 0) / bets.length)`
- When all bets have null scores → show `"—"`
- When `bets.length === 0` → show `"—"`
- Color the number by computed level of the average: emerald / indigo / amber / red using same thresholds

**Edge cases:**
- Mix of scanned and unscanned bets → only include bets with non-null `conviction_score` in the average; denominator is only scanned count
- Single bet → average = that bet's score

---

## Acceptance Criteria

| ID | Criterion |
|---|---|
| AC-001 | `compute_conviction_score()` is a pure function with unit-testable inputs/outputs |
| AC-002 | All 6 dimensions computed correctly per the scoring rules |
| AC-003 | Level thresholds: ≥80 Strong, ≥55 Developing, ≥30 Nascent, <30 Critical |
| AC-004 | BetCard shows ConvictionLabel instead of raw health_score number |
| AC-005 | BetDetailPage shows ConvictionScoreGauge with all 6 dimensions |
| AC-006 | Null conviction_score renders gracefully as "— Unscanned" everywhere |
| AC-007 | Mission Control KpiStatsBar includes "Avg Conviction" KPI |
| AC-008 | Kill Criteria dimension awards 20 pts when criteria present and not waived |
