# Feature Plan: 010 — 4Ps Pivot Diagnosis

**Created:** April 2026  
**Priority:** MEDIUM-HIGH — Depth Play for Judges  
**Source:** Lenny Skills — `startup-pivoting` (Todd Jackson — "4Ps framework", Stewart Butterfield — "have you exhausted the possibilities?"), `problem-definition`, `planning-under-uncertainty` (Eric Ries — "create decision triggers, not fixed plans")  
**Status:** Open

> **Insight driving this feature:**
> Todd Jackson: *"Most founders do a 10% pivot when they need a 200% pivot."*  
> Stewart Butterfield: *"The decision is about have you exhausted the possibilities?"*
>
> When Aegis surfaces `strategy_unclear` at high severity, the current intervention is a generic `pre_mortem_session` — a blank Linear issue. That's a 10% intervention for a 200% problem. The 4Ps Pivot Diagnosis turns the chat into a **structured Socratic session** grounded in Todd Jackson's four-lens framework, producing a `PivotDiagnosis` artifact that travels with the intervention card. It's the difference between "Aegis flagged an issue" and "Aegis helped me think through whether to kill this bet."

---

## Summary

When the conversational agent detects a high-severity strategic risk (`strategy_unclear`, `execution_issue`, or `kill_criteria_triggered` with no clear path), it offers — not forces — a **4Ps Pivot Diagnosis** session. The session is 4 structured questions (Problem, Persona, Product, Positioning), each with guided follow-ups. The founder's answers are synthesized into a `PivotDiagnosis` record that:

1. Identifies which of the 4Ps is weakest
2. Recommends a diagnosis: `"stay_course" | "small_pivot" | "large_pivot" | "kill"`
3. Attaches to the pending intervention card as a `pivot_diagnosis` field
4. Is permanently visible on the bet detail page

---

## Scope

- `PivotDiagnosis` value object in `context/data-schema.ts`
- `run_pivot_diagnosis` tool in `conversational.py` — orchestrates 4-question session
- `PivotDiagnosisCard` component — renders diagnosis summary on intervention card + bet detail page
- `Intervention.pivot_diagnosis` optional field (JSONB in DB)
- Backend: `POST /interventions/{id}/pivot-diagnosis` — saves diagnosis to intervention
- Conversational agent: recognizes "should I kill this bet?", "should I pivot?", "what's wrong with X" as triggers

## Out of Scope

- Fully automated pivot recommendation without founder input (always requires conversation)
- Saving partial diagnosis sessions (session ends if user navigates away — MVP)
- Multi-turn follow-up on individual Ps (one response per P for MVP)
- Exporting diagnosis as a document (Phase 2)
- Historical diagnosis comparison (Phase 2)

---

## The 4Ps Framework (Todd Jackson)

| P | Question | What it probes |
|---|---|---|
| **Problem** | "Are you still confident the core problem is real and worth solving?" | Problem-solution fit — is the pain real? |
| **Persona** | "Is the specific person/team you're targeting the right first customer?" | Customer-fit — are you selling to the right person? |
| **Product** | "Is your current approach (the actual solution) the right way to solve the problem?" | Solution-market fit — is this the right product? |
| **Positioning** | "Is the way you're framing and selling this landing correctly?" | Message-market fit — does your story resonate? |

Each question has a 1–5 confidence scale + optional freeform explanation.

---

## Diagnosis Recommendation Logic

Based on the 4 confidence scores (1–5 each):

| Condition | Recommendation |
|---|---|
| All 4 ≥ 4 | `stay_course` — "Strong conviction across all four lenses. The issue may be execution, not strategy." |
| 1–2 P scores ≤ 2 | `small_pivot` — "Adjust {weak P(s)} before concluding this bet is dead." |
| 3+ P scores ≤ 2 | `large_pivot` — "Multiple foundational assumptions are weak. A significant pivot is warranted." |
| Problem score ≤ 2 (regardless of others) | `kill` — "If the problem isn't real, no other adjustment saves the bet." |

Tiebreaker: Problem beats all others — a weak problem score always overrides to `kill` regardless of other Ps.

---

## Data Model

```typescript
// NEW — add to context/data-schema.ts

export type PivotRecommendation = "stay_course" | "small_pivot" | "large_pivot" | "kill"

export interface PivotPScore {
  p: "problem" | "persona" | "product" | "positioning"
  label: string                       // "Problem", "Persona", "Product", "Positioning"
  confidence: number                  // 1–5 (founder's self-assessed conviction for this P)
  founder_note: string                // freeform response (may be empty)
  is_weakest: boolean                 // true for the P with lowest confidence
}

export interface PivotDiagnosis {
  id: string
  intervention_id: string
  bet_id: string
  conducted_at: string                // ISO 8601
  scores: PivotPScore[]               // always 4 items
  recommendation: PivotRecommendation
  recommendation_rationale: string    // 1–2 sentence explanation
  weakest_p: "problem" | "persona" | "product" | "positioning"
}

// Intervention — add optional field:
// pivot_diagnosis?: PivotDiagnosis
```

---

## Component Inventory

### Frontend Components

| Component | File | Purpose |
|---|---|---|
| `PivotDiagnosisCard` | `components/interventions/PivotDiagnosisCard.tsx` | Displays completed diagnosis: 4 P scores as a mini radar summary + recommendation |
| `PivotScoreRow` | `components/interventions/PivotScoreRow.tsx` | Single P row: label + 5-dot confidence scale + founder note excerpt |
| `PivotRecommendationBadge` | `components/interventions/PivotRecommendationBadge.tsx` | Pill: `STAY_COURSE` / `SMALL_PIVOT` / `LARGE_PIVOT` / `KILL` with color |
| Updated `ApprovalCard` | `components/interventions/ApprovalCard.tsx` | If `pivot_diagnosis` present: render `PivotDiagnosisCard` below blast radius |
| Updated `BetDetailPage` | `app/workspace/directions/[id]/page.tsx` | Show `PivotDiagnosisCard` if any intervention has a `pivot_diagnosis` |

### Backend

| File | Change |
|---|---|
| `context/data-schema.ts` | Add `PivotDiagnosis`, `PivotPScore`, `PivotRecommendation` types |
| `backend/models/schema.py` | Mirror as Pydantic |
| `backend/app/main.py` | `POST /interventions/{id}/pivot-diagnosis` endpoint |
| `backend/db/repository.py` | `save_pivot_diagnosis(intervention_id, diagnosis)` — update `interventions.pivot_diagnosis` JSONB column |
| `backend/app/agents/conversational.py` | `run_pivot_diagnosis` tool + `save_pivot_diagnosis` tool |

---

## Conversational Flow

The agent orchestrates the session as a structured 4-step conversation:

```
User: "Should I kill Voice Capture?"
  OR: Agent detects kill_criteria_triggered or strategy_unclear high severity
  
Agent → calls run_pivot_diagnosis(bet_id) tool

Agent: "Let me help you think through this systematically. I'll ask you four questions 
       about Voice Capture — one for each lens — and we'll see what the pattern tells us.
       
       (You can skip any question by typing 'skip')
       
       **Problem Lens:** Are you still confident that founders genuinely lose 
       meeting context in a way that's costly enough to solve?
       
       On a scale of 1–5 (1 = 'I'm no longer sure', 5 = 'Absolutely certain'):
       How confident are you the problem is real?"

User: "3 — I think it's real but maybe not urgent enough"

Agent: [stores p=problem, confidence=3, note="real but maybe not urgent enough"]
       
       "**Persona Lens:** Is a solo founder the right first customer? 
       Or is there a customer type who would feel this more acutely?
       
       Confidence 1–5:"

User: "2 — I'm now thinking teams would feel this more"

Agent: [stores p=persona, confidence=2, note="teams would feel this more"]
       → continues through Product, Positioning...

After all 4:

Agent → calls compute_pivot_recommendation(scores)
       → saves via save_pivot_diagnosis(intervention_id, diagnosis)

Agent: "Here's what the four lenses tell us:
       
       ○ Problem:     3/5 — Moderate confidence
       ○ Persona:     2/5 — Weak — teams may be better fit than solo founders
       ● Product:     4/5 — Strong
       ● Positioning: 4/5 — Strong
       
       **Diagnosis: SMALL_PIVOT** — Your positioning and product are solid, 
       but you may be targeting the wrong customer type. Consider: 
       'What changes if your target customer is a 5-person early-stage team instead of a solo founder?'
       
       This diagnosis has been saved to the Voice Capture intervention card."
```

---

## UI Layout

### PivotDiagnosisCard (on ApprovalCard / BetDetailPage)

```
┌─────────────────────────────────────────────────────────────────┐
│  4Ps Pivot Diagnosis         [SMALL_PIVOT]   April 28, 2026     │
│  ─────────────────────────────────────────────────────────────  │
│  ○●●●● Problem     3/5   "Real but maybe not urgent enough"     │
│  ○●○○○ Persona     2/5   "Teams would feel this more"   ← weak  │
│  ○●●●○ Product     4/5   "Approach is solid"                    │
│  ○●●●○ Positioning 4/5   "Framing resonates"                    │
│  ─────────────────────────────────────────────────────────────  │
│  Persona is the weakest lens. Adjust targeting before           │
│  concluding this bet is dead.                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Design Principles

- **Founder in control** — diagnosis is offered, not forced; agent says "I'll ask you four questions" not "you must complete a diagnosis"
- **Skip is always available** — any question can be skipped; partial diagnoses are saved with `confidence: null` for skipped Ps
- **Problem beats all** — if Problem confidence ≤ 2, recommendation is always `kill` regardless of other scores. This is grounded in first principles (Todd Jackson + Eric Ries)
- **Glassmorphic card** — `PivotDiagnosisCard` uses existing `glass-panel` styling; dots use existing `text-indigo-600` for filled
- **Permanent artifact** — once a diagnosis is saved, it lives on the bet detail page permanently; it is part of the bet's history, not just an ephemeral chat message
