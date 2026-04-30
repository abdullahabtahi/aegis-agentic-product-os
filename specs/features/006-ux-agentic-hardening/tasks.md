# Tasks — 006 UX Agentic Hardening

**Created:** April 2026  
**Convention:** [P] = can run in parallel with other [P] tasks.  
**Priority order:** P0 tasks first (sidebar, hero, scan CTA), then P1, then P2.

> All data required for these tasks already exists in the backend. This spec is purely frontend surfacing.
>
> **Test framework:** Playwright (`@playwright/test ^1.59.1`). Test names use `test('description', ...)` format, not snake_case.
>
> **Mock fixture shapes** (use in all tests):
> ```ts
> const mockBet = { id: 'bet-1', title: 'Bet A', pipeline_status: 'complete', last_monitored_at: '2026-04-29T10:00:00Z', declaration_confidence: 0.9 }
> const mockBetUnmonitored = { ...mockBet, id: 'bet-2', last_monitored_at: null }
> const mockIntervention = { id: 'int-1', bet_id: 'bet-1', pipeline_status: 'awaiting_approval', pipeline_checkpoint: 'governor', action_type: 'add_metric', escalation_level: 2, created_at: '2026-04-29T09:00:00Z' }
> const mockIntApproved = { ...mockIntervention, id: 'int-2', pipeline_status: 'complete', pipeline_checkpoint: 'approved' }
> ```

---

## Phase 1 — Sidebar Navigation Fix [P0 — do first]

**Bug:** Inbox, Activity are unreachable from the sidebar. Settings wastes a nav slot.  
**File:** `frontend/components/layout/Sidebar.tsx`

### TDD — Write tests first (RED)
- [ ] Create `frontend/__tests__/Sidebar.test.tsx` (Playwright component test or Vitest with RTL):
  - `test('sidebar has inbox nav item linking to /workspace/inbox')`
  - `test('sidebar has activity nav item linking to /workspace/activity')`
  - `test('sidebar does not have a settings nav item')`
  - `test('inbox badge is visible when pendingCount > 0')` — mock `getInterventions` → `[mockIntervention]`
  - `test('inbox badge is absent when pendingCount is 0')` — mock `getInterventions` → `[]`
  - `test('inbox badge is absent when interventions query fails')` — mock `getInterventions` → reject
  - `test('inbox badge is absent when workspaceId is default_workspace')` — query disabled path

### Implementation (GREEN)
- [ ] `Sidebar.tsx`: Replace `NAV_ITEMS` constant:
  ```ts
  { href: "/workspace", icon: Home, label: "Home" },
  { href: "/workspace/mission-control", icon: Radar, label: "Mission Control" },
  { href: "/workspace/directions", icon: Target, label: "Directions" },
  { href: "/workspace/inbox", icon: Bell, label: "Inbox" },       // ← NEW
  { href: "/workspace/activity", icon: Activity, label: "Activity" }, // ← NEW
  // Settings removed from NAV_ITEMS (route still exists)
  ```
- [ ] Add `Bell` and `Activity` to lucide-react imports, remove `Settings`
- [ ] For the Inbox item: render a red `●` dot overlay when `pendingCount > 0`
  - Source: `useQuery({ queryKey: ["interventions", workspaceId, "pending"], queryFn: ... })` — filter `status === "awaiting_approval"` client-side from existing `getInterventions` call
  - Dot: `<span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-500" />`

### Verify
- [ ] Run `npm run build` → 0 errors
- [ ] Open app → sidebar shows Home | Mission Control | Directions | Inbox | Activity
- [ ] Inbox icon has red dot when a pending intervention exists

---

## Phase 2 — Home Hero: Agent Status Dashboard [P0] [P with Phase 1]

**Bug:** Static FEATURE_CARDS present the app as informational, not active.  
**File:** `frontend/app/workspace/page.tsx`

### TDD — Write tests first (RED)
- [ ] Create `frontend/__tests__/HomePage.test.tsx`:
  - `test('hero shows active directions count from API')` — mock `listBets` → `[mockBet, mockBetUnmonitored]` → "2 Active Directions" visible
  - `test('hero shows pending approvals count from API')` — mock `getInterventions` → `[mockIntervention]` → "1 Pending Approval"
  - `test('hero shows Never when no bets have been monitored')` — all bets have `last_monitored_at: null`
  - `test('hero shows relative time when a bet has last_monitored_at')` — `mockBet.last_monitored_at` set
  - `test('hero shows pipeline strip with 5 stage badges')` — `pipelineState.stages` has 5 items
  - `test('hero pipeline strip renders static IDLE pills when pipelineState is undefined')`
  - `test('hero shows dash not zero when bets query is loading')` — loading state
  - `test('hero shows dash not zero when interventions query fails')` — error state
  - `test('hero does not render static FEATURE_CARDS')` — no "Signal Engine" card text in DOM
  - `test('stat card for active directions links to /workspace/directions')`
  - `test('stat card for pending approvals links to /workspace/inbox')`

### Implementation (GREEN)
- [ ] Remove `FEATURE_CARDS` constant and its rendered grid from the hero state
- [ ] Add **Row 1 — Live Stats** (3 cards using `useQuery`):
  ```tsx
  // Card 1 — Active Directions
  const { data: bets } = useQuery({ queryKey: ["bets", workspaceId], queryFn: () => listBets(workspaceId), enabled: workspaceId !== "default_workspace" });
  
  // Card 2 — Pending Approvals
  const { data: interventions } = useQuery({ queryKey: ["interventions", workspaceId], queryFn: () => getInterventions(workspaceId), enabled: workspaceId !== "default_workspace" });
  const pendingCount = interventions?.filter(i => i.pipeline_status === "awaiting_approval").length ?? 0;
  
  // Card 3 — Last Scan
  const lastScan = bets?.reduce((latest, b) => {
    if (!b.last_monitored_at) return latest;
    return !latest || b.last_monitored_at > latest ? b.last_monitored_at : latest;
  }, null as string | null);
  ```
- [ ] Render 3 stat cards in a row (link Card 1 → `/workspace/directions`, Card 2 → `/workspace/inbox`)
- [ ] Add **Row 2 — Pipeline Status Strip**: render 5 agent name pills using `pipelineState?.stages ?? []`
  - Each pill: agent name + colored dot based on stage status
  - Use existing `STAGE_NAMES` or derive from `pipelineState` — fallback to static names if stages empty
- [ ] Keep: quick-action chips, CommandBar, BetDeclarationModal — do not remove

### Verify
- [ ] `npm run build` → 0 errors
- [ ] Hero shows real counts from backend (not 0 if bets exist)
- [ ] Pipeline strip renders 5 agent names

---

## Phase 3 — "Scan for Risks" CTA on Direction Detail [P0] [P with Phase 1]

**Bug:** No way to trigger a scan from the direction detail page.  
**File:** `frontend/app/workspace/directions/[id]/page.tsx`

### TDD — Write tests first (RED)
- [ ] Create `frontend/__tests__/DirectionDetail.test.tsx`:
  - `test('scan button is visible when bet is loaded')` — mock `getBet` → `mockBet`
  - `test('scan button is absent when bet is loading')` — `getBet` in-flight
  - `test('scan button navigates to /workspace with prefilled message on click')` — verify `router.push` called with `/workspace?message=Scan+direction+bet-1+for+risks`
  - `test('scan button URL-encodes bet.id correctly')` — bet.id with spaces/special chars → `encodeURIComponent` applied
  - `test('scan button does not trigger twice on rapid double-click')` — click twice → `router.push` called exactly once

### Implementation (GREEN)
- [ ] In `DirectionDetailContent` component, add a "Scan for risks" button to the header panel:
  ```tsx
  import { useRouter } from "next/navigation";
  const router = useRouter();
  
  <button
    onClick={() => router.push(`/workspace?message=Scan+direction+${bet.id}+for+risks`)}
    className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
  >
    <Zap size={14} /> Scan for risks
  </button>
  ```
- [ ] Position: top-right of the header panel, alongside the bet status badge
- [ ] Also add this button to the empty interventions state (replaces passive "Aegis will flag risks..." copy)

### Verify
- [ ] `npm run build` → 0 errors
- [ ] Open any direction detail → "Scan for risks" button visible top-right
- [ ] Click → navigates to home page with prefilled prompt

---

## Phase 4 — Fix Synthetic Health Score [P1]

**Bug:** `declaration_confidence ?? 0.8` means every bet starts at 80% regardless of risk state.  
**Files:** `frontend/app/workspace/directions/page.tsx`, `frontend/app/workspace/directions/[id]/page.tsx`

### TDD — Write tests first (RED)
- [ ] Create `frontend/__tests__/deriveHealthScore.test.ts` (unit test — pure function, no DOM):
  - `test('returns null when bet has never been monitored')` — `last_monitored_at: null` → `null`
  - `test('returns 35 when bet has a pending awaiting_approval intervention')` — `[mockIntervention]`
  - `test('returns 35 even with multiple pending interventions')` — idempotent
  - `test('returns 68 when bet has a recent approved-and-complete intervention (< 7 days)')` — `[mockIntApproved]`
  - `test('returns 88 when bet has been monitored and no pending/recent interventions')` — `mockBet, []`
  - `test('returns 88 when interventions list is undefined')` — graceful fallback, not crash
  - `test('health ring renders — when score is null')`
  - `test('health bar renders — when score is null')`
- [ ] Replace the `healthScore` derivation in both files with:
  ```ts
  function deriveHealthScore(bet: Bet, interventions?: Intervention[]): number | null {
    if (!bet.last_monitored_at) return null; // Never scanned → show "—"
    const pending = interventions?.some(i => i.pipeline_status === "awaiting_approval");
    if (pending) return 35; // Active risk flagged
    const recentAccepted = interventions?.some(i =>
      i.pipeline_status === "complete" &&
      i.pipeline_checkpoint === "approved" &&
      i.created_at > new Date(Date.now() - 7 * 86400_000).toISOString()
    );
    if (recentAccepted) return 68; // Recently recovered
    return 88; // Monitored, no active risk
  }
  ```
- [ ] In `directions/page.tsx`: `getInterventionsByBet` may not be available on the list page (no per-bet interventions). Use a simpler heuristic: if `bet.last_monitored_at` is null → show `—`; else derive from `bet.declaration_confidence` only as last resort (documented)
- [ ] In `directions/[id]/page.tsx`: use full `deriveHealthScore(bet, interventions)` since interventions are already fetched
- [ ] Update `HealthScoreRing` and `HealthBar` to accept `score: number | null` — render `"—"` when null

### Verify
- [ ] New bet with no monitoring → health shows `—`, not `80`
- [ ] Bet with awaiting_approval intervention → health ≤ 40

---

## Phase 5 — Mission Control: Scan Button + Last Scan [P1]

**Bug:** Mission Control always shows IDLE, no way to trigger scan, `staleTime=60s` on bets query causes stale data.  
**File:** `frontend/app/workspace/mission-control/page.tsx`  
**Confirmed:** `staleTime: 60 * 1000` is on the `listBets` query (line ~150); interventions query is already 15_000 — leave that alone.

### TDD — Write tests first (RED)
- [ ] Create `frontend/__tests__/MissionControl.test.tsx`:
  - `test('scan all button is visible in the page header')`
  - `test('scan all button is disabled while mutation is in-flight')` — mutation pending → button `disabled`
  - `test('scan all button calls discoverBets with correct workspaceId')` — click → mutation called once
  - `test('scan all button shows spinner while in-flight')` — `Loader2` icon present during mutation
  - `test('last scan shows Never when no bet has last_monitored_at')` — all null
  - `test('last scan shows relative timestamp from most recent last_monitored_at')` — `mockBet`
  - `test('last scan shows dash when bets query fails')` — error state, no crash
  - `test('scan all does not submit twice on double-click')` — `discoverBets` called exactly once
- [ ] Reduce `staleTime` from `60_000` to `10_000` on the bets `useQuery`
- [ ] Add "Scan all" button in the header that calls `discoverBets(workspaceId)`
  - Use existing `useMutation` pattern from the directions page
  - Show `Loader2` spinner during mutation
  - Invalidate `["bets", workspaceId]` on success
- [ ] Add "Last scan: N min ago" below the Pipeline Stages header
  - Source: `max(bets.map(b => b.last_monitored_at))` → format with `formatDistanceToNow` from `date-fns` (already a dep)
  - Fallback: "Last scan: Never"

### Verify
- [ ] `npm run build` → 0 errors
- [ ] "Scan all" button visible on Mission Control
- [ ] Last scan timestamp visible below pipeline header

---

## Phase 6 — Empty State CTAs [P2]

**Files:** `activity/page.tsx`, `inbox/page.tsx`, `suppression/page.tsx`

### TDD — Write tests first (RED) [P]
- [ ] Create `frontend/__tests__/EmptyStates.test.tsx`:
  - `test('activity empty state has a link to /workspace')` — no items → CTA link present [P]
  - `test('activity shows skeleton not CTA when items are loading')` — query in-flight [P]
  - `test('inbox empty state shows monitoring count from API')` — `listBets` → `[mockBet]` → "1 directions" in copy [P]
  - `test('inbox empty state shows copy without count if bets query unavailable')` — `listBets` error → count omitted, copy still renders [P]
  - `test('suppression empty state shows governor message')` — no suppressed items → correct copy [P]
  - `test('empty state links are keyboard-accessible')` — each CTA is a `<Link>` or has `role=link` [P]
- [ ] `activity/page.tsx` empty state: add "Start by scanning a direction →" `<Link href="/workspace">`  [P]
- [ ] `inbox/page.tsx` empty state: replace generic text with "No pending approvals — Aegis is monitoring {bets.length} directions." [P]
- [ ] `suppression/page.tsx` empty state: add "No suppressions — Governor is passing all interventions." [P]

### Verify
- [ ] Each empty state has at least one actionable link or meaningful contextual copy
- [ ] `npm run build` → 0 errors

---

## Phase 7 — Final Validation

- [ ] `npm run build` → 0 errors, 9+ routes
- [ ] `npm run lint` → 0 errors
- [ ] Manual walkthrough: open app → immediately see agentic activity on hero page
- [ ] Inbox icon shows badge when pending intervention exists
- [ ] Direction detail has scan CTA
- [ ] Mark spec 006 as **Closed**
