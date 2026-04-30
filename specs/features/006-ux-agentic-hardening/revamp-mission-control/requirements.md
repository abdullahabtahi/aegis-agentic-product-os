# Requirements: 006 — UX Agentic Hardening (Mission Control)

## Functional Requirements

### FR-MC-01: KPI Stats Bar
- When Mission Control loads: render a stats bar above the pipeline stages with 4 KPIs
- **Total Directions**: count of `liveBets` from `GET /bets`
- **Interventions Resolved**: count of `interventions` where `status !== "pending"`
- **Approval Rate**: `accepted / (accepted + rejected) * 100`, rounded to nearest integer, displayed as `"72%"`. Render `"—"` when fewer than 2 resolved interventions exist (not enough data)
- **Last Scan**: relative time from `lastScan` ISO string (`timeAgo()`), or `"Never"` if no bets have `last_monitored_at`
- While data is loading: each KPI shows a single-line skeleton (`animate-pulse bg-slate-100 rounded h-5 w-12`)
- Clicking "Total Directions" navigates to `/workspace/directions`
- Clicking "Interventions Resolved" navigates to `/workspace/inbox`

**Edge cases:**
- All 4 bets deleted → all KPIs reset to `0` / `"Never"` / `"—"` without error
- Workspace not yet set → stats bar renders with all `"—"` values, no API calls fire (`enabled: !!workspaceId`)

---

### FR-MC-02: Pipeline Flow Connectors
- Between each adjacent pair of the 5 stage cards, render a connector: a horizontal hairline line with a midpoint dot
- **Idle state**: line is `bg-slate-200`, dot is `bg-slate-300`
- **Scanning (preceding stage is "running")**: a travelling dot animates along the connector line from left to right (CSS `@keyframes travel`, `translateX 0% → 100%`, `800ms ease-in-out`, `infinite` while running)
- **Complete (both adjacent stages have status "complete")**: line becomes `bg-emerald-300`, dot becomes `bg-emerald-400`; no animation
- **Error**: line becomes `bg-red-200`, dot becomes `bg-red-400`
- Connector is purely decorative — no click target, no aria role needed

**Edge cases:**
- Stage 1 is "complete" but Stage 2 is still "pending" → connector 1–2 shows "complete" left half, neutral right half (visual: emerald to slate gradient)
- All stages idle → all connectors idle state

---

### FR-MC-03: Per-Stage Elapsed Time Badge
- When `stage.status === "complete"` and both `stage.started_at` and `stage.completed_at` are non-null strings:
  - Derive elapsed time: `((new Date(stage.completed_at).getTime() - new Date(stage.started_at).getTime()) / 1000).toFixed(1) + "s"`
  - Render below the stage label in `text-[11px] text-muted-foreground`
- When stage is idle or running: no elapsed badge
- When either `started_at` or `completed_at` is null: no badge — do not show `"0.0s"` or `"NaNs"`
- Note: `PipelineStage` type fields are `started_at: string | null` and `completed_at: string | null`. There is no `elapsed_ms` field — it must be derived.

---

### FR-MC-04: Elevated Scan CTA
- "Scan all" button uses `ScanButton` component
- Size: `px-5 py-2 text-sm font-semibold` (not `text-xs px-3 py-1.5`)
- While `scanMutation.isPending`:
  - Inner: `<Loader2 size={14} className="animate-spin" />` + `"Scanning..."`
  - Outer wrapper: pulsing ring effect (`ring-2 ring-indigo-300/50`) applied via `className`
- While `workspaceId === "default_workspace"` (the FALLBACK value from `useWorkspaceId`):
  - Button is `disabled`, shows tooltip on hover: `"Select a workspace first"`
- After scan completes (mutation settled): button returns to default state

---

### FR-MC-05: Governor Policy Breakdown Panel
- When `pendingInterventions.length > 0`:
  - Render `GovernorBreakdownPanel` above the intervention cards in the right panel
  - Show a checklist of all 8 Governor policy checks in order:
    1. `confidence_floor` — "Confidence Floor"
    2. `duplicate_suppression` — "Duplicate Suppression"
    3. `rate_cap` — "Rate Cap"
    4. `jules_gate` — "Jules Gate"
    5. `reversibility` — "Reversibility"
    6. `acknowledged_risk` — "Acknowledged Risk"
    7. `control_level` — "Control Level"
    8. `escalation_ladder` — "Escalation Ladder"
  - Each row has: icon (✓ green / ✗ red / – slate) + check name + optional detail text
  - The check matching `pipelineState.governor_denial_reason` renders with `bg-red-50/50 border-l-2 border-red-400 rounded-r`
  - `pipelineState.governor_denial_details` text renders below the failed check row in `text-[11px] text-muted-foreground`
- When `pipelineState.governor_denial_reason` is null/absent: all checks render as "–" (unknown, not evaluated in this pipeline state)
- When `pendingInterventions.length === 0`: `GovernorBreakdownPanel` is not rendered; show standard empty state

**Edge cases:**
- `governor_denial_reason` value not in the 8 known checks → render it as an unknown check row at the bottom
- `governor_denial_details` exceeds 120 chars → truncate with ellipsis; full text in `title` attribute

---

### FR-MC-06: Intervention Urgency Badges
- Each pending intervention card renders:
  - **Risk type chip**: colored pill using:
    - Label: `RISK_LABELS[intervention.risk_signal?.risk_type]` (e.g. `"Strategy Unclear"`) from `lib/constants.ts`
    - Background/color: `SEVERITY_BG[intervention.risk_signal?.severity]` (e.g. `"bg-red-50 text-red-600 border-red-200"`) from `lib/constants.ts`
    - Fallback when `risk_signal` is null: `"UNKNOWN"` chip with `bg-slate-100 text-slate-600 border-slate-200`
  - **Confidence score**: `"{Math.round((intervention.confidence ?? 0) * 100)}%"` in `text-[11px] text-muted-foreground` right of the chip. Field is `intervention.confidence` (0–1 number). If `confidence` is somehow > 1.0 → cap display at `"100%"`.
  - **Urgency pulse**: when `intervention.risk_signal?.severity === "critical"` → card border has `ring-2 ring-red-400/30` + CSS `animation-iteration-count: 3` (fires 3 pulses, then stops). Severity (not risk_type) drives urgency.
- Approve/Reject buttons remain in the same position — badges appear in a new row above the rationale text

**Edge cases:**
- `risk_signal` is null → fallback `"UNKNOWN"` chip; no confidence shown
- `risk_signal.severity` not in `SEVERITY_BG` keys → fallback neutral chip
- `confidence > 1.0` (backend bug) → cap display at `"100%"`

---

### FR-MC-07: Execution Health Chart Fix
- Fix bug: align bar count to label count — 7 bars, one per weekday label (`Mon` through `Sun`)
- Remove hardcoded `CHART_BARS = [40, 60, 55, 85, 95, 70, 80, 65, 98, 75, 45, 88]` (12 items)
- New behavior:
  - When `interventions.length === 0` → render `ExecutionHealthEmptyState`: centered text `"Pipeline health will appear after your first scan"` with a small `BarChart2` icon (from lucide-react). No bars rendered.
  - When `interventions.length > 0` → derive bar heights from real data:
    - Group resolved interventions by `day_of_week(updated_at)` for the last 7 calendar days
    - `barHeight[i] = (dayCount[i] / Math.max(1, maxDayCount)) * 100`
    - Days with no activity render at `height: 4px` (not 0 — preserves bar rail visibility)
- Remove the `"Live when DB + Linear connected"` subtitle; replace with `<LiveBadge />` component (pulsing green dot + `"LIVE"` text + last-updated relative time)

**Edge cases:**
- All resolved interventions are older than 7 days → all bars render at minimum height (4px), not empty state (data exists, just not recent)
- Timezone mismatch (client vs. server) → group by UTC date

---

### FR-MC-08: First-Run Empty State
- When `liveBets.length === 0` and `!loadingBets`:
  - Replace the 2-column bet card grid with `FirstRunGuide` component
  - Content: `<Zap size={28} className="text-indigo-400" />` icon, heading `"Welcome to Mission Control"`, body `"Aegis monitors your strategic directions and surfaces AI-recommended interventions."`, CTA button `"Declare a Direction"` (indigo, navigates to `/workspace`)
  - Same `glass-panel rounded-2xl p-6` shell as the existing card container — no layout shift
- When bets load → `FirstRunGuide` is replaced by the bet grid (no flicker: gated by `!loadingBets`)

---

### FR-MC-09: Error Toast Recovery
- Note: the `"terminated"` text visible in the screenshot is rendered by the CopilotKit runtime (not by `page.tsx`) and is outside this spec's scope.
- When `scanMutation.isError` is true in `mission-control/page.tsx`:
  - Render a dismissable toast at the bottom of the page: `bg-red-50 border border-red-200 rounded-xl px-4 py-3`
  - Content: `"Pipeline scan failed"` (font-semibold) + `" — try again."` (text-muted-foreground)
  - Action button: `"Retry"` → calls `scanMutation.reset()` then `scanMutation.mutate()`
  - Dismiss button: `✕` icon, calls `scanMutation.reset()`
  - Auto-dismiss: 8 seconds after appearing (`useEffect` with `setTimeout` → `scanMutation.reset()`)

**Edge cases:**
- User clicks "Retry" within the 8s window → auto-dismiss timer is cleared; new mutation starts
- Error toast visible when page loses focus → timer still runs

---

### FR-MC-10: Typography Floor
- No element in `mission-control/page.tsx` or any Mission Control component may use `text-[10px]`
- Minimum size: `text-[11px]` for tight labels (stage numbers, chart labels), `text-xs` (12px) for readable text, `text-sm` (14px) for card body
- Apply to:
  - Stage `"STAGE 01"` label: `text-[11px]`
  - Chart day labels: `text-[11px]`
  - KPI labels: `text-xs`
  - Action timeline labels: `text-[11px]`
  - All other `text-[10px]` occurrences in the file

---

### FR-MC-11: Live Badge
- `LiveBadge` component: `<span className="flex items-center gap-1.5 text-[11px] text-emerald-600">`
  - Pulsing green dot: `<span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />`
  - Text: `"LIVE"` in `font-semibold tracking-wide`
  - Optional: last-updated timestamp `"· updated just now"` in `text-muted-foreground`
- Used in: Execution Health chart header (replaces "Live when DB + Linear connected")

---

## Non-Functional Requirements

### NFR-MC-01: No New npm Packages
- All components use existing dependencies: lucide-react, @tanstack/react-query, existing Tailwind classes
- Connector animations use Tailwind `animate-pulse` or a `<style jsx>` keyframe block — no Framer Motion

### NFR-MC-02: No Layout Regression
- `GlassmorphicLayout` sidebar remains; no `<AppShell>` wrapper added (double-sidebar rule from spec 004)
- `grid-cols-12` layout preserved; KPI bar is a new row above the pipeline stages row

### NFR-MC-03: Query Reuse
- `KpiStatsBar` consumes data passed as props from the parent page (which already queries `liveBets` and `interventions`) — does not fire its own duplicate queries

### NFR-MC-04: Graceful Degradation
- If `pipelineState` is undefined (AG-UI not yet connected): pipeline stage cards render idle state, Governor panel does not render, no crash
- If `interventions` query fails: "Interventions" panel shows an error state (`"Failed to load — retry"` link) instead of crashing the page

---

## Acceptance Criteria

- [ ] KPI stats bar visible above pipeline stages with 4 live values
- [ ] Clicking "Total Directions" KPI navigates to `/workspace/directions`
- [ ] Clicking "Interventions Resolved" KPI navigates to `/workspace/inbox`
- [ ] KPI bar shows skeleton while data loads, then real values
- [ ] 4 connector lines visible between the 5 pipeline stage cards
- [ ] Connectors animate (travelling dot) while a scan is in progress
- [ ] Completed stages → adjacent connector turns emerald
- [ ] Elapsed time badge shows below stage label when `started_at` and `completed_at` are both non-null
- [ ] "Scan all" button is larger (`px-5 py-2 text-sm`) and shows pulse ring while scanning
- [ ] Governor Policy Breakdown panel visible when pending intervention exists
- [ ] Failed policy check row highlighted with red left border + denial reason text
- [ ] Intervention cards show risk type chip + confidence percentage
- [ ] Critical risk type card has animated border ring (3 pulses then stops)
- [ ] Execution Health chart has exactly 7 bars and 7 day labels (no mismatch)
- [ ] Chart shows empty state when `interventions.length === 0`
- [ ] Chart bars derived from real resolved intervention counts when data exists
- [ ] "Live when DB + Linear connected" label is gone; `LiveBadge` shown instead
- [ ] No bets → `FirstRunGuide` displayed with "Declare a Direction" CTA
- [ ] Scan error → red toast with "Retry" + auto-dismiss after 8s
- [ ] Zero instances of `text-[10px]` in Mission Control files
- [ ] No double sidebar (no `<AppShell>` wrapper added)
- [ ] `npm run build` passes with no type errors on new components
