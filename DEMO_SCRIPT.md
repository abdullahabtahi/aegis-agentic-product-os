# Aegis — Demo Video Script
**Google Cloud Gen AI Academy Hackathon · April 2026**
**Target length: 4–5 minutes**

---

## Pre-Recording Setup

- Browser: Chrome, dark mode, 1440×900 window
- Terminal: hidden (no visible build artifacts)
- Linear mock mode: `AEGIS_MOCK_LINEAR=true` in backend `.env`
- Pre-load: workspace already has 2 bets — one healthy, one drifting
- Boardroom: `GEMINI_API_KEY` set, test connection verified
- Screen recorder: OBS or QuickTime, system audio on

---

## SEGMENT 1 — Hook (0:00–0:35)

**[Talking head or voiceover — no screen yet]**

> "Three sprints in. Tickets are closing. PRs are merging. Standups feel fine.
> Then the quarter ends — and the metric didn't move.
>
> The team was busy. Just busy on the wrong things.
>
> This is the problem Aegis solves. Not with a dashboard. Not with another alert.
> With one AI pipeline that watches your execution signals, classifies the drift,
> and surfaces a single action — for the founder to approve."

**[Cut to: browser opening to `localhost:3000/workspace`]**

---

## SEGMENT 2 — Mission Control Overview (0:35–1:10)

**[Screen: Mission Control — the main workspace view]**

> "This is Mission Control. Two active bets on the sidebar.
> The top one — 'Retention Loop via Weekly Digest' — has been running for 6 weeks.
> Let's scan it."

**[Click: the bet row → Directions page for the bet]**

> "The Directions page shows the hypothesis, the target metric, and any previous interventions.
> Right now: no active risk signal. Clean slate."

**[Point to: 'Scan for Risks' button and 'Enter Boardroom' button]**

> "Two entry points. The pipeline scan gives us an automated risk read.
> The Boardroom is the deep-dive — more on that in a moment."

**[Click: 'Scan for Risks']**

---

## SEGMENT 3 — Live Pipeline Scan (1:10–2:10)

**[Screen: pipeline status banner updating in real time]**

> "Watch the status banner. Each stage is a separate AI agent.
> Signal Engine first — no LLM, pure math. Reading 14 days of Linear issues via the MCP tool."

**[Banner: 'Scanning execution signals...']**

> "It computes rollover rate, bet coverage, blocker depth, cross-team thrash.
> Numbers only. No model opinion yet."

**[Banner: 'Analyzing risk signals...']**

> "Product Brain now. Three sub-agents running an internal debate:
> a Cynic that finds the hardest failure mode, an Optimist that challenges the evidence,
> and a Pro model that synthesises both into a typed risk signal with a confidence score."

**[Banner: 'Generating intervention...']**

> "Coordinator selects exactly one action from 14 possible intervention types
> across four escalation levels. Not a list — one action."

**[Banner: 'Awaiting your approval']**

**[Risk Signal card appears — annotate key parts:]**

> "Here's the output. Risk category: Alignment Drift.
> Confidence: 0.81. That's the Product Brain's synthesis score.
>
> Evidence: rollover rate is 42% — nearly half the bet's tickets have rolled over twice.
> Bet coverage dropped to 31% — less than a third of active work is actually on this hypothesis.
>
> And the proposed intervention: a reprioritization ritual with the team lead.
> Framed as: keeping the current queue likely costs two hypothesis validations this week."

---

## SEGMENT 4 — Governor & Approval (2:10–2:35)

**[Screen: Intervention card with Approve / Deny buttons]**

> "Before this proposal reached the UI, the Governor ran 8 deterministic checks.
> No LLM. Hard rules.
>
> Confidence floor — passed. Duplicate suppression — no similar action in 48 hours — passed.
> Rate cap — under 3 interventions this week — passed. Reversibility — a ritual is reversible — passed.
> Control level matches the founder's Supervised setting — passed. All 8 green."

**[Click: Approve]**

> "One click. Executor writes directly to Linear via MCP —
> a comment on the top blocked issue, flagging the reprioritization needed.
> The founder didn't write a prompt. They approved a recommendation their pipeline earned."

---

## SEGMENT 5 — Boardroom Voice Session (2:35–4:00)

**[Screen: back to Directions page — click 'Enter Boardroom']**

> "Now the Boardroom. The founder has a bigger question —
> should they pivot this bet entirely, or push for one more sprint?"

**[Screen: BoardroomSetupForm]**

> "Setup takes 30 seconds. Decision question and the key assumption being tested.
> The pipeline data — the risk signal we just generated — is already loaded."

**[Type: decision question + assumption — click 'Enter Boardroom']**

**[Screen: BoardroomIntroScreen — 3 advisor cards animate in]**

> "Three AI advisors. Jordan is the Bear — the skeptic who opens with the risk signals.
> Maya is the Bull — she argues the strongest case for the bet.
> Ren is the Sage — the operator who always closes with concrete experiments.
>
> They already know the context. They read the Aegis pipeline data before the session starts."

**[Click: 'Begin Boardroom']**

**[Screen: live Boardroom — advisors debate, captions appear, active speaker highlights]**

> "This is Gemini Live — a single WebSocket carrying real-time bidirectional voice.
> Watch the active speaker — the UI parses speaker tags from the model output in real time
> and highlights the right advisor tile.
>
> The founder can interrupt at any point. Ask a follow-up. Challenge an assumption.
> This isn't a podcast — it's a working session."

**[Wait for ~30s of debate audio to play — then narrate:]**

> "Jordan is citing the rollover rate the Signal Engine flagged. Maya is arguing the retention curve
> is still early. Ren is about to propose an experiment."

**[Click: 'End Session']**

**[Screen: DeliberatingOverlay — then VerdictPanel appears]**

> "After the session, a separate ADK verdict agent reads the full transcript
> and synthesises a structured verdict.
>
> Confidence score: 67. Recommendation: Pause.
> Per-advisor assessments. Key risks. Three concrete next experiments.
>
> And this verdict is anchored in the Aegis audit trail as an Intervention —
> every Boardroom session becomes a governance record the team can reference."

---

## SEGMENT 6 — Architecture Close (4:00–4:30)

**[Screen: split between code editor showing `governor.py` and the pipeline diagram]**

> "Let me close with the architecture choice that matters most.
>
> The two most consequential decisions in this pipeline — signal computation and action approval —
> are made by deterministic BaseAgent subclasses with no LLM.
> The model's confidence is necessary to proceed, but it is never sufficient.
>
> Every action is typed. Every handoff is a Pydantic schema.
> Every write to Linear requires a founder click.
>
> This is what it means to build AI tooling that a founder can actually trust
> to touch their team's work."

**[End card: Aegis logo + one-line pitch]**

> "Aegis. A continuous pre-mortem for the bets that matter."

---

## Timing Guide

| Segment | Content | Target |
|---------|---------|--------|
| 1 | Hook + problem framing | 0:35 |
| 2 | Mission Control overview | 0:35 |
| 3 | Live pipeline scan + risk card | 1:00 |
| 4 | Governor checks + approval | 0:25 |
| 5 | Boardroom voice session + verdict | 1:25 |
| 6 | Architecture close | 0:30 |
| **Total** | | **~4:30** |

---

## Key Talking Points to Hit (Judging Criteria Map)

| Criterion | Where it appears |
|-----------|-----------------|
| Architecture & technical execution | Segment 3 (each agent labeled), Segment 6 (BaseAgent vs LlmAgent) |
| Technical choices & feasibility | Segment 4 (Governor = no LLM), Segment 5 (Gemini Live WebSocket) |
| Solution quality & functionality | Segments 3–5 (full end-to-end working demo) |
| Impact & use case relevance | Segment 1 (hook), Segment 4 (framing the approval) |
| Demo, UX & presentation | Segments 2–5 (live UI, captions, active speaker, verdict panel) |

---

## Recording Notes

- **Don't rush the pipeline stages.** The real-time banner update is one of the most impressive visual moments — let it breathe.
- **Narrate the Governor checks** even though they happen invisibly — judges need to hear "8 deterministic rules, no LLM" explicitly.
- **The Boardroom audio quality matters.** Record in a quiet room. Use a directional mic if available.
- **Show the verdict panel tabs.** Click through Verdict → Key Risks → Next Experiments during the narration.
- **End on the architecture slide**, not on UX. The judging criteria weights architecture and technical execution equally with solution quality — close on technical depth.
