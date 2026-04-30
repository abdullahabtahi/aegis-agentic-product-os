# Validation: 006 — UX Agentic Hardening (Mission Control)

## How to Verify

### Manual Test Cases

#### TC-MC-01: KPI Stats Bar — Live Values
1. Navigate to `/workspace/mission-control` with a workspace that has 2 active bets and 3 resolved interventions (1 accepted, 2 rejected)
2. **Expected**: `"2"` under "Total Directions"
3. **Expected**: `"3"` under "Interventions Resolved"
4. **Expected**: `"33%"` under "Approval Rate" (1 accepted / 3 resolved = 33%)
5. **Expected**: "Last Scan" shows relative time (e.g. `"4m ago"`) matching `last_monitored_at` of the most recent bet
6. Click "Total Directions" KPI → **Expected**: navigates to `/workspace/directions`
7. Click "Interventions Resolved" KPI → **Expected**: navigates to `/workspace/inbox`

#### TC-MC-01b: KPI Stats Bar — Skeleton + Empty
1. Navigate while workspace has no bets and no interventions
2. **Expected**: `"0"` under "Total Directions"
3. **Expected**: `"0"` under "Interventions Resolved"
4. **Expected**: `"—"` under "Approval Rate" (not enough data)
5. **Expected**: `"Never"` under "Last Scan"
6. During initial load: **Expected**: skeleton shimmer visible in all 4 KPI cells before data arrives

#### TC-MC-02: Pipeline Flow Connectors — Idle
1. Load Mission Control with no scan in progress
2. **Expected**: 4 connector lines visible between the 5 stage cards
3. **Expected**: all connector lines are slate (`bg-slate-200`), no animation

#### TC-MC-03: Pipeline Flow Connectors — Scanning
1. Click "Scan all"
2. **Expected**: While stage 1 ("Signal Engine") is "running":
   - Stage 1 card shows `"RUNNING"` badge with indigo dot
   - Connector 1–2 shows the travelling dot animation (left → right, repeating)
   - Connectors 2–3, 3–4, 4–5 remain idle
3. When stage 1 completes and stage 2 starts running:
   - Connector 1–2 turns emerald
   - Connector 2–3 animates

#### TC-MC-04: Per-Stage Elapsed Time
1. Complete a pipeline scan (AG-UI emits `started_at` and `completed_at` on each stage)
2. **Expected**: Below each stage label, a time badge appears: e.g. `"1.2s"` for Signal Engine, `"3.4s"` for Product Brain
3. **Expected**: No badge shows `"0.0s"` or `"NaNs"` — if either timestamp is null, no badge is shown
4. **Expected**: Badge uses `text-[11px] text-muted-foreground` styling
5. **Verify formula**: `((new Date(completed_at).getTime() - new Date(started_at).getTime()) / 1000).toFixed(1)`

#### TC-MC-05: Elevated Scan CTA
1. Inspect the "Scan all" button size: **Expected** padding `px-5 py-2`, font `text-sm font-semibold`
2. Click "Scan all": **Expected** button shows spinner + `"Scanning..."` text + outer ring pulses
3. With no workspace ID (FALLBACK_ID): **Expected** button is disabled; hovering shows tooltip `"Select a workspace first"`

#### TC-MC-06: Governor Policy Breakdown Panel
1. Trigger a pipeline scan that halts at Governor (use a low-confidence test bet)
2. **Expected**: `GovernorBreakdownPanel` appears above the intervention card in the right panel
3. **Expected**: 8 policy check rows rendered in order
4. **Expected**: The `confidence_floor` row (or whichever failed) is highlighted with red left border
5. **Expected**: Denial detail text appears below the failed row (e.g. `"confidence=0.52, floor=0.70"`)
6. Approve the intervention → **Expected**: panel collapses to standard empty state

#### TC-MC-06b: Governor Panel — No Pending Interventions
1. Load Mission Control with no pending interventions
2. **Expected**: `GovernorBreakdownPanel` is NOT rendered
3. **Expected**: Standard `"No pending interventions"` empty state visible

#### TC-MC-07: Intervention Urgency Badges
1. Ensure a pending intervention exists with `risk_signal.severity: "high"` and `confidence: 0.87`
2. **Expected**: Colored pill chip uses `SEVERITY_BG["high"]` — `bg-orange-50 text-orange-700 border-orange-200`
3. **Expected**: Label from `RISK_LABELS[risk_signal.risk_type]` (e.g. `"Strategy Unclear"`)
4. **Expected**: `"87%"` confidence score text visible beside the chip (from `intervention.confidence`, not `confidence_score`)
5. With `risk_signal.severity: "critical"`: **Expected** card border ring pulses for ~3 cycles, then stops

#### TC-MC-07b: Urgency Badges — Missing Data
1. Create an intervention with `risk_signal: null` and no confidence override
2. **Expected**: neutral slate chip `"UNKNOWN"` shown (fallback from `bg-slate-100 text-slate-600`)
3. **Expected**: no confidence score text rendered (not `"0%"` or `"NaN%"`)

#### TC-MC-08: Execution Health Chart Fix
1. Navigate to Mission Control
2. Inspect the chart: **Expected** exactly 7 bars and exactly 7 day labels (`Mon Tue Wed Thu Fri Sat Sun`)
3. With `interventions.length === 0`: **Expected** bars are hidden; empty state text `"Pipeline health will appear after your first scan"` shown with `BarChart2` icon
4. With resolved interventions: **Expected** bar heights reflect actual intervention counts per day (not hardcoded values)
5. **Expected**: `"Live when DB + Linear connected"` text is gone
6. **Expected**: `LiveBadge` (pulsing green dot + `"LIVE"`) shown in chart header

#### TC-MC-09: First-Run Empty State
1. Navigate to Mission Control with a workspace that has no bets declared
2. **Expected**: `FirstRunGuide` card renders in the "Active Strategic Directions" panel
3. **Expected**: Contains `<Zap>` icon, heading `"Welcome to Mission Control"`, body text, and `"Declare a Direction"` CTA button
4. Click `"Declare a Direction"` → **Expected**: navigates to `/workspace`
5. After declaring a bet and returning: **Expected**: `FirstRunGuide` is replaced by the bet card grid

#### TC-MC-10: Error Toast Recovery
1. Trigger a scan failure (backend offline or mock error)
2. **Expected**: Red toast appears at bottom: `"Pipeline scan failed — an error occurred."`
3. **Expected**: "Retry" button visible in toast
4. Click "Retry": **Expected** toast dismisses, new scan attempt begins
5. Wait 8 seconds without interaction: **Expected** toast auto-dismisses
6. Click `✕` dismiss button: **Expected** toast dismisses immediately

#### TC-MC-10b: Retry Clears Auto-Dismiss Timer
1. Error toast appears (8s auto-dismiss started)
2. After 4 seconds, click "Retry"
3. **Expected**: toast dismisses; new scan starts; no second dismissal fires at the 8s mark

#### TC-MC-11: Typography Floor
1. Open browser DevTools → Elements panel
2. Inspect any text in Mission Control components
3. **Expected**: No element has `font-size: 10px` (computed value)
4. Minimum: `11px` for tight labels, `12px` for readable text, `14px` for body content
5. Specifically verify: stage "STAGE 01" labels, chart day labels, action timeline labels

#### TC-MC-12: Live Badge
1. Inspect the Execution Health chart header
2. **Expected**: `LiveBadge` component visible — pulsing green dot + `"LIVE"` text
3. **Expected**: dot has `animate-pulse` Tailwind class
4. **Expected**: No `"Live when DB + Linear connected"` legacy text present

#### TC-MC-13: No Double Sidebar
1. Navigate to `/workspace/mission-control`
2. Inspect rendered HTML: **Expected** exactly one sidebar element in the DOM
3. **Expected**: No `<AppShell>` wrapper component present in the Mission Control page tree
4. Verify other pages are unaffected: navigate to `/workspace/inbox` and `/workspace/directions`

#### TC-MC-14: No Layout Regression
1. After all changes: open `/workspace/mission-control` at 1440px viewport
2. **Expected**: `grid-cols-12` layout intact — left panel (8 cols), right panel (4 cols)
3. **Expected**: KPI stats bar is a new row above pipeline stages, not replacing any existing section
4. **Expected**: Pipeline stages row, bet cards, health chart, interventions, recent actions all visible

---

## Automated Checks

```bash
# 1. No text-[10px] in mission control files
grep -r "text-\[10px\]" frontend/app/workspace/mission-control/ frontend/components/mission-control/ && echo "FAIL: found text-[10px]" || echo "PASS"

# 2. Chart bar count and label count must be equal (7)
grep -A2 "CHART_BARS\|CHART_DAYS" frontend/app/workspace/mission-control/page.tsx

# 3. No AppShell import in mission-control page
grep "AppShell" frontend/app/workspace/mission-control/page.tsx && echo "FAIL: AppShell found" || echo "PASS"

# 4. TypeScript build passes
cd frontend && npm run build 2>&1 | tail -20

# 5. No hardcoded static chart data (12-item array gone)
grep "40, 60, 55, 85, 95, 70, 80, 65, 98, 75, 45, 88" frontend/app/workspace/mission-control/page.tsx && echo "FAIL: old static data still present" || echo "PASS"

# 6. SEVERITY_BG and RISK_LABELS imported (not SEVERITY_STYLES — that constant does not exist)
grep "SEVERITY_BG\|RISK_LABELS" frontend/components/mission-control/InterventionCard.tsx

# 7. No reference to confidence_score (wrong field name — use confidence)
grep -r "confidence_score" frontend/components/mission-control/ && echo "FAIL: wrong field name" || echo "PASS"

# 8. No reference to elapsed_ms (field does not exist on PipelineStage — use started_at/completed_at)
grep -r "elapsed_ms" frontend/components/mission-control/ && echo "FAIL: non-existent field" || echo "PASS"

# 9. No reference to risk_type directly on Intervention (use risk_signal?.risk_type)
grep -r "intervention\.risk_type\b" frontend/components/mission-control/ && echo "FAIL: wrong field path" || echo "PASS"
```

---

## Visual Regression Checklist

After implementation, manually verify against the pre-implementation screenshot:

| Element | Before | After |
|---|---|---|
| Stats bar | Missing | 4 KPIs visible above pipeline stages |
| Pipeline connectors | None | 4 lines between 5 stage cards |
| Scan button | `text-xs px-3 py-1.5` | `text-sm px-5 py-2` with pulse ring |
| Chart bar count | 12 bars / 7 labels | 7 bars / 7 labels |
| Chart empty state | Fake bars always visible | Explicit empty state when no data |
| "Live when DB" label | Visible | Gone → replaced by LiveBadge |
| Intervention card | Action type + rationale only | + risk chip + confidence % + urgency pulse |
| Governor panel | Not present | Checklist visible when pending exists |
| First-run state | Zap icon + generic text | Full onboarding guide card with CTA |
| Error toast | Red block "terminated" with no action | Dismissable toast with "Retry" button |
| Smallest text | `text-[10px]` (10px) | `text-[11px]` minimum |

---

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| Workspace has 100+ resolved interventions | KPI bar shows `"100+"` or actual count; chart groups by day correctly |
| All interventions resolved on same day | Chart shows 1 tall bar, 6 minimum-height bars |
| `confidence = 1.0` (100%) | Renders `"100%"` — cap logic prevents `"100%"` from becoming `"101%"`. Field is `confidence`, not `confidence_score`. |
| Scan triggered while previous scan still running | "Scan all" button is disabled (already pending); second mutation not queued |
| `governor_denial_reason` value not in 8 known checks | Rendered as an "Unknown Check" row at bottom of Governor panel with the raw value |
| `governor_denial_details` is 200+ chars | Truncated to 120 chars with `...`; full text available via HTML `title` attribute |
| AG-UI connection drops mid-scan | Stage cards freeze at last known state; scan button returns to idle after mutation settles |
| `started_at === completed_at` (same-millisecond timestamps, 0ms elapsed) | Do not render `"0.0s"` badge — guard with `elapsed > 0` before showing |
| Multiple critical interventions | Each card has independent pulse animation (not synchronized) |
| User resizes browser mid-scan | Layout adjusts via Tailwind responsive grid; animations continue without interruption |
