# Product Principles

Constraints derived from research (Linear issues AI-10, AI-12, AI-23, AI-27).
These must shape UX copy, agent behavior, and interaction design — not just be noted.

## Persona constraints

**Who we're building for:** Early-stage founders/PMs (1–20 people) who already think in
bets and hypotheses. Practitioners, not students. Time-constrained, not framework-naive.

**Identity:** High-agency. They resist systems that feel controlling or paternalistic.
Tools must frame them as **pilots with instruments**, not passengers on autopilot.

## Psychological design rules

### 1. Reframe risk as lost upside, never as threat
Bad:  "Your Q2 bet is at risk."
Good: "Keeping these 4 meetings likely costs you 2 hypothesis validations this week."
Bad:  "You have a strategy problem."
Good: "Over 3 weeks, 70% of work didn't map to your stated bet — this pattern typically
       precedes a missed quarter. Here's what top teams do at this signal."

The Product Brain Agent must write all `headline` and `explanation` fields using
this framing. Cite specific evidence. Never use vague threat language.

### 2. Surface one intervention, not a list
Decision fatigue is real. One concrete action per risk signal.
If multiple interventions are valid, Coordinator Agent picks the highest-confidence one.
Founder can always dismiss and ask for alternatives — but the default is one.

### 3. Show confidence scores visibly
Founders are high-agency. Hiding uncertainty is paternalistic.
`declaration_confidence` and `RiskSignal.confidence` are always visible in UI.
This lets founders make informed calls, not be told what to do.

### 4. Attach to existing rhythms, don't invent new ones
Weekly monitoring cadence mirrors weekly planning rituals.
Risk digest drops at the start of the week, not as a constant stream of alerts.
Pre-mortem session suggestions attach to existing sprint/cycle review moments.

### 5. Explanations must cite product principles, not just data
"You have 40% bet coverage" is noise.
"You have 40% bet coverage — Shreyas Doshi's Tigers/Elephants framing says this pattern
 (lots of misc work, few tickets tied to the core bet) is a leading indicator of strategy
 failure, not execution failure. Here's what that means for you." is signal.

Product Brain Agent must reference `product_principle_refs` in every explanation.

## Risk classification principles

### Three types, no ambiguity (from AI-24 research)
- `strategy_unclear`: We don't know what winning looks like. No hypothesis, no metric.
- `alignment_issue`: We know the plan but aren't executing it. Work ≠ stated bet.
- `execution_issue`: We know the plan, executing it, but running into friction.
  Rollovers, blockers, scope creep.

**Why this matters for interventions:**
- Strategy problem → needs clarification ritual, not more process
- Alignment problem → needs communication/reprioritization, not better execution tooling
- Execution problem → needs scoping/unblocking, not strategy rethinking

Don't let founders throw execution solutions at strategy problems. This is the core value.

## Bet declaration principles

### No template filling before getting value
The system starts from what the founder already has.
Agent drafts the bet, founder confirms minimally.
Minimum viable confirmation: name + hypothesis + one metric. That's enough to monitor.

### "Not a bet" is valuable data, not a failure
When a founder rejects a proposed bet, log it as `BetRejection` with `raw_artifact_refs`.
This is labeled training data for the Detect stage.
Never treat rejection as a bad outcome in the UI — acknowledge it positively:
"Got it. We'll use this to get better at recognizing your bets."

### Bets need a hypothesis to be monitored
A bet without a hypothesis cannot have strategy checked.
If `hypothesis` is empty after declaration, the system flags this as
`missing_hypothesis` evidence immediately — it's the first risk signal.

## Intervention guardrails

### Bounded writes only
The system can only do what `LinearAction` defines:
add_label, add_comment, create_issue, update_status, update_assignee.

Never: delete issues, reassign projects, change priorities in bulk, post to Slack.
These are agent-takeover risks. The founder always sees the exact proposed action
before it executes.

### Rationale must cite a product principle
Every `Intervention.rationale` must reference at least one `ProductHeuristic.id`.
This makes the "why" traceable and builds trust over time.

### The Agent Evolution Log builds trust
Founders can see:
- Which heuristic version was active when a risk was flagged
- Whether the heuristic was later improved based on their feedback
- What changed and why

This is the governance story. It's not a technical detail — it's a product feature.

## Copy tone

- Direct, not deferential. ("This looks like a strategy problem, not execution.")
- Evidence-first, principle-second. ("3 rollovers in 4 weeks → Tigers/Elephants says...")
- One clear next step. Never end with "you should consider..."
- Acknowledge uncertainty honestly. ("We're 65% confident — here's what we used.")
