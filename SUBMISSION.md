# Aegis — Submission Materials
**Google Cloud Gen AI Academy Hackathon · April 2026**

---

## One-Line Pitch

Aegis is a continuous pre-mortem for startup bets — a 5-agent AI pipeline that watches your execution signals, detects strategy drift before the quarter ends, and surfaces one concrete action for the founder to approve.

---

## The Problem

Every early-stage founder has lived this story: you ship a bet, three sprints pass, velocity looks fine — tickets close, PRs merge, standups feel productive. Then the quarter ends. The metric didn't move. The team was busy, but **busy on the wrong things.**

Execution slippage doesn't announce itself. It hides inside healthy-looking dashboards. Rollovers accumulate quietly. Work drifts from the stated hypothesis. By the time the founder notices, the quarter is gone.

Shreyas Doshi calls these **Tigers and Elephants** — the urgent fires (Tigers) that consume attention while the slow, silent strategic failures (Elephants) go unnoticed until it's too late.

**Aegis runs your pre-mortem before the post-mortem is necessary.**

---

## Judging Criterion 1: Architecture & Technical Execution

### The 5-Agent Sequential Pipeline

Aegis implements a strictly sequential multi-agent pipeline using **Google ADK ≥1.15**. Each agent produces a typed output that the next agent consumes as input. No parallelism — by design. Strategy problems require causal reasoning, not concurrent analysis.

```
 Linear Workspace (MCP Tool)
      │
      ▼
 ┌─────────────────┐
 │  Signal Engine  │  ADK BaseAgent (no LLM). Reads 14 days of issues via LinearMCP.
 │                 │  Computes: bet coverage %, rollover rate, blocker depth,
 └────────┬────────┘  cross-team thrash index, hypothesis drift score.
          │ LinearSignals (typed Pydantic model)
          ▼
 ┌─────────────────┐
 │  Product Brain  │  ADK LlmAgent orchestrating 3 sub-agents:
 │                 │  · Cynic (gemini-3-flash) — finds the hardest failure mode
 │                 │  · Optimist (gemini-3-flash) — challenges Cynic's evidence
 └────────┬────────┘  · Pro (gemini-3-pro) — synthesises typed RiskSignal with
          │ RiskSignal  confidence score + product principle citation
          ▼
 ┌─────────────────┐
 │   Coordinator   │  ADK LlmAgent. Maps RiskSignal to exactly one action
 │                 │  from a 14-action taxonomy across 4 escalation levels:
 └────────┬────────┘  L1 Clarify → L2 Adjust → L3 Escalate → L4 Terminal
          │ ProposedIntervention
          ▼
 ┌─────────────────┐
 │    Governor     │  ADK BaseAgent (no LLM). 8 deterministic policy checks.
 │                 │  Confidence floor · Duplicate suppression · Rate cap ·
 └────────┬────────┘  Jules gate · Reversibility · Acknowledged risk ·
          │ Approved | Denied  Control level · Escalation ladder
          ▼
 ┌─────────────────┐
 │    Executor     │  ADK LlmAgent. Writes to Linear via LinearMCP.
 │                 │  Never improvises. Executes only what Governor approved.
 └─────────────────┘  Every write requires founder click-approval (HITL).
```

### ADK Implementation Details

**BaseAgent vs LlmAgent distinction:** Signal Engine and Governor are `BaseAgent` subclasses — pure Python, deterministic, no token spend. Product Brain, Coordinator, and Executor are `LlmAgent` instances with structured output schemas. This separation means the two most consequential decisions in the pipeline (signal computation and final approval) never touch an LLM.

**Agent factory pattern:** Each agent is created via a `create_*_agent()` factory function. ADK agents can only have one parent in a session tree — factory functions prevent the "agent already has a parent" runtime error that occurs when reusing agent objects across eval runs.

**Typed inter-agent contracts:** Every handoff is a Pydantic model (`LinearSignals`, `RiskSignal`, `ProposedIntervention`, `GovernorDecision`). The pipeline cannot proceed with a malformed payload — schema enforcement happens at the agent boundary, not inside prompt instructions.

**CopilotKit + AG-UI SSE streaming:** The frontend subscribes to pipeline state via Server-Sent Events. Each agent stage emits a typed `PipelineStatus` event that the UI renders in real time. The `useCoAgent<AegisPipelineState>` hook syncs agent state to React without polling.

### Capstone Feature: Aegis Boardroom

The Boardroom is a live, voice-first AI panel that stress-tests a product decision using actual pipeline data.

**Technical implementation:**
- Single Gemini Live WebSocket (AI Studio `gemini-3.1-flash-live-preview`)
- Voice capture via `AudioWorklet` at 16kHz, off the main thread — no render-cycle stalls
- Playback via `AudioContext` at 24kHz with queue draining
- Speaker tags `[BEAR]/[BULL]/[SAGE]` parsed in real time by `useTurnCapture` for per-advisor UI attribution
- `GoAway` frame handling for session resumption under network interruption
- `AudioContext` created synchronously inside the user gesture handler (Chrome/Safari autoplay policy) — passed as a prop to avoid the unlocked-context-window problem

**AudioWorklet architecture:**
```
Browser main thread
  └─ AudioContext (locked until user gesture)
       └─ MediaStreamSource (mic)
            └─ AudioWorkletNode (16kHz capture)  ← off main thread
                 └─ port.postMessage → WebSocket.send (PCM16 chunks)

Received audio:
  WebSocket.onmessage → AudioContext.decodeAudioData → AudioBufferSourceNode → speakers
```

**Verdict synthesis:** After the voice session ends, an ADK verdict agent (separate from the pipeline) reads the session transcript and produces a structured `BoardroomVerdict`: confidence score (0–100), proceed/pause/pivot recommendation, per-advisor assessments, key risks, next experiments. The verdict is anchored in the Aegis audit trail as an Intervention — every Boardroom session becomes a governance record.

| Advisor | Persona | Voice |
|---------|---------|-------|
| Jordan (Bear) | Skeptic. Cites pipeline risk signals in the opening. | Challenges assumptions. |
| Maya (Bull) | Champion. Argues the strongest case for the bet. | Defends the hypothesis. |
| Ren (Sage) | Operator. Bridges Bear and Bull. | Always closes with 2-3 experiments. |

---

## Judging Criterion 2: Technical Choices & Feasibility

### Why Google ADK (not LangChain / raw API calls)

ADK provides three things raw API calls cannot: a built-in session tree that prevents agent state leakage across calls, a `BaseAgent` contract that enforces typed input/output schemas, and first-class support for `ToolContext` — the mechanism Executor uses to call LinearMCP with the founder's workspace credentials. The session tree also gives Aegis a native audit trail: every agent call, every tool invocation, every Governor decision is recorded in ADK's session store.

### Why Sequential, Not Parallel

Parallel agents are appropriate when sub-tasks are independent. The Aegis pipeline is a causal chain — Product Brain cannot interpret signals until Signal Engine has computed them; Coordinator cannot select an intervention until it knows the risk category; Governor cannot approve until it has the proposed intervention. Forcing parallelism here would require re-fetching data multiple times and lose the causal reasoning that makes the intervention match the problem.

### Why Deterministic Gates Around LLMs

The Governor runs 8 hard checks with no LLM involvement:

1. **Confidence floor** — RiskSignal.confidence < 0.65 → denied
2. **Duplicate suppression** — same action type + same bet within 48h → denied
3. **Rate cap** — more than 3 interventions per bet per week → denied
4. **Jules gate** — proposed action contradicts a founder-acknowledged risk → escalate
5. **Reversibility check** — irreversible actions require L3+ escalation level
6. **Acknowledged risk** — action type must match risk category from RiskSignal
7. **Control level** — action autonomy must not exceed founder's configured control setting
8. **Escalation ladder** — L1 actions cannot be proposed for L3+ severity signals

No LLM hallucination can bypass these. The model's confidence is necessary, not sufficient.

### Why MCP for Linear

Linear's REST API is rate-limited and requires bespoke pagination logic. MCP wraps the Linear GraphQL API with a typed tool interface that ADK's `ToolContext` can call natively. This means Signal Engine's data fetching and Executor's writes share the same auth context — the founder's Linear token is never duplicated in agent prompts.

Mock mode (`AEGIS_MOCK_LINEAR=true`) lets judges run the full pipeline without a Linear API key — the mock returns deterministic fixture data that triggers realistic risk scenarios.

### Why Cloud SQL PostgreSQL (not AlloyDB or Firestore)

Cloud SQL g1-small at ~$26/month is the minimum viable production database for a solo build under a hackathon constraint. pgvector is enabled for Phase 4+ vector search on bet embeddings. The upgrade path to AlloyDB is documented in the architecture decision record — the ORM (SQLAlchemy 2 async) is database-agnostic, so migration is a connection string swap.

### Why CopilotKit + AG-UI

CopilotKit's AG-UI protocol is the only open standard for streaming agent state to React without custom WebSocket boilerplate. It defines a typed SSE event envelope that the backend emits per agent stage and the frontend subscribes to via `useCoAgent`. The alternative (polling a REST status endpoint) would lose sub-second pipeline stage visibility and prevent the live "scanning → analyzing → intervening" UX.

---

## Judging Criterion 3: Solution Quality & Functionality

### End-to-End Working Features

**1. Bet Declaration**
- Founder creates a bet (hypothesis, metric, timeline) via the Bet Declaration modal
- Stored in PostgreSQL with UUID, workspace association, and status tracking
- Visible immediately in the Mission Control sidebar

**2. Pipeline Scan (full agent loop)**
- "Scan for Risks" triggers the 5-agent pipeline via the CopilotKit runtime
- Real-time stage updates stream to UI: `scanning → analyzing → intervening → awaiting_approval`
- Risk Signal card appears with: risk category, confidence score, evidence summary, product principle citation

**3. Human-in-the-Loop Approval**
- Founder sees the proposed intervention: action type, rationale, projected impact
- One-click Approve or Deny
- On Approve: Executor writes to Linear (comment, label, or status change)
- On Deny: intervention recorded as denied in audit trail, pipeline halts

**4. Governor Policy Enforcement**
- All 8 checks run synchronously before Executor is called
- Denied interventions surface the specific policy that blocked them
- Rate-capped attempts show "try again in X hours"

**5. Boardroom Voice Session**
- Founder opens Boardroom from any active bet
- Setup form: decision question (200 chars) + key assumption (150 chars)
- Intro screen shows 3 advisors + context preview (pipeline data loaded)
- Live session: real-time captions, per-advisor active-speaker highlighting, session timer with 13-minute warning
- End session → deliberating overlay → structured verdict panel
- Verdict anchored as Intervention in audit trail

**6. Control Level Settings**
- Founder sets autonomy level (Supervised / Assisted / Autonomous) in workspace settings
- Governor respects this setting — Autonomous mode can skip approval for L1 actions
- Persisted in PostgreSQL workspace record

**7. Activity Log**
- Full audit trail of all interventions (approved, denied, pending)
- Filter by action type, risk category, date range
- Each entry links to the source bet and pipeline run

### Test Coverage

- 127 passing tests (unit + integration)
- 5 ADK golden eval traces (one per agent)
- Eval framework: `.evalset.json` format, run via `make eval-all`

---

## Judging Criterion 4: Impact & Use Case Relevance

### The Productivity Multiplier

Aegis is a multi-agent productivity assistant for the highest-leverage user in a startup: **the founder**. Every hour a founder spends on the wrong bet costs more than any engineer's sprint.

The system addresses a specific failure mode that no existing tool catches: **execution drift on strategic bets**. Jira tracks tasks. Linear tracks issues. Notion tracks documents. None of them answer: *"Is this bet still the right thing to be working on, and is the team actually executing on it?"*

Aegis answers that question continuously — without requiring the founder to build a custom dashboard, write a prompt, or notice the problem themselves.

### Quantifiable Impact Model

A single prevented "zombie quarter" — where 10 engineers spend 12 weeks on a bet that had drifted from its hypothesis — is worth ~$300K in recovered engineering capacity (at $150K loaded cost per engineer). The Signal Engine's rollover rate and bet coverage metrics can detect this drift by week 2. The cost of running Aegis for a quarter: negligible.

### Why This Problem, Why Now

The rise of AI-assisted development has accelerated *execution speed* without improving *execution direction*. Teams ship faster but drift faster. The gap between "we're busy" and "we're moving the metric" has never been wider. Aegis is the instrument that closes that gap.

### Alignment with Problem Statement Requirements

| Requirement | Aegis Implementation |
|-------------|---------------------|
| Primary agent coordinating sub-agents | Product Brain (LlmAgent) orchestrates Cynic + Optimist + Pro sub-agents |
| Structured data storage | PostgreSQL 16 with 7 tables: workspaces, bets, interventions, pipeline_runs, sessions, audit_log, settings |
| MCP tool integration | LinearMCP (read: list_issues, get_project; write: save_comment, save_issue, create_issue_label) |
| Multi-step workflows | 5-stage pipeline + HITL approval + Executor write = 7-step end-to-end workflow |
| API-based deployment | FastAPI backend on Cloud Run; frontend on Cloud Run; CopilotKit runtime as middleware |

---

## Judging Criterion 5: Demo, UX & Presentation

### Design Philosophy

**Founders are pilots with instruments, not passengers on autopilot.**

- **One intervention, not a menu.** Decision fatigue is real. Aegis never presents a list of risks to triage — it surfaces one action, ranked by the full pipeline.
- **Confidence always visible.** The confidence score is on every risk card. Hiding uncertainty would be paternalistic and dangerous for a tool that influences real decisions.
- **Risk framed as lost upside, not threat.** *"Keeping these 4 meetings likely costs you 2 hypothesis validations this week."* Not: *"Your bet is at risk."*
- **Every write requires approval.** The Governor enforces this. No action touches Linear without a founder click — even in Autonomous mode, irreversible actions require confirmation.

### UI Architecture

- **Glassmorphic design language**: `backdrop-blur-md`, translucent cards, subtle gradient accents — matches the "strategic overlay" metaphor
- **Linear-inspired sidebar**: Dark sidebar with workspace switcher, bet list, activity log — familiar to the target user
- **Real-time pipeline stages**: The `PipelineStatus` banner updates as each agent completes — scanning → analyzing → intervening → awaiting approval
- **Boardroom 10-component system**:
  - `AdvisorTile` — active-speaker scale + SoundWaveBars animation, reduced-motion compliant
  - `BoardroomSetupForm` — 2-step form with char count, touched-state validation
  - `BoardroomSessionTimer` — elapsed display with amber warning at 13 min, hard stop at 15 min
  - `BoardroomConnectionBanner` — status → label/icon/color mapping for all connection states
  - `BoardroomUserPiP` — picture-in-picture with MotionValue-driven waveform (zero re-renders per frame)
  - `BoardroomControls` — mute/end session, 44×44px touch targets
  - `BoardroomIntroScreen` — staggered advisor card entrance, context preview accordion
  - `DeliberatingOverlay` — full-screen blur with animated dots while verdict agent synthesises
  - `VerdictPanel` — 3-tab layout: Verdict / Key Risks / Next Experiments; SVG confidence gauge
  - `BoardroomRoom` — orchestrator: session lifecycle, AudioWorklet init, phase machine

### Accessibility

- `useReducedMotion()` guards on all Boardroom animations
- 44×44px minimum touch targets on all interactive elements
- `aria-live` regions for pipeline status updates
- Keyboard navigation through approval flow

---

## The Numbers

| Metric | Value |
|--------|-------|
| AI agents in the pipeline | 5 (sequential) |
| ADK BaseAgent (deterministic) | 2 (Signal Engine, Governor) |
| ADK LlmAgent | 3 (Product Brain, Coordinator, Executor) |
| Product Brain sub-agents | 3 (Cynic, Optimist, Pro) |
| Governor policy checks | 8 (deterministic) |
| Intervention action types | 14 |
| Escalation levels | 4 (L1–L4) |
| Passing tests | 127 |
| ADK golden eval traces | 5 |
| Boardroom UI components | 10 |
| Database tables | 7 |
| LinearMCP tools used | 6 |
| Lines of Python (backend) | ~4,500 |
| Lines of TypeScript (frontend) | ~5,200 |
| Development timeline | 2 days to initial submission |

---

## Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Agent framework | Google ADK ≥1.15 | Session tree, typed agent contracts, ToolContext for MCP |
| LLM (pipeline) | Gemini 3-flash-preview (workers) + gemini-3-pro-preview (synthesis) | Flash for parallel debate agents, Pro for final synthesis |
| LLM (Boardroom) | Gemini Live `gemini-3.1-flash-live-preview` via AI Studio | Only Live API with multi-turn voice + speaker awareness |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2 async | Async I/O matches ADK's async session model |
| Frontend | Next.js 16, React 19, TypeScript 5, Tailwind v4 | Latest stable; Tailwind v4 for CSS-first config |
| Agent-UI bridge | CopilotKit + AG-UI protocol (SSE) | Only open standard for real-time agent state → React |
| Database | Cloud SQL PostgreSQL 16 g1-small + pgvector | ~$26/month; pgvector ready for Phase 4 embeddings |
| Deployment | Cloud Run (backend + frontend) | Serverless; scales to zero between scans |
| CI/CD | GitHub Actions — two-tier | Fast unit tests on PR; ADK golden evals on main |
| Linear integration | LinearMCP (real + mock mode) | Mock mode enables demo without API key |

---

## Team

Solo build by **Abdullah Abtahi**.
Google Cloud Gen AI Academy Hackathon — Top 100 selection.
