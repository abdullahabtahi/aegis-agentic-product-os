<h1 align="center">Aegis</h1>
<p align="center"><strong>Continuous pre-mortem for startup bets.</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/Google_ADK-Gemini_3-4285F4?logo=google&logoColor=white" />
  <img src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/CopilotKit-AG--UI-6366f1" />
  <img src="https://img.shields.io/badge/Gemini_Live-Boardroom-8B5CF6?logo=google&logoColor=white" />
  <img src="https://img.shields.io/badge/Tests-127_passing-4ade80" />
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

## Capstone Feature: Aegis Boardroom

The Boardroom is a live, voice-first AI panel that stress-tests a product decision using **actual Aegis pipeline data** — not generic opinions.

The founder opens the Boardroom from any active bet, states their decision question and key assumption, then speaks. Three AI advisors debate them in real time, citing the risk signals Aegis already computed for this bet.

| Advisor | Persona | Role |
|---------|---------|------|
| **Jordan** (Bear) | The Skeptic | Opens with the pipeline's risk signals. Challenges every assumption. |
| **Maya** (Bull) | The Champion | Argues the strongest case for the bet. |
| **Ren** (Sage) | The Operator | Bridges Bear and Bull. Always closes with 2-3 concrete experiments. |

After the session: a structured verdict (confidence score, proceed/pause/pivot recommendation, per-advisor assessments, key risks, next experiments) is synthesised by an ADK verdict agent and anchored in the Aegis audit trail as an Intervention.

### Technical Implementation

- **Transport:** Single Gemini Live WebSocket (`gemini-3.1-flash-live-preview` via AI Studio)
- **Voice capture:** `AudioWorklet` at 16kHz off the main thread — no render-cycle stalls
- **Playback:** `AudioContext` at 24kHz with queue draining
- **Speaker attribution:** `[BEAR]/[BULL]/[SAGE]` tags parsed in real time by `useTurnCapture` for per-advisor UI highlighting
- **Session resilience:** `GoAway` frame handling for network interruption recovery
- **Autoplay compliance:** `AudioContext` created synchronously in the user gesture handler and passed as a prop — satisfies Chrome and Safari autoplay policies
- **Verdict synthesis:** Separate ADK verdict agent reads the full session transcript → produces `BoardroomVerdict` stored as an Intervention in PostgreSQL

### Boardroom UI (10 components)

| Component | Purpose |
|-----------|---------|
| `AdvisorTile` | Active-speaker: scale(1.03), SoundWaveBars animation. Idle: PulsingDot. `useReducedMotion()` compliant. |
| `BoardroomSetupForm` | 2-step form: decision question (200 chars) + key assumption (150 chars). Char count + touched-state validation. |
| `BoardroomSessionTimer` | Elapsed display. Amber warning at 13 min, hard stop at 15 min. |
| `BoardroomConnectionBanner` | Status → label/icon/color for all connection states. |
| `BoardroomUserPiP` | Picture-in-picture with `MotionValue`-driven waveform (zero re-renders per frame). |
| `BoardroomControls` | Mute / end session. 44×44px touch targets. |
| `BoardroomIntroScreen` | Staggered advisor card entrance (spring animation). Context preview accordion. |
| `DeliberatingOverlay` | Full-screen blur + animated dots while verdict agent synthesises. |
| `VerdictPanel` | 3 tabs: Verdict / Key Risks / Next Experiments. SVG circular confidence gauge. |
| `BoardroomRoom` | Orchestrator: session lifecycle, `AudioWorklet` init, forward-only phase machine. |

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

### 127 Unit Tests, 5 Golden Traces

Every deterministic function is tested. Every agent path has an eval trace.

```
$ cd backend && make test
127 passed in 1.87s

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
| **Tier 1** — Lint, type check, 127 unit tests | Every push | ~2 min | $0 |
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

### 4. Deploy to Cloud Run

```bash
export PROJECT_ID=your-gcp-project
export DB_PASS=choose-a-strong-password
export LINEAR_API_KEY=lin_api_xxx   # optional — omit for mock mode
bash deploy/deploy.sh
```

The script: provisions Cloud SQL PostgreSQL (g1-small, ~$26/month), builds both images (frontend after backend so `NEXT_PUBLIC_BACKEND_URL` is baked correctly), runs Alembic migrations via Cloud Run Job, and deploys with `--timeout=3600` for long SSE streams.

### Environment Variables

| Variable | Required | What It Does |
|----------|----------|-------------|
| `GOOGLE_CLOUD_PROJECT` | Yes | GCP project for Vertex AI / Gemini (pipeline agents) |
| `GOOGLE_CLOUD_LOCATION` | Yes | Must be `global` (not us-central1) |
| `GEMINI_API_KEY` | Yes (Boardroom) | Google AI Studio key — used **exclusively** for Boardroom Live WebSocket. Not for the pipeline. |
| `LINEAR_API_KEY` | No | Live workspace reads. Omit = mock data |
| `AEGIS_MOCK_LINEAR` | No | Force mock even with API key set |
| `DATABASE_URL` | Cloud Run | Set automatically by deploy.sh via Cloud SQL unix socket |
| `BOARDROOM_MODEL` | No | Overrides Boardroom model. Default: `gemini-3.1-flash-live-preview`. Do not change for the pipeline. |

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Agent framework** | Google ADK ≥1.15 | Native sequential pipelines, built-in eval, Vertex AI integration |
| **LLM (pipeline)** | Gemini 3-flash-preview + gemini-3.1-pro-preview | Flash for debate agents (temperature=0.0), Pro for synthesis (temperature=0.2) |
| **LLM (Boardroom)** | Gemini Live `gemini-3.1-flash-live-preview` via AI Studio | Only Live API with multi-turn real-time voice + speaker tag support |
| **Backend** | Python 3.12, FastAPI, Uvicorn | ADK ecosystem, async SSE streaming, Pydantic v2 validation |
| **Frontend** | Next.js 16, React 19, TypeScript 5 | App Router, Server Components, streaming |
| **Agent-UI bridge** | CopilotKit + AG-UI protocol | Real-time SSE streaming from ADK → React, HITL approval surfaces |
| **UI framework** | Tailwind v4, shadcn/ui | Linear-inspired dark theme, 8px grid |
| **State** | Zustand + immer (frontend), SQLAlchemy 2 async (backend) | Immutable updates; async DB sessions |
| **Database** | Cloud SQL PostgreSQL 16 g1-small (~$26/month) | pgvector enabled, upgrade path to AlloyDB at Phase 4+ vector scale |
| **Artifacts** | GcsArtifactService (production) / InMemoryArtifactService (local) | GCS survives Cloud Run scale-out; in-memory fine for dev |
| **Sessions** | DatabaseSessionService — SQLite (local), Cloud SQL (production) | Persistent sessions across restarts |
| **Linear client** | httpx.AsyncClient with http2=True, connection reuse | One TLS handshake per pipeline cycle (two API calls reuse connection) |
| **Testing** | pytest + ADK evals | 127 unit tests (deterministic); 5 golden traces (agent behavior) |
| **CI/CD** | GitHub Actions (two-tier) | Tier 1: no-GCP fast checks. Tier 2: Gemini evals on main |
| **Package mgmt** | `uv` (backend), `npm` (frontend) | Fast, deterministic installs |
| **Deploy** | Cloud Run (backend + frontend), Cloud SQL | Automated via `deploy/deploy.sh` |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Frontend (Next.js 16)                                                  │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  GlassmorphicLayout                                              │   │
│  │  ┌──────────┐ ┌──────────────────────────────┐ ┌────────────┐  │   │
│  │  │ Sidebar  │ │ Mission Control / Inbox /     │ │ Chat Panel │  │   │
│  │  │ (nav)    │ │ Directions / Boardroom        │ │ (AG-UI)    │  │   │
│  │  └──────────┘ └──────────────────────────────┘ └────────────┘  │   │
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
│  │      ├── Signal Engine ──── deterministic, reads Linear (MCP)   │   │
│  │      ├── Product Brain ──── Cynic + Optimist + Pro synthesis     │   │
│  │      ├── Coordinator ────── selects intervention from taxonomy   │   │
│  │      ├── Governor ────────── 8 policy checks, no LLM            │   │
│  │      └── Executor ────────── writes to Linear (if approved)      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Boardroom (separate from pipeline)                              │   │
│  │  ├── Gemini Live WebSocket ─ real-time voice (AI Studio)         │   │
│  │  ├── AudioWorklet ────────── 16kHz capture, off main thread      │   │
│  │  └── VerdictAgent (ADK) ──── transcript → structured verdict     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────────┐   │
│  │ MockLinearMCP│ │ RealLinearMCP│ │ Cloud SQL PostgreSQL 16      │   │
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

- **Cold-start problem.** A new workspace with no Linear history gets no useful signals. Aegis needs 2+ weeks of ticket data to detect patterns. The Governor's duplicate suppression and rate cap are also less meaningful on the first 1–2 cycles.
- **Linear only.** No Jira, Asana, Notion, or GitHub Projects integration. Linear's API quality (typed GraphQL, cycle data, relations graph) made it the right v1 target.
- **LLM confidence is not probability.** A `0.81 confidence` from Product Brain is the model's self-assessment, not a calibrated statistical measure. Treat it as a ranking signal, not a p-value.
- **Session history re-hydration is incomplete.** After a page revisit, the chat history component does not yet re-hydrate from stored sessions. Pipeline state is persisted correctly in PostgreSQL; the UI rendering of prior conversation is a known gap.
- **No real-time Linear webhooks.** Scans are triggered manually or on a cron schedule — not on every issue update. Signal latency is up to 7 days between scans.
- **Eval scores measure tool trajectory only.** `tool_trajectory_avg_score ≥ 0.8` measures whether the right tools were called in the right order. It does not measure the quality of the risk classification headline or intervention rationale — those require human review.
- **Boardroom requires AI Studio key, not Vertex AI.** Gemini Live API is not yet available on Vertex AI endpoints. The `GEMINI_API_KEY` must be from [aistudio.google.com/apikey](https://aistudio.google.com/apikey) — the pipeline's `GOOGLE_CLOUD_PROJECT` credentials do not grant access to the Live WebSocket.
- **Advisory, not prescriptive.** Aegis surfaces findings; the founder decides. It will never auto-close a ticket, auto-reassign work, or take any action without explicit approval.

---

## Project Status

| Phase | What | Status |
|-------|------|--------|
| 1 | Signal Engine + 5 golden eval traces, 127 unit tests | ✅ Done |
| 2 | Product Brain debate (Cynic + Optimist + Pro synthesis) | ✅ Done |
| 3 | Coordinator + Governor (8 deterministic policy checks) | ✅ Done |
| 4 | Executor + Override & Teach + approval handler | ✅ Done |
| 5 | Linear-inspired UI (Mission Control, Inbox, Chat, HITL surfaces) | ✅ Done |
| 5b | Frontend ↔ Backend wiring — chat, pipeline, Directions live | ✅ Done |
| 6 | Bet Declaration API + modal, SQLite session persistence | ✅ Done |
| 7 | Cloud SQL PostgreSQL, GCS artifacts, Cloud Run deploy hardening | ✅ Done |
| 011 | Boardroom — Gemini Live voice panel, 10 UI components, VerdictAgent | ✅ Done |

---

## Running Tests

```bash
# Backend — 127 unit tests, no GCP required
cd backend && make test

# Backend — all 5 agent eval traces (needs GCP credentials)
cd backend && make eval-all

# Backend — lint + type check
cd backend && make lint

# Frontend — type check (no server start)
cd frontend && npm run build

# Frontend — lint
cd frontend && npm run lint

# Frontend — E2E (Playwright)
cd frontend && npm run test
```

---

## Repository Structure

```
aegis-agentic-product-os/
├── backend/
│   ├── app/
│   │   ├── agent.py                 # Root pipeline entry point
│   │   ├── main.py                  # FastAPI + AG-UI SSE endpoint
│   │   ├── config.py                # Env-based config (no Secret Manager overhead)
│   │   ├── approval_handler.py      # approve/reject intervention
│   │   ├── session_store.py         # SQLite (local) / Cloud SQL (prod)
│   │   ├── agents/
│   │   │   ├── signal_engine.py     # Deterministic metrics (no LLM)
│   │   │   ├── product_brain.py     # Debate: Cynic → Optimist → Synthesis
│   │   │   ├── coordinator.py       # Intervention selection (taxonomy-constrained)
│   │   │   ├── governor.py          # 8 deterministic policy checks (no LLM)
│   │   │   ├── executor.py          # Bounded Linear writes
│   │   │   └── conversational.py    # Unified chat + pipeline trigger
│   │   └── app_utils/               # input_context_hash, trace_logging
│   ├── db/
│   │   ├── engine.py                # SQLAlchemy async engine
│   │   └── repository.py            # Data access layer
│   ├── models/                      # Pydantic schemas (mirrors data-schema.ts)
│   ├── tools/
│   │   ├── linear_tools.py          # MockLinearMCP + RealLinearMCP (http2, connection reuse)
│   │   ├── jules_service.py         # Jules API integration
│   │   └── lenny_mcp.py             # Lenny MCP client
│   ├── migrations/                  # Alembic versions
│   ├── tests/
│   │   ├── unit/                    # 127 deterministic tests
│   │   ├── integration/             # Live Gemini tests
│   │   └── eval/evalsets/           # 5 golden traces (.evalset.json)
│   └── Makefile
├── frontend/
│   ├── app/workspace/               # Pages: home, inbox, mission-control, directions
│   │   └── boardroom/[betId]/       # Boardroom route — setup → intro → live → verdict
│   ├── components/
│   │   ├── layout/                  # GlassmorphicLayout, Sidebar, Providers (CopilotKit)
│   │   ├── interventions/           # ApprovalCard, InterventionInbox, SuppressionLog
│   │   ├── chat/                    # Conversational agent surface
│   │   └── boardroom/               # 10 Boardroom components (AdvisorTile, VerdictPanel, …)
│   ├── hooks/
│   │   ├── useWorkspaceId.ts        # Single source of workspace ID
│   │   ├── useBoardroomStore.ts     # Zustand phase machine (setup→intro→live→deliberating→verdict)
│   │   ├── useGeminiLive.ts         # WebSocket lifecycle, GoAway handling
│   │   ├── useAudioPipeline.ts      # AudioWorklet capture (16kHz) + playback (24kHz)
│   │   └── useTurnCapture.ts        # [BEAR]/[BULL]/[SAGE] tag parsing → per-advisor captions
│   └── lib/                         # types.ts, constants.ts, api.ts
├── context/                         # Read before coding
│   ├── data-schema.ts               # Source of truth for all entities and fields
│   ├── agent-architecture.md        # Pipeline spec
│   ├── DESIGN_SPEC.md               # Full product spec
│   └── product-principles.md        # UX copy + risk classification rules
├── deploy/
│   └── deploy.sh                    # Cloud Run + Cloud SQL one-command deploy
├── .github/workflows/
│   ├── agentic-ci.yml               # Unit tests + evals (Workload Identity Auth)
│   └── gemini-review.yml            # PR code review via Gemini
└── docker-compose.yml
```

---

## Built for Hackathon Project

By [Abdullah Abtahi](https://www.linkedin.com/in/abdullahabtahi/) - Product Designer, Google UX Design Certified (Aspiring AI Engineer)


---

<p align="center"><em>"The goal of a pre-mortem is not to predict failure. It's to make the invisible visible before it's too late."</em></p>
