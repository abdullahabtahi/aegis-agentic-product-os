# Spec — 006 UX Agentic Hardening

**Created:** April 2026  
**Status:** Open  
**Priority:** HIGH  
**Source:** Live E2E Audit — April 29, 2026 (independent agent review)  
**Audit findings addressed:** UX-01, UX-02, UX-03, UX-04, UX-05, UX-06

> **Mission constraint (from `mission.md`):** Aegis is an *agentic pre-mortem OS for startup bets* — not a chatbot. Every screen must communicate that a 5-agent system is actively monitoring the founder's bets. This spec closes the gap between what the system *does* and what the UI *shows*.

---

## Independent Analysis

The E2E audit (April 29, 2026) identified a structural UX problem: the app's architecture is fully agentic — 5 agents, sequential pipeline, Governor policy, HITL approvals — but the UI surface presents as a generic AI chat interface. A judge opening the app sees a centered chat bar and 5 static informational cards. They cannot tell, at a glance, that an autonomous monitoring system is running.

The three symptoms converge on a single cause: **the agentic state that already exists in the system (bets, interventions, pipeline stages) is not projected onto the primary surfaces**. It is computed, stored, and wired — but not shown.

This spec does not add backend features. It surfaces existing data.

### Audit Finding → Recommendation Traceability

| Finding | Severity | R# |
|---|---|---|
| UX-01: Inbox/Activity not in sidebar | P0 | R-001 |
| UX-02: Home hero is passive (static cards) | P0 | R-002 |
| UX-03: Direction detail has no scan trigger | P0 | R-003 |
| UX-04: Mission Control always shows IDLE | P1 | R-004 |
| UX-05: Health score is always 80% (synthetic) | P1 | R-005 |
| UX-06: Empty states are passive (no CTAs) | P2 | R-006 |

---

## User Stories

### P0-US-01: Inbox and Activity Are Discoverable
As a founder opening the app for the first time, I want the Inbox and Activity Log to be visible in the sidebar so I can reach the human-in-the-loop approval surface without typing a URL.

**Acceptance Scenarios:**
- Given sidebar renders → "Inbox" item is visible with Bell icon
- Given workspace has pending interventions → Inbox icon shows a red dot badge
- Given workspace has 0 pending interventions → badge is absent (not zero, just absent)
- Given sidebar renders → "Activity" item is visible with Activity icon
- Given Settings icon removed from sidebar → `/workspace/settings` route still works via direct URL

**Loading / error states:**
- Given interventions query is in-flight → badge absent (not showing stale count)
- Given interventions query fails (HTTP 500) → badge absent (no error propagated to nav)
- Given `workspaceId === "default_workspace"` → query is `disabled`, badge absent

**Edge cases:**
- Badge count sourced from live query, not hardcoded
- Badge updates without page refresh when a new intervention is created
- Active state styling applies correctly to both new nav items

---

### P0-US-02: Home Hero Communicates Agentic Activity
As a founder on the home page with no active chat session, I want to immediately see the state of my active directions, pending approvals, and pipeline stage — without starting a conversation.

**Acceptance Scenarios:**
- Given 2 active bets, 1 pending intervention → hero shows "2 Active Directions" and "1 Pending Approval"
- Given 0 bets → "0 Active Directions" with link to Directions page, not a blank card
- Given a bet has `last_monitored_at` set → "Last Scan: N min ago" is shown
- Given no bets have been monitored → "Last Scan: Never" shown
- Given `pipelineState` from `useAgentStateSync()` is available → pipeline strip shows 5 agent stages with status dots
- Given pipeline is idle → all 5 dots show IDLE state (not hidden)
- Given static FEATURE_CARDS are removed → no regression: quick-action chips and CommandBar remain

**Loading / error states:**
- Given bets query is in-flight → stat cards show skeleton/`—`, not `0`
- Given interventions query fails → "Pending Approvals" card shows `—` and a non-blocking inline error note
- Given `workspaceId === "default_workspace"` → queries disabled, all cards show `—`

**Edge cases:**
- Stats auto-refresh on mount (no manual reload required)
- Clicking "N Active Directions" → navigates to `/workspace/directions`
- Clicking "N Pending Approvals" → navigates to `/workspace/inbox`
- 0 pending + 0 bets → graceful render with `—` values, not crash
- `pipelineState.stages` is `undefined` → pipeline strip renders 5 static IDLE pills, not blank

---

### P0-US-03: Founder Can Trigger a Scan from Direction Detail
As a founder viewing a specific direction, I want a one-click way to trigger a risk scan so I don't have to navigate back to the chat interface.

**Acceptance Scenarios:**
- Given direction detail page is loaded → "Scan for risks" button is visible in the header
- Given button clicked → scan is triggered (navigates to home with prefilled prompt OR calls `sendMessage` directly)
- Given scan is in progress → button shows loading state
- Given no bet is loaded → button is absent (not broken)

**Loading / error states:**
- Given bet is loading → button absent (not broken/disabled-looking)
- Given router navigation fails → no crash; button click is idempotent

**Edge cases:**
- `bet.id` is a UUID; URL encoding via `encodeURIComponent` prevents malformed URLs
- Double-clicking scan button does not trigger duplicate navigations
- Button uses existing indigo-600 primary button style (no new design tokens)
- Works on both the header CTA and the empty-state CTA (R-006 enrichment)

---

### P1-US-04: Mission Control Shows Last Scan Timestamp
As a founder on Mission Control, I want to see when the pipeline last ran so I can tell if the system is actively monitoring or stale.

**Acceptance Scenarios:**
- Given a bet was last monitored 5 min ago → Mission Control shows "Last scan: 5 min ago"
- Given no bet has ever been monitored → "Last scan: Never"
- Given "Scan all" button clicked → `discoverBets(workspaceId)` is called
- Given scan in progress → loading spinner shown on the button

**Loading / error states:**
- Given bets query fails → "Last scan: —" (no crash); "Scan all" button still enabled
- Given `discoverBets` mutation fails → display inline toast/error, spinner stopped

**Edge cases:**
- `last_monitored_at` sourced from the most recently monitored bet, not hardcoded
- `staleTime` on bets query reduced from 60_000ms to 10_000ms (1 min → 10s) to reduce stale data risk
- "Scan all" button is disabled during in-flight mutation (prevents double-submit)

---

### P1-US-05: Health Score Reflects Real Risk State
As a founder viewing the Directions list or a Direction detail page, I want the health score to reflect actual risk signals — not always default to 80%.

**Acceptance Scenarios:**
- Given bet has a pending intervention (`status: "awaiting_approval"`) → health score ≤ 50
- Given bet has a resolved accepted intervention in last 7 days → health score 60–75
- Given bet has been monitored and no risks found → health score 85–95
- Given bet has never been monitored → score shown as `—` (not 80)

**Loading / error states:**
- Given interventions query is in-flight on the detail page → health ring shows `—` (not 80)

**Edge cases:**
- Score is a deterministic derivation from existing data — no new backend endpoint required
- `declaration_confidence ?? 0.8` removed entirely from health score calculation
- List page has no per-bet interventions query; health shows `—` if `last_monitored_at` is null, else `88` as clean baseline (documented trade-off)
- Multiple pending interventions for one bet → still shows ≤ 50 (idempotent; no double-counting)

---

### P2-US-06: Empty States Have Guided Next Steps
As a founder seeing an empty state on any page, I want to know what to do next so I don't feel lost.

**Acceptance Scenarios:**
- Given Activity page with 0 items → shows "Start by scanning a direction" with link to home
- Given Inbox with 0 pending → shows "No pending approvals — Aegis is monitoring N directions."
- Given Suppression with 0 items → shows "No suppressions — Governor is passing all interventions."
- Given Directions with 0 bets → existing "Declare a direction" button remains (no change needed)

**Edge cases:**
- Inbox empty state: `N directions` count sourced from `listBets` query; if query not available, omit the count rather than showing `0 directions`
- Empty state links must be keyboard-accessible (`role="link"` or `<Link>` component; not `onClick` only)
- Activity empty state CTA must not appear when items are loading (skeleton shown instead)

---

## Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-001 | All interactive elements (badges, CTAs, stat card links) are keyboard-navigable and have visible focus rings |
| NFR-002 | Queries use `enabled` guard — disabled when `workspaceId === "default_workspace"` |
| NFR-003 | No component crashes on `undefined` or `null` API data; all nullable fields render `—` or empty gracefully |
| NFR-004 | Loading states show skeleton/placeholder (`—`) not `0`, to avoid misleading zero counts |
| NFR-005 | Error states are non-blocking — sidebar still renders if the interventions badge query fails |

---

## Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-001 | Sidebar: Inbox (Bell icon + red badge) and Activity nav items added between Directions and Settings | P0 |
| FR-002 | Sidebar: Settings removed from nav items (route preserved) | P0 |
| FR-003 | Home hero: 3 live stat cards (Active Directions, Pending Approvals, Last Scan) replace static FEATURE_CARDS | P0 |
| FR-004 | Home hero: pipeline status strip (5 agent badges) using existing `pipelineState` | P0 |
| FR-005 | Direction detail: "Scan for risks" CTA button in header | P0 |
| FR-006 | Mission Control: "Scan all" button + last scan timestamp | P1 |
| FR-007 | Mission Control: `staleTime` reduced to 10_000ms on bets query | P1 |
| FR-008 | Health score: derived from risk state, not `declaration_confidence` | P1 |
| FR-009 | Empty states: guided CTAs on Activity, Inbox, Suppression pages | P2 |

---

## Out of Scope

| Item | Reason |
|---|---|
| Mobile/responsive layout | Desktop-first for hackathon demo |
| Settings page content | Deferred post-hackathon |
| New backend endpoints | All data is queryable via existing API |
| AlloyDB migration | Already deferred to Phase 7b |
| Suppression Log in sidebar | Power-user view, not primary nav |

---

## Success Criteria

Spec 006 is **closed** when:
- [ ] Sidebar shows: Home \| Mission Control \| Directions \| Inbox (with badge) \| Activity
- [ ] Home hero shows live stats + pipeline strip (no static feature cards)
- [ ] "Scan for risks" CTA visible on direction detail page
- [ ] `npm run build` passes with 0 errors
- [ ] `npm run lint` passes with 0 errors
- [ ] All Playwright tests for Phases 1–3 pass (GREEN)
- [ ] All unit tests for `deriveHealthScore` pass (GREEN)
- [ ] Health score is never statically 80% for all bets
- [ ] No component crashes when API returns empty arrays or null fields
