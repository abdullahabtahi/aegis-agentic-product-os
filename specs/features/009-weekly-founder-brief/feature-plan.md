# Feature Plan: 009 — Weekly Founder Brief

**Created:** April 2026  
**Priority:** HIGH — Hackathon Demo Killer  
**Source:** Lenny Skills — `planning-under-uncertainty` (Shaun Clowes — "data as compass not GPS"), `post-mortems-retrospectives` (Ben Williams — "weekly Impact and Learnings reviews"), `measuring-product-market-fit` (Raaz Herzberg — "questions change: 'when can we start?'")  
**Status:** Open

> **Insight driving this feature:**
> Ben Williams: *"The teams continuously document any learnings from data exploration, from experimentation. Hold weekly 'Impact and Learnings' reviews focused on insights rather than status updates."*
>
> Every founder product in this space is **pull** — you have to remember to open it, click scan, then interpret results. The Weekly Founder Brief inverts this: **Aegis opens Monday morning and tells you exactly what to think about**. It is the "why would I check this every day?" problem solved.

---

## Summary

Every Monday (or on first open of the week), the Aegis chat surface proactively opens with a **Weekly Founder Brief** — a concise, structured digest of:

1. Bets that improved conviction since last week
2. Bets with kill criteria triggered or overdue
3. The single most urgent intervention awaiting action
4. One "what to think about" question for the week (surfaced by conversational agent)

The brief is not a static report. It is a **conversational entry point** — clicking any item opens a scoped chat session or navigates to the relevant page.

---

## Scope

- `GET /api/brief?workspace_id=...` — new endpoint returning `FounderBrief` object
- `BriefCard` component — compact card in chat panel sidebar  
- Conversational agent proactive trigger — on first message-less open of the week, agent automatically sends the brief as the first message
- `useBrief` hook — fetches brief, caches with `staleTime: 1h`
- Brief includes: conviction delta per bet, kill criteria status, pending intervention count, weekly question
- Dismissible for the session (resurfaces next Monday)

## Out of Scope

- Email delivery (Resend/SendGrid integration) — Phase 2
- Push notifications — Phase 2
- Custom brief schedule (daily, bi-weekly) — Phase 2
- Brief history / archive — Phase 2
- AI-generated personalized weekly question (static templates for MVP)

---

## Data Model

```typescript
// NEW — add to context/data-schema.ts

export interface BriefBetSummary {
  bet_id: string
  bet_name: string
  conviction_delta: number | null     // +N or -N since last week; null if no prior snapshot
  conviction_level: ConvictionLevel
  conviction_total: number
  kill_criteria_status?: KillCriteriaStatus
  kill_criteria_condition?: string
}

export interface FounderBrief {
  workspace_id: string
  generated_at: string                // ISO 8601
  week_label: string                  // e.g. "Week of April 28, 2026"
  
  bets_improving: BriefBetSummary[]   // conviction delta > 0, sorted desc by delta
  bets_at_risk: BriefBetSummary[]     // conviction < 30 OR kill_criteria triggered
  
  pending_intervention_count: number
  most_urgent_intervention?: {
    id: string
    bet_name: string
    action_type: ActionType
    severity: Severity
    headline: string
  }
  
  weekly_question: string             // "What has to be true this week for [most_at_risk_bet] to stay alive?"
  
  // Derived stats
  total_bets: number
  avg_conviction: number | null
  scans_this_week: number
}
```

---

## Weekly Question Templates

The `weekly_question` is selected from a curated template set based on the brief's data state. Templates are server-side selected (not LLM generated) for speed and reliability:

| Condition | Question Template |
|---|---|
| Kill criteria triggered | `"You committed to '{condition}' by {deadline}. What's your next move?"` |
| 1+ bets in Critical conviction | `"'{bet_name}' has low conviction (score: {score}). Have you exhausted the possibilities, or just gotten tired?"` |
| All bets Developing+ | `"Your bets all look healthy. What assumption are you most confident about right now? Which one scares you most?"` |
| No scan in 14+ days | `"It's been {days} days since your last scan. What changed since then that you haven't checked on?"` |
| Default (healthy) | `"If you could only move one bet forward meaningfully this week, which would it be and why?"` |

---

## Component Inventory

### Frontend Components

| Component | File | Purpose |
|---|---|---|
| `BriefCard` | `components/brief/BriefCard.tsx` | Compact card: week label, 3–5 bullet lines, weekly question, CTA links |
| `BriefBetRow` | `components/brief/BriefBetRow.tsx` | Single bet summary row with conviction delta indicator |
| `BriefConvictionDelta` | `components/brief/BriefConvictionDelta.tsx` | `+12 ↑` in emerald or `-8 ↓` in red; `—` when null |
| `useBrief` | `hooks/useBrief.ts` | `useQuery` wrapper for `GET /api/brief`; `staleTime: 3600000` (1h) |
| `useWeeklyBriefTrigger` | `hooks/useWeeklyBriefTrigger.ts` | Returns `{ shouldShowBrief, dismissBrief }` — checks localStorage for `aegis_brief_week_{week_number}` |

### Chat Panel Integration

The brief surfaces in the chat panel (`/workspace/chat`) as the **first message** when:
- The page loads with an empty session (no prior messages)
- `useWeeklyBriefTrigger.shouldShowBrief` is true

The conversational agent's initial system message is augmented with brief data:
- No new API call during chat — brief data is pre-fetched via `useBrief` hook
- Brief formatted as a structured markdown message, sent as an assistant message from `conversational.py`

### Backend

| File | Change |
|---|---|
| `context/data-schema.ts` | Add `BriefBetSummary` + `FounderBrief` types |
| `backend/models/responses.py` | `FounderBriefResponse` Pydantic model |
| `backend/app/main.py` | `GET /brief?workspace_id=` endpoint |
| `backend/app/app_utils/brief_builder.py` | NEW — `build_founder_brief(workspace_id, db) → FounderBrief` pure function |
| `backend/app/agents/conversational.py` | `get_founder_brief` tool + proactive brief intro message |

---

## Brief Endpoint Logic

```python
# build_founder_brief pseudocode

def build_founder_brief(workspace_id: str, bets, snapshots) -> FounderBrief:
    # Group: latest snapshot per bet
    # Compute conviction delta: latest.conviction_score.total - prior_week_snapshot.conviction_score.total
    # Separate: improving (delta > 0) vs at-risk (level critical OR kill_criteria.status triggered)
    # Find most urgent: intervention with status=pending, sorted by severity desc
    # Select weekly_question template based on data state
    # Return immutable FounderBrief
```

No LLM call. Entirely deterministic. Response time < 200ms.

---

## UI Layout

### BriefCard (in Chat Sidebar)

```
┌──────────────────────────────────────────────────────────────┐
│  📋 Week of April 28, 2026                         [✕ Dismiss]│
│                                                               │
│  Your bets this week:                                         │
│  ● Onboarding Redesign     Developing 62   +8 ↑              │
│  ⚠ Voice Capture           Critical 22    TRIGGERED          │
│                                                               │
│  1 intervention awaiting approval:                            │
│  → Kill Bet: Voice Capture  (Critical)                        │
│                                                               │
│  💬 This week's question:                                     │
│  "You committed to 'ship to 3 paying users by May 1'.         │
│   What's your next move?"                                     │
│                                                               │
│  [Open Inbox →]   [View Directions →]                        │
└──────────────────────────────────────────────────────────────┘
```

### Chat Panel — Auto-Brief Message (first open of week)

```
Assistant:
Good morning. Here's your brief for the week of April 28.

📊 Conviction:
  • Onboarding Redesign: Developing (62) — up 8 points since last week
  • Voice Capture: Critical (22) — Kill criteria triggered

⚠️ Awaiting your decision:
  • Kill Bet: Voice Capture — confidence 87%

💬 This week's question:
You committed to "ship to 3 paying users by May 1."
What's your next move?

Type "tell me more about Voice Capture" or "show pending interventions" to dig in.
```

---

## Design Principles

- **Monday Morning Energy** — brief header always shows `"Week of [date]"`, not just dates. Temporal anchoring creates habit formation
- **3 items max in each section** — brief is bounded; never shows all 10 bets. Cognitive load must be < 30s to read
- **Conversational CTA** — the brief ends with a question, not a button. This is what makes it conversational vs dashboard
- **No LLM on hot path** — brief is deterministic; LLM only activates on the chat response, not brief generation
- **Dismiss is honest** — dismissing hides it for the current week only; it resurfaces the following Monday automatically
