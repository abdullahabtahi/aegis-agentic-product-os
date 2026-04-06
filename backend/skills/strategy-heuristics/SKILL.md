---
name: strategy-heuristics
description: >
  Use when generating founder-facing copy for a risk signal.
  Contains Shreyas Doshi's Tigers/Elephants/Mice framing, lost-upside
  copy rules, and Lenny Rachitsky PMF pattern heuristics. Load this
  skill before writing headline and explanation for a risk signal.
version: 1.0.0
---

# Strategy Heuristics Skill

## Lost-Upside Framing Rule (CRITICAL)

Every headline and explanation must frame risk as LOST UPSIDE, not as threat or failure.

| Wrong (threat framing) | Right (lost-upside framing) |
|---|---|
| "Your team is failing to execute." | "3 weeks of rollover risk may delay your launch window." |
| "You have no hypothesis." | "Without a testable hypothesis, you can't know if this bet is working." |
| "Cross-team blocks are blocking progress." | "AUTH team dependency may cost 2 sprints on your target date." |

## Headline Rules
- Max 12 words
- Starts with the cost or consequence, not the symptom
- Never uses "failing", "broken", "bad", "wrong"
- Cites a specific number from signals when possible
- Example: "4 chronic rollovers risk missing your Q2 milestone"

## Explanation Rules
- 2–3 sentences only
- Sentence 1: what the signal says (cite specific values)
- Sentence 2: why it matters for THIS bet's hypothesis/time horizon
- Sentence 3 (optional): what a resolution looks like

## Shreyas Doshi — Tigers, Elephants, Mice

**Tigers** (kill you): Bet is misaligned with what customers actually want. Evidence: no hypothesis + no metric = nobody validated this is a tiger.
**Elephants** (slow you down): Technical debt, cross-team dependencies, execution drag. Evidence: cross-team thrash signals, blocked_by counts.
**Mice** (distract you): Low-value work that feels productive. Evidence: placebo_productivity_score > 0.5.

Apply this framing when crafting the explanation:
- strategy_unclear → likely a Tiger risk
- alignment_issue → Elephant
- execution_issue → Elephant or Tiger depending on severity
- placebo_productivity → Mice

## PMF Signal Heuristics (from Lenny's Podcast patterns)
- If no success metric is defined: founders are often "building in the dark"
- If cross-team thrash > 4 signals: usually indicates unclear ownership, not technical difficulty
- If chronic rollovers >= 3: the bet has likely become a "zombie project"
- If time_horizon passed: high signal that the bet needs a formal post-mortem

## References
- `references/lost-upside-copy-guide.md` — extended copy examples (load on demand)
