# Feature Plan: 007 — Kill Criteria Declaration

**Created:** April 2026  
**Priority:** HIGH — Hackathon Wow Factor  
**Source:** Lenny Skills — `post-mortems-retrospectives` (Annie Duke), `planning-under-uncertainty` (Eric Ries), `scoping-cutting`  
**Status:** Open

> **Insight driving this feature:**
> Annie Duke: *"A pre-mortem is only effective if it results in 'kill criteria' — pre-determined signals that will trigger a pivot or shutdown."*
>
> Aegis currently detects risk reactively. Kill Criteria transforms it into a **commitment-accountability engine**: the founder pre-declares failure conditions, and Aegis enforces them. The intervention is no longer the AI guessing — it's the founder being held to their own word.

---

## Summary

When a founder declares a strategic bet, they commit to two things:

1. **What "working" looks like** — the condition that must be true by a deadline
2. **What they'll do if it fails** — `pivot | kill | extend` pre-committed response

Signal Engine evaluates these conditions every scan. When a condition is not met by its deadline, Aegis surfaces a `kill_criteria_triggered` intervention — the most authoritative intervention type in the system because it's grounded in the founder's own prior commitment, not AI inference.

---

## Scope

- `KillCriteria` value object added to `context/data-schema.ts` (schema first)
- `Bet.kill_criteria` field added (`KillCriteria[]`, optional — single item for MVP)
- `BetDeclarationModal` — new "Kill Criteria" step (Step 2 after Basic Info)
- `BetDetailCard` / Directions page — Kill Criteria status badge per bet
- `Signal Engine` — evaluate `kill_criteria` conditions; emit `kill_criteria_triggered` evidence type
- Backend `POST /bets` — accept and persist `kill_criteria`
- Backend `GET /bets` — return `kill_criteria` and `kill_criteria_status` (computed)
- Conversational agent — handles "what are my kill criteria?" and shows triggered status in proactive scan context

## Out of Scope

- Kill criteria editing post-declaration (Phase 2 — pre-commit to immutability for hackathon)
- Kill criteria templates / suggestions from agent (Phase 2)
- Automated kill execution without founder approval (always requires explicit action)
- Multiple kill criteria per bet (single criterion for MVP — avoids AND/OR logic complexity)
- Webhook-based real-time evaluation (batch scan evaluation only)

---

## Schema Changes (data-schema.ts first)

```typescript
// NEW — add to data-schema.ts before any implementation

export type KillCriteriaAction = "pivot" | "kill" | "extend"

export type KillCriteriaStatus =
  | "pending"         // deadline not yet reached — monitoring
  | "triggered"       // deadline passed AND condition NOT met
  | "met"             // condition was met before deadline — bet survives
  | "waived"          // founder manually waived this criterion

export interface KillCriteria {
  condition: string           // "Ship to 3 paying users by May 1"
  deadline: string            // ISO 8601 date
  committed_action: KillCriteriaAction
  status: KillCriteriaStatus  // computed by Signal Engine; default "pending"
  triggered_at?: string       // ISO 8601; set when status transitions to "triggered"
  waived_at?: string          // ISO 8601; set when founder manually waives
  waived_reason?: string
}

// Bet interface — add:
// kill_criteria?: KillCriteria   (single criterion, optional)
```

---

## Component Inventory

### Frontend Components

| Component | File | Purpose |
|---|---|---|
| `KillCriteriaStep` | `components/bets/KillCriteriaStep.tsx` | Step 2 of declaration modal — condition text, deadline picker, committed action selector |
| `KillCriteriaStatusBadge` | `components/bets/KillCriteriaStatusBadge.tsx` | Pill chip: `MONITORING` / `TRIGGERED` / `MET` / `WAIVED` with color coding |
| `KillCriteriaCard` | `components/bets/KillCriteriaCard.tsx` | Detailed card on Directions page — condition, deadline countdown, committed action |
| `KillCriteriaTriggeredAlert` | `components/bets/KillCriteriaTriggeredAlert.tsx` | Red urgency banner shown on Directions page when status === "triggered" |
| Updated `BetDeclarationModal` | `components/bets/BetDeclarationModal.tsx` | Adds Step 2 (KillCriteriaStep) — progressive: skip if not provided |
| Updated `BetCard` | `components/bets/BetCard.tsx` | Adds `KillCriteriaStatusBadge` below the health indicator |

### Backend

| File | Change |
|---|---|
| `context/data-schema.ts` | Add `KillCriteria` type + `KillCriteriaStatus` enum + `KillCriteriaAction` type |
| `backend/models/schema.py` | Mirror `KillCriteria` as Pydantic model with validators |
| `backend/app/main.py` | Accept `kill_criteria` in `POST /bets`; compute `kill_criteria_status` in `GET /bets` |
| `backend/app/agents/signal_engine.py` (or service) | Evaluate kill criteria deadline vs today; emit `kill_criteria_triggered` evidence |
| `backend/db/repository.py` | Persist `kill_criteria` as JSONB in `bets` table |
| `backend/app/agents/conversational.py` | `get_kill_criteria_status` tool; proactive mention in scan summary |

### Data Flow

```
BetDeclarationModal (Step 2: Kill Criteria)
  │  POST /bets  { kill_criteria: { condition, deadline, committed_action } }
  ▼
backend/app/main.py → repository.save_bet()
  │  kill_criteria stored as JSONB
  ▼
Signal Engine (each scan cycle)
  │  for each bet with kill_criteria:
  │    if today >= deadline AND condition_not_met:
  │      evidence.append({ type: "kill_criteria_triggered", ... })
  │      bet.kill_criteria.status = "triggered"
  ▼
Product Brain → Coordinator → Governor
  │  Coordinator sees kill_criteria_triggered evidence
  │  → selects kill_bet or pre_mortem_session intervention
  ▼
Intervention surfaces in /workspace/inbox
  │  ApprovalCard shows: "Kill Criteria Triggered — you said: '...'"
  ▼
Founder approves → Executor writes to Linear
```

---

## UI Layout

### BetDeclarationModal — Step 2 (Kill Criteria)

```
┌─────────────────────────────────────────────────────────────┐
│  Step 2 of 2: Set Kill Criteria                    [Skip →] │
│                                                             │
│  When should we evaluate this bet?                          │
│                                                             │
│  "This bet is failing if..."                                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  e.g. "We haven't shipped to 3 paying users by May 1" │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  Deadline  [May 01, 2026 ▼]                                 │
│                                                             │
│  If this is triggered, I will:                              │
│  ○ Pivot the approach                                       │
│  ● Kill the bet                                             │
│  ○ Extend and reassess                                      │
│                                                             │
│                       [Back]  [Declare Direction →]        │
└─────────────────────────────────────────────────────────────┘
```

### Directions Page — Kill Criteria Card

```
┌───────────────────────────────────────────────────────────────┐
│  Voice Capture                          ● TRIGGERED  [!]      │
│  ─────────────────────────────────────────────────────────── │
│  Kill Criteria                                                │
│  "Ship to 3 paying users by May 1"                           │
│  Deadline: May 1, 2026 (overdue by 3 days)                   │
│  Committed action: Kill the bet                              │
│                                                              │
│  [View Intervention →]                                       │
└───────────────────────────────────────────────────────────────┘
```

---

## Design Principles

- **Glassmorphic** — matches existing `glass-panel` pattern (white/slate + indigo accent)
- **Progressive** — Kill Criteria step has a visible "Skip" action; not required to ship
- **Honest** — `TRIGGERED` badge uses red; `MET` uses emerald; `MONITORING` uses slate
- **Annie Duke's pre-commitment principle** — the condition and committed action shown together always, never separated
- **Countdown** — deadline shown as `"3 days remaining"` or `"overdue by 3 days"`, never just a date
