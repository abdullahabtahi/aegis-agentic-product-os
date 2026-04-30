# Spec — 004 UI Layout & Stubs

**Created:** April 2026  
**Status:** Open  
**Audit findings addressed:** H14, H15, H6, M3, M4, M5

---

## User Stories

### P1-US-01: Activity Log Renders Intervention Timeline
As a founder, I want the Activity tab to show a chronological log of past intervention decisions so I can review what happened and when.

**Acceptance Scenarios:**
- Given workspace has 5 resolved interventions → Activity page renders 5 timeline items, newest first
- Given all interventions are `no_intervention` → Activity page shows empty state (not 5 hidden items)
- Given intervention has `status: "approved"` → renders green badge "Approved"
- Given intervention has `status: "rejected"` → renders red badge "Rejected"
- Given clicking an activity item → navigates to `directions/[bet_id]`
- Given page loads → data auto-refreshes every 30s without manual reload

**Edge cases:**
- Workspace has 0 interventions → empty state with helpful copy, not blank screen
- Intervention `bet_id` references deleted bet → item still renders, click navigates gracefully
- 100+ interventions → page renders without performance issues (virtualized or paginated)
- Network error on fetch → error state shown, retry button available

---

### P1-US-02: No Double Sidebar on Any Page
As a founder, I want every page to render exactly one sidebar so the layout is not visually broken.

**Acceptance Scenarios:**
- Given `/workspace/inbox` → renders one sidebar (from GlassmorphicLayout), not two
- Given `/workspace/suppression` → renders one sidebar
- Given `/workspace/settings` → renders one sidebar
- Given `/workspace/activity` → renders one sidebar
- Given any workspace page → `GlassmorphicLayout` provides the sidebar, pages do not wrap in `AppShell`

**Edge cases:**
- New page added under `/workspace/` → only uses `GlassmorphicLayout` slot, no `AppShell`
- `AppShell` component still exists for non-workspace routes → no import removed from correct usages

---

### P1-US-03: BetDeclarationModal Resets on Close
As a founder, I want the bet declaration form to be empty when I reopen it so I don't accidentally resubmit stale data.

**Acceptance Scenarios:**
- Given form submitted and `persisted === false` → modal closes → reopen shows empty form
- Given form submitted and `persisted === true` → modal closes → reopen shows empty form
- Given form closed without submitting → reopen shows empty form

**Edge cases:**
- Multiple rapid open/close cycles → form always empty on open
- Network error mid-submit → form retains data so user can retry (no reset on error)

---

### P2-US-04: Execution Health Chart Shows Valid Data or Explicit Empty State
As a founder, I want the Execution Health chart to either show real data or clearly indicate data is unavailable so I don't make decisions on fabricated trends.

**Acceptance Scenarios:**
- Given Linear not connected → chart area shows "Connect Linear to see execution health" empty state
- Given Linear connected with data → chart renders with correct bar/label alignment
- Given chart renders → number of bars equals number of day labels (no mismatch)
- Given data available → bars reflect real execution metrics, not hardcoded values

**Edge cases:**
- Chart data API returns empty array → empty state (not broken chart)
- Chart data has 1 data point → renders single bar correctly

---

### P2-US-05: Infrastructure Details Not Logged in Production
As a developer, I want `console.error` calls gated to development mode so production browser consoles don't expose backend configuration details.

**Acceptance Scenarios:**
- Given `NODE_ENV=production` and CopilotKit connection error → no `console.error` with backend port or URL
- Given `NODE_ENV=development` → diagnostic `console.error` messages are visible
- Given connection error in production → user sees a UI error message, not raw error in console

**Edge cases:**
- Error handler called with undefined error object → no crash, logs generic message in dev

---

### P2-US-06: `BACKEND_URL` Validated at Startup in Production
As a developer, I want the frontend to fail loudly at startup if `BACKEND_URL` is not set in production so misconfigured deployments are caught immediately.

**Acceptance Scenarios:**
- Given `NODE_ENV=production` and `BACKEND_URL` not set → Next.js build/startup throws with clear message
- Given `NODE_ENV=development` and `BACKEND_URL` not set → uses localhost fallback, logs warning
- Given `BACKEND_URL` set → CopilotKit route uses that URL

**Edge cases:**
- `BACKEND_URL` set to non-http URL → warning logged, startup continues

---

## Functional Requirements

| ID | Requirement |
|---|---|
| FR-001 | `app/workspace/activity/page.tsx` renders `getInterventions` data, filtered to exclude `no_intervention` |
| FR-002 | Activity timeline sorted newest-first by `created_at` or `updated_at` |
| FR-003 | Activity timeline uses React Query with `refetchInterval: 30_000` |
| FR-004 | `StatusBadge` component created in `components/interventions/StatusBadge.tsx` |
| FR-005 | `AppShell` removed from `inbox/page.tsx`, `suppression/page.tsx`, `settings/page.tsx`, `activity/page.tsx` |
| FR-006 | `BetDeclarationModal.resetForm()` called before every early `return` in submit handler |
| FR-007 | `CHART_BARS` length equals `CHART_DAYS` length; or chart replaced with empty state when no real data |
| FR-008 | `console.error` in `Providers.tsx` wrapped in `if (process.env.NODE_ENV === 'development')` |
| FR-009 | `app/api/copilotkit/route.ts` startup assertion for `BACKEND_URL` in production |

---

## Success Criteria

| ID | Criteria |
|---|---|
| SC-001 | Navigate to `/workspace/activity` → timeline renders (not placeholder icon) |
| SC-002 | Activity timeline: `no_intervention` records not visible |
| SC-003 | Activity item click → navigates to correct direction detail page |
| SC-004 | `/workspace/inbox` → one sidebar in DOM, DevTools confirms no duplicate nav |
| SC-005 | BetDeclarationModal: submit (persisted=false) → close → reopen → all fields empty |
| SC-006 | `NODE_ENV=production` → DevTools console has no backend URL/port strings on CopilotKit error |
