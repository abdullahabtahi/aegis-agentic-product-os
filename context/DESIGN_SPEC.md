# Design Spec: Continuous Pre-mortem / Risk Radar

## Problem
Early-stage founders misdiagnose execution slippage (delays, thrash, scope creep) as a
delivery problem when it's actually a strategy or alignment failure. Signals are scattered
across Linear, docs, and Slack. Nobody has time to continuously run pre-mortems.
Tigers and Elephants (Shreyas Doshi framing) are spotted late — after a quarter is blown.

## Target persona
Early-stage founders and PMs (1–20 person teams) who:
- Already think in bets and hypotheses (practitioners, not students)
- Are time-constrained, not framework-naive
- Have Linear as their primary execution tool
- Identify as high-agency; resist paternalistic tools

## The one job we own (v1)
> A founder sees their active bets, gets a typed risk signal (strategy/alignment/execution)
> with specific evidence, and can accept a corrective action into Linear in one click.

## Core concept: Bets as first-class objects
Tickets and labels are outputs the system maintains.
Bets, hypotheses, and risk signals are inputs agents reason over.

## Agent system (three agents)
See `agent-architecture.md` for full design.

1. **Execution Agent** — reads Linear via MCP, produces `LinearSignals` per bet
2. **Product Brain Agent** — holds Lenny heuristics + strategy docs, classifies risk type
3. **Coordinator Agent** — synthesizes signals, generates `RiskSignal` + `Intervention`,
   executes bounded `LinearAction` on founder approval

## Bet declaration flow (progressive, not template-filling)
```
Detect  → agent clusters Linear projects/issues into candidate bets
Draft   → Product Brain drafts Bet schema (name, segment, problem, hypothesis, metric, horizon)
Confirm → founder sees card with declaration_confidence score; Confirm / Edit / Not a bet
Monitor → Execution Agent runs weekly, produces BetSnapshots for trend detection
```

## Risk classification (three types only — no ambiguity)
| Type | Signal pattern | Example |
|------|---------------|---------|
| `strategy_unclear` | Missing hypothesis, no metric, vague problem statement | "We're building but don't know what winning looks like" |
| `alignment_issue` | Work doesn't map to stated bet, cross-team thrash | "70% of tickets last 3 weeks don't map to Q2 bet" |
| `execution_issue` | Chronic rollovers, scope creep, blocked count rising | "Same 4 issues rolled over 3 cycles in a row" |

## Intervention types (bounded)
`clarify_bet` | `add_hypothesis` | `add_metric` | `rescope` | `kill_bet`
`redesign_experiment` | `pre_mortem_session` | `align_team`

Each intervention proposes exactly one `LinearAction` (add_label, add_comment,
create_issue, update_status, update_assignee). No action executes without founder approval.

## AutoResearch layer (self-improvement engine — not the front-end feature)
- `HeuristicVersion` stores versioned risk detection rules + thresholds
- AutoResearch loop: mutate heuristic → run on golden traces → eval → keep/revert
- Acceptance rate + resolution rate drive which heuristic versions survive
- `BetRejection` ("Not a bet") is labeled training data for Detect stage tuning
- Exposed as Agent Evolution Log in UI (trust + governance story)

## Success metrics (product evals)
| Metric | Target |
|--------|--------|
| Risk precision (founder agrees risk is real) | >70% |
| Intervention acceptance rate | >50% |
| Risk resolution rate (signal gone after action) | >40% |
| False positive rate (rejected / total flagged) | <30% |

## What's deferred (not v1)
- Slack / metrics integration
- Jules MCP handoff for implementation tasks
- Opportunity-Cost Auditor (calendar / LNO angle)
- Full AutoResearch mutation loop (stub for demo; log accepted/rejected for data)
- AlloyDB vector search (use basic AlloyDB for hackathon, add AI extension post-demo)

## Tech stack summary
See `tech-stack.md` for full stack. See `frontend-integration.md` for component patterns.

Backend: Python, ADK, Gemini 3 Flash/Pro, FastAPI, Cloud Run
Storage: AlloyDB + pgvector, Vertex Memory Bank, Vertex semantic caching
Frontend: React + TypeScript, CopilotKit (`useCoAgent`, `useCopilotAction`, `useInterrupt`),
          AG-UI (`StateSnapshotEvent`, `StateDeltaEvent`, `ToolCallStart/End`, `TextMessageChunk`),
          React Flow (custom `BetNode`, `RiskEdge`, `AgentActivityNode`), shadcn/ui
MCP tools: Linear MCP, Lenny MCP, Jules API (v1alpha)
