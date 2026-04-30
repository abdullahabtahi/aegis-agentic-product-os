# Tasks — 004 UI Layout & Stubs

**Created:** April 2026  
**Convention:** [P] = can run in parallel with other [P] tasks.

---

## Phase 1 — Remove Double Layout (quick, high-visibility fix)

### TDD — Write tests first (RED)
- [ ] Write `frontend/__tests__/layout.test.tsx` (or Playwright):
  - `test_inbox_has_single_sidebar` — render `/workspace/inbox` → DOM has exactly 1 `nav[role=navigation]`
  - `test_settings_has_single_sidebar` — same for settings
  - `test_suppression_has_single_sidebar` — same
  - `test_activity_has_single_sidebar` — same

### Implementation (GREEN) — all [P]
- [ ] `inbox/page.tsx`: remove `import AppShell` and `<AppShell>` wrapper [P]
- [ ] `suppression/page.tsx`: same [P]
- [ ] `settings/page.tsx`: same [P]
- [ ] `activity/page.tsx`: same (combined with Fix 2 below) [P]

### Verify
- [ ] Run tests → GREEN
- [ ] Open `/workspace/inbox` → one sidebar in DOM (DevTools Elements confirms)

---

## Phase 2 — `StatusBadge` Component [P with Phase 1]

### TDD — Write tests first (RED)
- [ ] Write `frontend/__tests__/StatusBadge.test.tsx`:
  - `test_approved_renders_green_badge`
  - `test_rejected_renders_red_badge`
  - `test_no_intervention_renders_nothing` — status="no_intervention" → null output
  - `test_unknown_status_renders_neutral_badge` — no crash on unknown value

### Implementation (GREEN)
- [ ] Create `frontend/components/interventions/StatusBadge.tsx` with `STATUS_STYLES` map
- [ ] Export `StatusBadge` and `BadgeStatus` type

### Verify
- [ ] Run `npm run test` → GREEN
- [ ] Storybook or visual check: all 4 visible statuses render with correct colors

---

## Phase 3 — Activity Log Page [P with Phase 2]

### TDD — Write tests first (RED)
- [ ] Write `frontend/__tests__/ActivityPage.test.tsx`:
  - `test_renders_timeline_items` — mock `getInterventions` returns 3 items → 3 items rendered
  - `test_filters_no_intervention` — one item has `status: "no_intervention"` → 2 items rendered
  - `test_sorted_newest_first` — items sorted by created_at descending
  - `test_empty_state_shown_when_no_items` — 0 items → empty state text visible
  - `test_error_state_on_fetch_failure` — `getInterventions` rejects → error state rendered
  - `test_click_navigates_to_direction` — click item → router.push called with correct bet_id

### Implementation (GREEN)
- [ ] `activity/page.tsx`: full implementation — remove placeholder, build timeline
  - `useWorkspaceId()` for workspace ID
  - `useQuery` with `refetchInterval: 30_000` and `enabled` guard
  - Filter `no_intervention` records
  - Sort newest-first
  - Map to timeline items with `StatusBadge`
  - Click handler → `router.push`
  - Empty state component
  - Error state with retry

### Verify
- [ ] Run tests → GREEN
- [ ] Navigate to `/workspace/activity` → timeline renders (not placeholder)
- [ ] `no_intervention` items absent from timeline
- [ ] Click item → correct direction detail page

---

## Phase 4 — Remaining Fixes [P]

### BetDeclarationModal Reset [P]
- [ ] Write test: `test_modal_form_empty_on_reopen_after_persisted_false`
- [ ] `BetDeclarationModal.tsx`: add `resetForm()` before `persisted === false` return
- [ ] Run test → GREEN

### Chart Fix [P]
- [ ] Write test: `test_chart_bars_match_labels_count`
- [ ] `mission-control/page.tsx`: `CHART_BARS.slice(0, CHART_DAYS.length)` or replace with empty state
- [ ] Run test → GREEN

### Console.error Gate [P]
- [ ] Write test: `test_no_console_error_in_production` — mock `NODE_ENV=production` → handleCopilotError → console.error not called
- [ ] `Providers.tsx`: wrap console.error in dev check
- [ ] Run test → GREEN

### BACKEND_URL Assertion [P]
- [ ] Write test: `test_startup_throws_without_backend_url_in_prod`
- [ ] `copilotkit/route.ts`: add startup assertion
- [ ] Run test → GREEN

---

## Phase 5 — Final Validation

- [ ] `npm run lint` → 0 errors
- [ ] `npm run build` → succeeds
- [ ] Full navigation: Home → Directions → Direction Detail → Activity → Inbox → Settings → no layout issues
- [ ] Activity page auto-refreshes (verify in Network tab: request every 30s)
- [ ] Mark spec 004 as **Closed**
