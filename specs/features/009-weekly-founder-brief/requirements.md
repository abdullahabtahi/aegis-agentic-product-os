# Requirements: 009 — Weekly Founder Brief

---

## Schema Requirements

### SR-WB-001: FounderBrief Data Model
Add to `context/data-schema.ts` **before** any implementation:

```typescript
export interface BriefBetSummary {
  bet_id: string
  bet_name: string
  conviction_delta: number | null      // signed int; null when no prior snapshot
  conviction_level: ConvictionLevel
  conviction_total: number
  kill_criteria_status?: KillCriteriaStatus
  kill_criteria_condition?: string
}

export interface FounderBrief {
  workspace_id: string
  generated_at: string
  week_label: string                   // "Week of April 28, 2026"
  bets_improving: BriefBetSummary[]    // conviction_delta > 0; max 3 items returned
  bets_at_risk: BriefBetSummary[]      // level "critical" OR kill_criteria triggered; max 3 items
  pending_intervention_count: number
  most_urgent_intervention?: {
    id: string
    bet_name: string
    action_type: ActionType
    severity: Severity
    headline: string
  }
  weekly_question: string
  total_bets: number
  avg_conviction: number | null
  scans_this_week: number
}
```

---

## Backend Requirements

### BR-WB-001: GET /brief Endpoint
- Route: `GET /brief?workspace_id={id}`
- Returns: `FounderBriefResponse` (mirrors `FounderBrief`)
- Auth: same as all other endpoints (no additional auth for hackathon)
- Must respond < 300ms (no LLM calls)
- `workspace_id` absent or unknown → 400 with `"workspace_id required"`

---

### BR-WB-002: build_founder_brief() Pure Function
- Location: `backend/app/app_utils/brief_builder.py`
- Signature: `def build_founder_brief(workspace_id: str, bets: list, snapshots_by_bet: dict, interventions: list) → FounderBrief`
- No DB reads inside the function — caller passes all data
- No LLM calls inside the function

**`bets_improving` logic:**
- For each bet with `conviction_score` in latest snapshot:
  - Find snapshot from 7+ days ago (prior week baseline)
  - `conviction_delta = latest.conviction_score.total - prior.conviction_score.total`
  - Include if `conviction_delta > 0`
  - Sort descending by delta; limit to 3

**`bets_at_risk` logic:**
- Include bets where: `conviction_score.level == "critical"` OR `kill_criteria.status == "triggered"`
- Sort: triggered kill criteria first, then by conviction ascending; limit to 3

**`most_urgent_intervention` logic:**
- Filter `interventions` where `status == "pending"`
- Sort by severity: `critical > high > medium > low`
- Return the first (most urgent)

**`weekly_question` selection logic (in priority order):**
1. Any bet has `kill_criteria.status == "triggered"` → use kill criteria template: `f"You committed to '{condition}' by {deadline_str}. What's your next move?"`
2. Any bet has conviction level `"critical"` → use critical template
3. No scan in 14+ days (all bets `last_monitored_at` older than 14 days) → use stale template
4. All bets `developing` or better → use healthy template
5. Default question

**`week_label` format:** `f"Week of {most_recent_monday.strftime('%B %-d, %Y')}"`

**Edge cases:**
- No bets in workspace → return brief with all empty arrays, `total_bets: 0`, `weekly_question: "Declare your first strategic direction to get started."`
- All bets unscanned → `bets_improving: []`, `bets_at_risk: []`, `avg_conviction: null`
- No prior-week snapshot for delta → `conviction_delta: null` (not 0; null is semantically different)
- `bets_improving` and `bets_at_risk` may contain the same bet (a bet can be improving AND at risk simultaneously)

---

### BR-WB-003: Conversational Agent — get_founder_brief Tool
- Add `get_founder_brief` tool to `conversational.py`:
  - Calls `GET /brief` internally (via `httpx` or direct function call)
  - Returns formatted markdown string for the agent to include in its message
  - Tool description: `"Get the weekly founder brief — call this when the user opens the chat for the first time this week or asks 'what should I focus on this week'"`
- Proactive behavior: when `tool_context.state.get("session_message_count", 0) == 0` AND `tool_context.state.get("brief_shown_this_week") is not True`:
  - Agent calls `get_founder_brief` automatically on first response
  - Sets `tool_context.state["brief_shown_this_week"] = True` after showing

---

## Frontend Requirements

### FR-WB-01: useBrief Hook
```typescript
// hooks/useBrief.ts
export function useBrief(workspaceId: string) {
  return useQuery({
    queryKey: ["brief", workspaceId],
    queryFn: () => fetch(`${BACKEND_URL}/brief?workspace_id=${workspaceId}`).then(r => r.json()),
    staleTime: 60 * 60 * 1000,  // 1 hour
    enabled: !!workspaceId && workspaceId !== "default_workspace",
  })
}
```

---

### FR-WB-02: useWeeklyBriefTrigger Hook
```typescript
// hooks/useWeeklyBriefTrigger.ts
// Returns { shouldShowBrief, dismissBrief }
// shouldShowBrief: true if localStorage key "aegis_brief_week_{ISO_week}" is absent
// dismissBrief: sets the localStorage key; shouldShowBrief becomes false for 7 days
```

- ISO week number: `new Date().toISOString().slice(0, 10)` rounded to Monday (use `date-fns/startOfISOWeek` or manual Sunday-to-Monday calculation)
- `dismissBrief()` sets: `localStorage.setItem("aegis_brief_week_${weekKey}", "dismissed")`

---

### FR-WB-03: BriefCard Component
- Render when `useBrief` returns data AND `useWeeklyBriefTrigger.shouldShowBrief === true`
- Structure:
  - Header: `"📋 {week_label}"` + `[✕ Dismiss]` button (calls `dismissBrief`)
  - Section: `"Your bets this week:"` — list of `BriefBetRow` (up to 3 from `bets_at_risk` + up to 3 from `bets_improving`, deduplicated)
  - Section: `"{pending_intervention_count} intervention(s) awaiting approval:"` — single row for `most_urgent_intervention` (if present)
  - Section: `"💬 This week's question:"` — `weekly_question` in `italic`
  - Footer: `[Open Inbox →]` (to `/workspace/inbox`) + `[View Directions →]` (to `/workspace/directions`)
- `[✕ Dismiss]`: calls `dismissBrief()`; card unmounts immediately
- Renders at the top of the chat sidebar or inline in chat as an assistant bubble — see integration note below

**Edge cases:**
- `bets_improving` and `bets_at_risk` both empty → section hidden; brief still shows pending interventions and weekly question
- `pending_intervention_count === 0` → intervention section hidden entirely
- `most_urgent_intervention` absent → no intervention row

---

### FR-WB-04: BriefBetRow Component
- One row per `BriefBetSummary`:
  - `⚠` icon if `kill_criteria_status === "triggered"`, else `●` colored by conviction level
  - Bet name (truncated to 24 chars with `…`)
  - `<ConvictionLabel>` (from feature 008)
  - `<BriefConvictionDelta>`: `"+{n} ↑"` in emerald / `"-{n} ↓"` in red / `"—"` when null

---

### FR-WB-05: Chat Panel Auto-Brief
- In `/workspace/chat` page:
  - On mount: if `shouldShowBrief` AND session has 0 messages AND brief data loaded:
    - Render the `BriefCard` as the first item in the message list (not an actual API message — UI-only component)
    - Does NOT send a message to the backend; the card is a UI fixture
  - When the user types their first message: `BriefCard` remains visible above the conversation
  - `[✕ Dismiss]` on the card removes it from the message list and calls `dismissBrief`

**Edge cases:**
- Brief data still loading when user types → don't block chat; render brief card when loaded below user's first message
- `useBrief` errors → silently skip brief; don't show error state in chat

---

## Acceptance Criteria

| ID | Criterion |
|---|---|
| AC-001 | `GET /brief` responds < 300ms with no LLM calls |
| AC-002 | `build_founder_brief` is a pure function with testable inputs/outputs |
| AC-003 | Kill criteria triggered bet appears in `bets_at_risk` in brief |
| AC-004 | `weekly_question` uses kill criteria template when any bet is triggered |
| AC-005 | `conviction_delta` is null (not 0) when no prior snapshot exists |
| AC-006 | Chat panel shows BriefCard on first open of the week |
| AC-007 | BriefCard dismiss persists for 7 days via localStorage |
| AC-008 | Brief not shown if user already dismissed it this week (localStorage check) |
| AC-009 | `[Open Inbox →]` navigates to `/workspace/inbox` |
| AC-010 | No LLM calls in brief generation path |
