# Mission — Aegis Agentic Product OS

**Ratified:** April 2026  
**Status:** Active

---

## What Aegis Is

Aegis is an agentic pre-mortem system for startup bets. Founders declare strategic bets (features, pivots, hires). Aegis monitors execution signals in real time, detects drift before it compounds, and surfaces structured interventions — approved or rejected by the founder before any action is taken.

## Why It Exists

Startups fail not because they had bad ideas, but because nobody told them the execution was drifting. Aegis is the system that watches while the founder builds. It closes the gap between intent and reality — while there is still time to act.

## Who It Is For

**Primary:** Founders and product leads running ≤5 active bets, connected to a Linear workspace.  
**Secondary:** Hackathon judges evaluating AI-native product tooling (Google Cloud Gen AI Academy, April 2026 cohort).

## Core Constraints (non-negotiable)

| Constraint | Rule |
|---|---|
| Human in the loop | No action is executed without founder approval. Governor always gates. |
| No hallucinated data | Risk signals must come from real Linear signals, not fabricated by the LLM. |
| `no_intervention` is internal | Never render `no_intervention` records in any founder-facing UI. |
| Sequential pipeline only | Signal Engine → Product Brain → Coordinator → Governor → Executor. Never skip stages. |
| Spec first | No code is written without a spec. Bugs become spec FRs before they become PRs. |

## Current Phase

**Refinement stage (April 2026).** Selected top 100 in Google Cloud Gen AI Academy hackathon. Focus is exclusively on fixing identified audit issues before adding any new features. All 5 fix specs must be closed before new feature specs are opened.

## Success Criteria

- SC-001: All audit CRITICAL and HIGH findings resolved
- SC-002: Full demo flow works end-to-end without manual intervention (chat → pipeline → risk card → approval → Linear write)
- SC-003: Deployable to Cloud Run with a public URL for judges
- SC-004: Zero unauthenticated write operations reachable from the public internet
