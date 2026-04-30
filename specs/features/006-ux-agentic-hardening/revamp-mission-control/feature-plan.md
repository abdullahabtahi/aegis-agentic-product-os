# Feature: 006 — UX Agentic Hardening (Mission Control)

## Summary

Mission Control is the hero page of Aegis. As it stands, the page has identity issues: a light glassmorphic shell with no live KPIs, pipeline stages that feel decorative, a static chart labeled "live," and an intervention approval flow that buries the most important human action. This spec hardens Mission Control into a true agentic ops surface — one that communicates system state at a glance, guides founders to act on pending interventions, and surfaces the "wow" of a 5-agent AI pipeline running on their behalf.

Design system stays intact: light glassmorphic (existing `glass-panel` classes, white/slate palette, indigo/emerald/red status colors). No dark mode.

## Scope

- Live KPI stats bar (4 headline numbers above pipeline stages)
- Pipeline stage cards: flow connector line + per-stage timing badge
- Animated pipeline scan progress (stages light up sequentially on scan)
- Governor Policy Breakdown panel replacing the plain "Interventions" header
- Intervention urgency badges (risk type + confidence score surfaced)
- Execution Health chart: fix bar/label mismatch, add real empty state
- "Terminated" / error toast with recovery action
- Typography: enforce minimum 12px, remove all `text-[10px]` instances
- "Scan all" button elevated to primary hero CTA treatment
- First-run empty state: guided onboarding state when no bets exist

## Out of Scope

- Dark mode
- React Flow canvas wiring
- Chat panel redesign
- Mobile/responsive layout pass (desktop-first for hackathon)
- Real-time Linear webhook push (backend planned for Phase 7)
- Recharts or D3 replacement of the bar chart (keep existing DOM bars)

---

## Component Inventory

### Pages / Routes

| Route | Purpose |
|---|---|
| `/workspace/mission-control` | Mission Control dashboard (primary surface) |

### UI Components

| Component | File | Purpose |
|---|---|---|
| `KpiStatsBar` | `components/mission-control/KpiStatsBar.tsx` | 4 headline KPIs: Total Bets · Resolved Interventions · Approval Rate · Last Scan |
| `PipelineStageCard` | `components/mission-control/PipelineStageCard.tsx` | Single stage card with live status, elapsed time badge, and connector dot |
| `PipelineFlowRow` | `components/mission-control/PipelineFlowRow.tsx` | 5 `PipelineStageCard` + 4 connector lines; animates left-to-right pulse when scanning |
| `ScanButton` | `components/mission-control/ScanButton.tsx` | Elevated primary CTA — shows animated pulse ring while scan is pending |
| `ExecutionHealthChart` | `components/mission-control/ExecutionHealthChart.tsx` | Bar chart: fixes 12-bar/7-label mismatch, shows explicit empty state when no data |
| `InterventionCard` | `components/mission-control/InterventionCard.tsx` | Pending intervention with urgency badge (risk type + confidence), approve/reject |
| `GovernorBreakdownPanel` | `components/mission-control/GovernorBreakdownPanel.tsx` | Policy check checklist (8 checks, green/red) rendered when intervention is pending |
| `LiveBadge` | `components/mission-control/LiveBadge.tsx` | Pulsing green dot + "LIVE" label + last-updated timestamp |
| `FirstRunGuide` | `components/mission-control/FirstRunGuide.tsx` | Empty state shown when no bets declared — action card pointing to home page |

### Hooks / Data

| Hook / Source | Purpose |
|---|---|
| `useWorkspaceId()` | Single workspace ID source (existing) |
| `useAgentStateSync()` | `pipelineState.stages`, `governor_denial_reason`, `governor_denial_details` via AG-UI |
| `useQuery(["bets"])` | Live bets for KPI count |
| `useQuery(["interventions"])` | Interventions for KPI counts + panels |
| `useMutation(discoverBets)` | Triggers scan — feeds `ScanButton` pending state |

---

## Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  KPI Stats Bar: [Total Bets] [Resolved] [Approval Rate] [Last Scan] │
├──────────────────────────────────────────────────────┬──────────────┤
│  Pipeline Flow Row (full width)         [ScanButton] │             │
│  Stage 1 ──●── Stage 2 ──●── Stage 3 ──●── 4 ──●── 5│             │
├──────────────────────────────────────┬───────────────┤             │
│  Active Strategic Directions (8 col) │ Interventions │             │
│  (bet cards grid)                    │ + Governor    │             │
│                                      │ Breakdown     │             │
├──────────────────────────────────────┤               │             │
│  Execution Health Chart              │ Recent Actions│             │
└──────────────────────────────────────┴───────────────┴─────────────┘
```

---

## KPI Stats Bar

Four numbers derived from live query data — no hardcoding:

| KPI | Source | Empty Value |
|---|---|---|
| **Total Directions** | `liveBets.length` | `0` |
| **Interventions Resolved** | `interventions.filter(i => i.status !== "pending").length` | `0` |
| **Approval Rate** | `accepted / (accepted + rejected) * 100` | `—` (not enough data) |
| **Last Scan** | `timeAgo(lastScan)` | `"Never"` |

Each KPI: large number (18px semibold), label below (12px muted). Tap to navigate: "Total Directions" → `/workspace/directions`, "Interventions Resolved" → `/workspace/inbox`.

---

## Pipeline Flow Connectors

Between each pair of stage cards, render a connector element:

```
[Stage 1]  ──────●──────  [Stage 2]  ──────●──────  [Stage 3] ...
            connector                  connector
```

Connector states:
- **Idle**: `bg-slate-200` hairline line + neutral dot
- **Active (preceding stage running)**: travelling dot animation (`translate-x` from 0% to 100%, 800ms, `ease-in-out`, repeating)
- **Complete (both adjacent stages complete)**: `bg-emerald-400` solid line

Per-stage timing: when `stage.status === "complete"` and both `stage.started_at` and `stage.completed_at` are non-null → derive elapsed time client-side:
`((new Date(stage.completed_at).getTime() - new Date(stage.started_at).getTime()) / 1000).toFixed(1) + "s"`.
Show as badge below the stage label in `text-[11px] text-muted-foreground`. If either timestamp is null, show nothing (do not show `"0.0s"` or `"NaNs"`). The `PipelineStage` type has `started_at: string | null` and `completed_at: string | null` — there is no `elapsed_ms` field.

---

## Governor Policy Breakdown Panel

When `pendingInterventions.length > 0` and `governor_denial_reason` is present in `pipelineState`:

- Replace the plain "Interventions" header section with an expandable checklist
- 8 policy check rows: `confidence_floor`, `duplicate_suppression`, `rate_cap`, `jules_gate`, `reversibility`, `acknowledged_risk`, `control_level`, `escalation_ladder`
- Each row: green checkmark if passed, red X if denied, neutral dash if not evaluated
- The failed check row is highlighted with `bg-red-50/50 border-l-2 border-red-400`
- `denial_reason` text rendered below the failed check row

Data source: `pipelineState.governor_denial_reason` + `pipelineState.governor_denial_details` (added to pipeline state in spec 002 Phase 7).

When no pending intervention: collapse this panel — show only "No pending interventions" empty state.

---

## Execution Health Chart Fix

Current bugs:
- `CHART_BARS` has 12 items, `CHART_DAYS` has 7 → 5 bars render with no label
- Data is hardcoded but labeled "Live when DB + Linear connected"

Fix:
- Align `CHART_BARS` to `CHART_DAYS`: 7 bars, one per day label
- When `interventions.length === 0`: hide bars entirely, show `ExecutionHealthEmptyState` — "Pipeline health will appear after your first scan"
- When `interventions.length > 0`: derive bar heights from real data: count resolved interventions per day of week (last 7 days). Volume = count, height = `(count / maxCount) * 100`
- Remove "Live when DB + Linear connected" label — replace with `<LiveBadge />` (pulsing dot) or nothing

---

## Intervention Urgency Badges

Each `InterventionCard` currently shows only action type and rationale. Add:

- **Risk type chip**: colored pill derived from `intervention.risk_signal?.risk_type` — label from `RISK_LABELS[risk_type]` (e.g. `"Strategy Unclear"`); background from `SEVERITY_BG[intervention.risk_signal?.severity]` (e.g. `bg-red-50 text-red-600 border-red-200`). Both maps are already in `lib/constants.ts`. Fallback: neutral `bg-slate-100 text-slate-600` chip when `risk_signal` is null.
- **Confidence score**: `{Math.round((intervention.confidence ?? 0) * 100)}%` displayed right of the chip, in `text-muted-foreground`. Field is `intervention.confidence` (number 0–1), not `confidence_score`.
- **Urgency ring**: when `intervention.risk_signal?.severity === "critical"` → subtle `ring-2 ring-red-400/30` on the card border with CSS `animation: pulse 2s ease-in-out 3` (fires 3 times, then stops). Severity, not risk_type, drives urgency.

---

## "Scan All" CTA Elevation

Current: `text-xs` button tucked to the right of the section header.

New `ScanButton`:
- Size: `px-5 py-2` (not `px-3 py-1.5`) with `text-sm font-semibold`
- While `scanMutation.isPending`: outer pulsing ring (`ring-2 ring-indigo-400/40 animate-ping absolute`) on the button wrapper
- Disabled state: `opacity-40` + tooltip "Select a workspace first" when `workspaceId === "default_workspace"`. Note: `useWorkspaceId()` returns the local constant `FALLBACK = "default_workspace"` (not exported). Compare against the string literal directly.

---

## First-Run Empty State

When `liveBets.length === 0` and `!loadingBets`:

Replace the two-column bet grid with `FirstRunGuide`:

```
┌──────────────────────────────────────────────┐
│  ⚡  Welcome to Mission Control               │
│                                              │
│  Aegis monitors your strategic directions    │
│  and surfaces AI-recommended interventions.  │
│                                              │
│  Start by declaring your first direction →   │
│       [ Declare a Direction ]                │
└──────────────────────────────────────────────┘
```

- CTA navigates to `/workspace` (home page with BetDeclarationModal)
- Same `glass-panel` shell as other cards
- Icon: `<Zap size={28} className="text-indigo-400" />`

---

## Error Toast Fix

The "terminated" string visible in the screenshot comes from the CopilotKit runtime AG-UI connection status — it is NOT in the Mission Control page tsx. It is rendered by a shared component in the CopilotKit runtime layer (likely `Providers.tsx` or a CopilotKit built-in error surface).

The fix applies to `scanMutation.isError` state in `mission-control/page.tsx` (which covers pipeline scan failures):
- When `scanMutation.isError` is true, render a dismissable error toast at the bottom of the page
- Copy: `"Pipeline scan failed"` (bold) + `" — try again."` (muted)
- Action button: `"Retry"` → calls `scanMutation.reset()` then `scanMutation.mutate()`
- Dismiss button: `✕` icon, calls `scanMutation.reset()`
- Auto-dismiss: 8 seconds after appearing
- Color: `bg-red-50 border border-red-200 rounded-xl text-red-700`

The CopilotKit "terminated" message is outside Aegis's control and is not addressed in this spec.

---

## Typography Enforcement

Replace all `text-[10px]` with `text-[11px]` minimum. Specifically:
- Stage `"Stage 01"` label: `text-[10px]` → `text-[11px]`
- Chart day labels: `text-[10px]` → `text-[11px]`
- KPI labels: `text-xs` (12px)
- Action type label in intervention card: `text-xs`
- All `p.text-[10px]` across the file → `text-[11px]`

---

## Dependencies

- No new npm packages required
- `lib/constants.ts` already exports `RISK_LABELS` + `SEVERITY_BG` + `SEVERITY_COLORS` — use `SEVERITY_BG` for chip backgrounds (not the non-existent `SEVERITY_STYLES`)
- `pipelineState.governor_denial_reason` + `governor_denial_details` must be present in AG-UI state delta (spec 002 Phase 7)
- All changes are in `frontend/app/workspace/mission-control/page.tsx` + new `components/mission-control/` files
