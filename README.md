<h1 align="center">Aegis</h1>
<p align="center"><strong>Continuous pre-mortem for startup bets.</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/Google_ADK-Gemini_3-4285F4?logo=google&logoColor=white" />
  <img src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/CopilotKit-AG--UI-6366f1" />
  <img src="https://img.shields.io/badge/Tests-118_passing-4ade80" />
</p>

---

## The Problem Nobody Talks About

Every early-stage founder has lived this story:

> You ship a bet. Three sprints pass. Velocity looks fine — tickets close, PRs merge, standups feel productive. Then the quarter ends. The metric didn't move. The team was busy, but **busy on the wrong things.**

This happens because execution slippage doesn't announce itself. It hides inside healthy-looking dashboards. Rollovers accumulate quietly. Work drifts from the stated hypothesis. By the time the founder notices, the quarter is gone.

Shreyas Doshi calls these **Tigers and Elephants** — the urgent fires (Tigers) that consume attention while the slow, silent strategic failures (Elephants) go unnoticed until it's too late.

**Aegis runs your pre-mortem before the post-mortem is necessary.**

---

## What Aegis Actually Does

Aegis connects to your Linear workspace, reads your tickets and projects, and runs a 5-stage AI pipeline to answer one question:

> *"Is this bet on track — and if not, what specific action should I take right now?"*

```
 Your Linear               Aegis Pipeline                    You
 Workspace                                                    
 ┌──────────┐    ┌─────────────────────────────────┐    ┌──────────┐
 │ Issues   │───►│ Signal    ► Product  ► Coord.   │───►│ One      │
 │ Projects │    │ Engine      Brain      inator   │    │ concrete │
 │ Cycles   │    │ (metrics)  (debate)   (action)  │    │ action   │
 └──────────┘    │                                 │    │ to take  │
                 │ Governor ► Executor             │    └──────────┘
                 │ (8 safety   (writes to          │
                 │  checks)    Linear)             │
                 └─────────────────────────────────┘
                        You approve every action.
```

**One risk signal. One intervention. One click.** No dashboards to interpret. No alerts to triage. The founder sees what's wrong, why, and exactly what to do — framed as lost upside, never as threat.

---

## The Pipeline

Each stage is a separate agent. Each feeds the next. No parallelism — by design.

| Stage | Agent | Type | What It Does |
|-------|-------|------|-------------|
| 1 | **Signal Engine** | Deterministic | Reads Linear issues from the last 14 days. Computes bet coverage, rollover rates, chronic blockers, cross-team thrash, and a composite health score. No LLM — pure math. |
| 2 | **Product Brain** | LLM (Gemini 3 Pro) | Three-step debate: a Cynic agent finds problems, an Optimist agent challenges them, a Pro model synthesizes into a typed `RiskSignal` with confidence score. Cites product principles, not just data. |
| 3 | **Coordinator** | LLM (Gemini 3 Flash) | Selects exactly one intervention from a 14-action taxonomy. Follows an escalation ladder: L1 Clarify → L2 Adjust → L3 Escalate → L4 Terminal. One action, not a list. |
| 4 | **Governor** | Deterministic | 8 policy checks run in sequence: confidence floor, duplicate suppression, rate cap, Jules gate, reversibility check, acknowledged risk, control level, escalation ladder. No LLM. No exceptions. |
| 5 | **Executor** | Deterministic | Runs the approved intervention — a Linear comment, a new issue, a label change, or a Jules task. Never improvises. Only writes what was approved. |

**Why this sequence matters:** Strategy problems need clarification, not process. Alignment problems need reprioritization, not better tools. Execution problems need unblocking, not strategy rethinking. The pipeline classifies first, then prescribes — so the intervention actually matches the disease.

---

## Design Philosophy: Pilots, Not Passengers

Aegis is built for founders who think in bets and hypotheses. They're high-agency. They resist tools that feel controlling.

The design principle: **founders are pilots with instruments, not passengers on autopilot.**

This shapes everything:

- **Confidence scores are always visible.** Hiding uncertainty is paternalistic. The founder sees `0.73 confidence` and decides whether to act.
- **One intervention, not a menu.** Decision fatigue is real. Aegis picks the highest-confidence action. The founder can dismiss and ask for alternatives — but the default is one.
- **Risk is framed as lost upside, never threat.** Not "your bet is at risk" but "keeping these 4 meetings likely costs you 2 hypothesis validations this week."
- **Every write requires approval.** No L2+ action touches Linear without the founder clicking approve. Trust is earned, not assumed.
- **The Governor has no LLM.** 8 deterministic policy checks. No hallucinated safety decisions. The rules are auditable, immutable, and predictable.

This positions Aegis in the upper-right quadrant of Shneiderman's Human-Centered AI framework: **high automation + high human control.**

```
                    High Human Control
                          ▲
                          │
         Spreadsheets     │     AEGIS
         Manual pre-      │     AI detects risk,
         mortems          │     founder decides action
                          │
  ───────────────────────►┼──────────────────────► High Automation
                          │
         No tooling       │     Auto-pilot agents
         (hope for        │     (auto-close tickets,
          the best)       │      auto-reassign work)
                          │
                          ▼
```

*Reference: Ben Shneiderman, Human-Centered AI, Oxford University Press, 2022*

---

## Evidence It Works

### 118 Unit Tests, 5 Golden Traces

Every deterministic function is tested. Every agent path has an eval trace.

```
$ cd backend && make test
118 passed in 1.20s

$ cd backend && make eval-all
trace_01_strategy_unclear     ✅
trace_02_alignment_issue      ✅
trace_03_execution_issue      ✅
trace_04_low_confidence       ✅
trace_05_acknowledged_risk    ✅
```

| Eval Trace | Tests | What It Validates |
|------------|-------|-------------------|
| `trace_01` | Strategy unclear detection | Missing hypothesis → `strategy_unclear` risk → `clarify_bet` intervention |
| `trace_02` | Alignment issue detection | Work ≠ stated bet → `alignment_issue` risk → `align_team` intervention |
| `trace_03` | Execution friction | Chronic rollovers → `execution_issue` risk → `rescope` intervention |
| `trace_04` | Low confidence handling | Brain confidence < 0.6 → Governor blocks → no intervention |
| `trace_05` | Acknowledged risk bypass | Founder already knows → Governor allows → Executor skips |

### Two-Tier CI

| Tier | Trigger | Time | Cost |
|------|---------|------|------|
| **Tier 1** — Lint, type check, 118 unit tests | Every push | ~2 min | $0 |
| **Tier 2** — Integration tests, 5 ADK evals | Merge to main | ~10 min | Gemini API calls |

---

## Quick Start

### 1. Backend (Python + ADK)

```bash
cd backend
cp .env.example .env            # Set GOOGLE_CLOUD_PROJECT + GOOGLE_CLOUD_LOCATION=global
make install                    # Install deps via uv
make playground                 # ADK web playground → http://localhost:8501
```

### 2. Frontend (Next.js 16)

```bash
cd frontend
npm install
cp .env.example .env.local      # Set NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
npm run dev                     # → http://localhost:3000
```

### 3. Docker (both)

```bash
docker-compose up               # Backend :8080 + Frontend :3000
```

### Environment Variables

| Variable | Required | What It Does |
|----------|----------|-------------|
| `GOOGLE_CLOUD_PROJECT` | Yes | GCP project for Vertex AI / Gemini |
| `GOOGLE_CLOUD_LOCATION` | Yes | Must be `global` (not us-central1) |
| `LINEAR_API_KEY` | No | Live workspace reads. Omit = mock data |
| `AEGIS_MOCK_LINEAR` | No | Force mock even with API key set |

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Agent framework** | Google ADK | Native sequential pipelines, built-in eval, Vertex AI integration |
| **LLM** | Gemini 3 Flash + Pro | Flash for speed (debate agents), Pro for synthesis (Product Brain final) |
| **Backend** | Python 3.10, FastAPI | ADK ecosystem, async SSE streaming, Pydantic validation |
| **Frontend** | Next.js 16, React 19, TypeScript | App Router, Server Components, streaming |
| **Agent-UI bridge** | CopilotKit + AG-UI protocol | Real-time SSE streaming from ADK → React, HITL approval surfaces |
| **UI framework** | Tailwind v4, shadcn/ui | Glassmorphic design, Linear-inspired dark theme |
| **State** | Zustand + immer | Immutable state updates, devtools |
| **Testing** | pytest + ADK evals | Unit tests (deterministic), golden traces (agent behavior) |
| **CI/CD** | GitHub Actions (two-tier) | Tier 1: no-GCP fast checks. Tier 2: Gemini evals on main |
| **Package mgmt** | `uv` (backend), `npm` (frontend) | Fast, deterministic installs |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Frontend (Next.js 16)                                                  │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  GlassmorphicLayout                                              │   │
│  │  ┌──────────┐ ┌────────────────────────────────┐ ┌────────────┐ │   │
│  │  │ Sidebar  │ │ Mission Control / Inbox / Home  │ │ Chat Panel │ │   │
│  │  │ (nav)    │ │ (pipeline view, HITL approvals) │ │ (AG-UI)   │ │   │
│  │  └──────────┘ └────────────────────────────────┘ └────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                              │ CopilotKit / AG-UI SSE                   │
└──────────────────────────────┼──────────────────────────────────────────┘
                               │
┌──────────────────────────────┼──────────────────────────────────────────┐
│  Backend (Python + ADK)      │                                          │
│  ┌───────────────────────────┴─────────────────────────────────────┐   │
│  │  FastAPI — /adk/v1/app (SSE) + REST endpoints                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  ConversationalAgent (unified entry point)                       │   │
│  │  └── SequentialAgent("aegis_pipeline")                          │   │
│  │      ├── Signal Engine ──── deterministic, reads Linear          │   │
│  │      ├── Product Brain ──── Cynic + Optimist + Pro synthesis     │   │
│  │      ├── Coordinator ────── selects intervention from taxonomy   │   │
│  │      ├── Governor ────────── 8 policy checks, no LLM            │   │
│  │      └── Executor ────────── writes to Linear (if approved)      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────────┐   │
│  │ MockLinearMCP│ │ RealLinearMCP│ │ AlloyDB (Phase 2+)           │   │
│  └──────────────┘ └──────────────┘ └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

Full architecture spec: [`context/agent-architecture.md`](context/agent-architecture.md)
Full data schema: [`context/data-schema.ts`](context/data-schema.ts)

---

## How a Scan Works (End-to-End)

```
1. Founder opens Aegis → types "scan my Q2 bets"
                │
2. ConversationalAgent triggers `run_pipeline_scan` tool
                │
3. Signal Engine reads Linear issues (last 14 days)
   → computes: bet_coverage=0.42, chronic_rollovers=4, hypothesis=missing
   → output: LinearSignals (typed struct, no LLM involved)
                │
4. Product Brain receives LinearSignals
   → Cynic (Flash): "Coverage is 42%. 4 chronic rollovers. No hypothesis."
   → Optimist (Flash): "Team velocity is stable. Coverage may be data lag."
   → Synthesis (Pro): RiskSignal(type=strategy_unclear, confidence=0.81)
   → headline: "70% of last 3 weeks' work didn't map to your Q2 bet —
                this pattern typically precedes a missed quarter."
                │
5. Coordinator selects: clarify_bet (L1 intervention)
   → proposes: "Add a hypothesis and success metric to the Q2 bet"
                │
6. Governor runs 8 checks:
   ✅ confidence=0.81 > 0.6 floor
   ✅ not a duplicate
   ✅ rate cap not exceeded
   ✅ L1 doesn't need Jules
   ✅ reversible action
   ✅ not acknowledged
   ✅ control_level allows L1
   ✅ escalation ladder respected
   → APPROVED
                │
7. Pipeline halts → awaiting_founder_approval
                │
8. Founder sees intervention card in UI:
   "Add hypothesis: 'We believe [segment] will [behavior] because [mechanism],
    measurable by [metric] within [horizon]'"
   → [Approve] [Dismiss] [Override & Teach]
                │
9. Founder clicks Approve → Executor creates Linear comment
   → Done. Signal Engine will check again next cycle.
```

---

## Honest Limitations

- **Cold-start problem.** A new workspace with no Linear history gets no useful signals. Aegis needs 2+ weeks of ticket data to detect patterns.
- **Linear only.** No Jira, Asana, Notion, or GitHub Projects integration yet. Linear's API quality made it the right v1 target.
- **LLM confidence is not probability.** A `0.81 confidence` from Product Brain is a model's self-assessment, not a calibrated statistical measure. Treat it as a ranking signal.
- **Mock data in demo.** Mission Control dashboard currently shows mock pipeline data. Real-time AG-UI stage emissions are wired for stages 1-2; stages 3-5 are next.
- **In-memory state.** No persistent storage yet — data is lost on restart. AlloyDB integration is Phase 7.
- **Advisory, not prescriptive.** Aegis surfaces findings; the founder decides. It will never auto-close a ticket or auto-reassign work.

---

## Project Status

| Phase | What | Status |
|-------|------|--------|
| 1 | Signal Engine + 5 golden eval traces | Done |
| 2 | Product Brain debate (Cynic + Optimist + Pro synthesis) | Done |
| 3 | Coordinator + Governor (8 deterministic policy checks) | Done |
| 4 | Executor + Override & Teach + approval handler | Done |
| 5 | Glassmorphic UI (Mission Control, Inbox, Chat, HITL surfaces) | Done |
| 5b | Frontend ↔ Backend wiring (chat works, dashboard data pending) | In progress |
| 6 | Bet Declaration flow + Jules Subject Hygiene | Next |
| 7 | AlloyDB persistence + deployment hardening | Planned |

---

## Running Tests

```bash
# Backend — 118 unit tests, no GCP required
cd backend && make test

# Backend — integration tests (needs GCP credentials)
cd backend && make test-integration

# Backend — all 5 agent eval traces
cd backend && make eval-all

# Backend — lint + type check
cd backend && make lint

# Frontend — type check + lint
cd frontend && npx tsc --noEmit && npm run lint
```

---

## Repository Structure

```
aegis-agentic-product-os/
├── backend/
│   ├── app/
│   │   ├── agent.py                 # Root pipeline entry point
│   │   ├── main.py                  # FastAPI + AG-UI SSE endpoint
│   │   ├── agents/                  # 5 pipeline agents
│   │   │   ├── signal_engine.py     # Deterministic metrics
│   │   │   ├── product_brain.py     # LLM debate (Cynic/Optimist/Pro)
│   │   │   ├── coordinator.py       # Intervention selection
│   │   │   ├── governor.py          # 8 policy checks
│   │   │   ├── executor.py          # Linear writes
│   │   │   └── conversational.py    # Unified chat + pipeline trigger
│   │   ├── tools/                   # MockLinearMCP + RealLinearMCP
│   │   └── models/                  # Pydantic schemas
│   ├── tests/
│   │   ├── unit/                    # 118 deterministic tests
│   │   ├── integration/             # Live Gemini tests
│   │   └── eval/evalsets/           # 5 golden traces
│   └── Makefile
├── frontend/
│   ├── app/workspace/               # Pages: home, inbox, mission-control
│   ├── components/layout/           # GlassmorphicLayout, Sidebar, HeaderBar
│   ├── components/interventions/    # HITL approval surfaces
│   ├── hooks/                       # useChatController, useAgentStateSync
│   └── lib/                         # Types, API client, constants
├── context/                         # Source-of-truth docs
│   ├── data-schema.ts               # All entities and fields
│   ├── agent-architecture.md        # Pipeline spec (576 lines)
│   ├── DESIGN_SPEC.md               # Product spec
│   └── product-principles.md        # UX and framing rules
├── .github/workflows/
│   ├── tier-1-ci.yml                # Fast checks (every push)
│   └── tier-2-eval.yml              # Evals + integration (main only)
└── docker-compose.yml
```

---

## Built With

Built for the **Gen AI Academy Hackathon** by [@abdullahabtahi](https://github.com/abdullahabtahi).

Multi-agent development: Claude Code (Opus) + Google Jules + GitHub Copilot, orchestrated through a review-and-merge workflow with human oversight on every PR.

---

<p align="center"><em>"The goal of a pre-mortem is not to predict failure. It's to make the invisible visible before it's too late."</em></p>
