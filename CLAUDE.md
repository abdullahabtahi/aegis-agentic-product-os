# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

# Aegis — Agentic Product OS

## Quick Start

**New to this project?** Start here:

1. **Read first** (5 minutes):
   - `context/data-schema.ts` — all entities and field names
   - `context/agent-architecture.md` — how agents connect
   - Hard Constraints section (below)

2. **Set up environment** (2 minutes):
   ```bash
   cd backend && cp .env.example .env
   # Edit .env with your GCP project, location, and optional LINEAR_API_KEY
   ```

3. **Run the system**:
   ```bash
   # Backend (uses ADK playground)
   cd backend && make install && make playground
   # Opens http://localhost:8501
   
   # Frontend (separate terminal)
   cd frontend && npm install && npm run dev
   # Opens http://localhost:3000
   ```

4. **Run tests**:
   ```bash
   cd backend && make test        # Unit + integration tests
   cd backend && make eval-all    # Agent evaluations (5 traces)
   cd frontend && npm run test    # E2E tests (Playwright)
   ```

5. **Docker setup** (optional):
   ```bash
   docker-compose up
   # Backend runs on http://localhost:8080
   # Frontend runs on http://localhost:3000
   ```

---

## Hard Constraints (read every session, non-negotiable)

- **Schema first.** Any new field → `context/data-schema.ts` before any implementation.
- **Never mutate objects in place.** Always return new copies (immutability throughout).
- **Bounded Linear writes only.** Only `LinearAction` interface types are permitted.
- **Sequential pipeline only.** Signal Engine → Product Brain → Coordinator → Governor → Executor. No parallelism between stages.
- **Gemini 3 series only** for new agents: `gemini-3-flash-preview` (workers/debate) or `gemini-3-pro-preview` (synthesis only).
- **TDD for deterministic code** (Signal Engine, parsers, validators). ADK evals (not pytest) for agent behavior.
- **No chatbot UI.** AG-UI structured surfaces + CopilotKit approvals only.
- **MockLinearMCP required** before any agent code that touches Linear. No live writes during eval.
- **Governor = 8 policy checks.** confidence_floor · duplicate_suppression · rate_cap · jules_gate · reversibility · acknowledged_risk · control_level · escalation_ladder. All 8 are deterministic — no LLM in Governor.
- **Product Brain prompts** may evolve via HeuristicVersion (MAJOR + manual review). **Governor policy prompts are immutable.**

---

## Commands Quick Reference

### Backend (Python + ADK)

```bash
cd backend

# Setup
make install                       # Install dependencies via uv
make playground                    # Local ADK web playground (localhost:8501)

# Testing
make test                          # Unit + integration tests (pytest)
make eval                          # Single evalset (default: trace_01)
make eval EVALSET=tests/eval/evalsets/trace_03_execution_issue.evalset.json
make eval-all                      # All 5 golden traces

# Quality
make lint                          # codespell + ruff check/format + type check

# Single commands
uv run pytest tests/unit/test_signal_engine.py -v     # Run single test file
uv run python script.py                                 # Run Python script directly
```

### Frontend (Next.js + TypeScript)

```bash
cd frontend

# Setup
npm install                        # Install dependencies
npm run build                      # Build for production

# Development
npm run dev                        # Dev server (localhost:3000, auto-reload)
npm run lint                       # ESLint check
npm run test                       # Playwright E2E tests (if configured)
```

### Docker (both services together)

```bash
# From repo root
docker-compose up                  # Backend (8080) + Frontend (3000)
docker-compose down                # Stop all services
```

---

## Testing Strategy

### Backend Testing (Python)

**Coverage minimum: 80%**

| Type | What | How |
|------|------|-----|
| **Unit** | Individual functions, utilities, components | `pytest tests/unit/` |
| **Integration** | API endpoints, database operations, agent chains | `pytest tests/integration/` |
| **Evals** | Agent behavior (reasoning, classification, actions) | `make eval` or `make eval-all` |

**Current state:** 75/75 unit tests ✅. 5 golden traces (trace_01 through trace_05) in `backend/tests/eval/evalsets/`.

**Run single test:**
```bash
cd backend && uv run pytest tests/unit/test_signal_engine.py::test_something -v
```

**Write a test:**
1. Create test file in `tests/unit/` or `tests/integration/`
2. Use pytest + asyncio (for async agents)
3. For agent behavior: use ADK eval (not pytest) — add case to `tests/eval/evalsets/`

**Example evalset structure** (JSON):
```json
{
  "test_cases": [
    {
      "name": "Strategy unclear detection",
      "input": { "bet": {...}, "workspace_id": "..." },
      "expected_output": { "risk_type": "strategy_unclear", ... }
    }
  ]
}
```

### Frontend Testing (TypeScript)

Currently minimal (Playwright ready). Extend with:
- Component snapshot tests
- Hook unit tests (useMissionControl, useInterventionApproval, etc.)
- E2E tests for critical flows (approval, snooze, escalation)

```bash
cd frontend && npm run test
```

---

## Environment Setup

### Prerequisites

- **Backend:** Python 3.10+, `uv` package manager, GCP SDK
- **Frontend:** Node 18+, npm
- **Both:** git, Docker (optional)

### Required Environment Variables (.env)

Copy `backend/.env.example` → `backend/.env`:

```bash
# Linear reads (optional, defaults to mock)
LINEAR_API_KEY=lin_api_xxxxx
AEGIS_MOCK_LINEAR=false          # true = always use mock data

# Google Cloud (required)
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
GOOGLE_CLOUD_LOCATION=global     # Not us-central1

# Database (Phase 2+)
ALLOYDB_URL=postgresql+asyncpg://user:pass@127.0.0.1:5432/aegis_dev

# Optional: Lenny MCP (Phase 2+)
# LENNY_MCP_URL=https://lenny-mcp.onrender.com/mcp
```

For local development without GCP: Use MockLinearMCP (no API key needed). Tests will use mock fixtures.

---

## Architecture Overview

### Pipeline: Sequential Agents

```
SequentialAgent("aegis_pipeline") wraps 5 agents:

1. Signal Engine (deterministic Python)
   reads: bet, workspace_id
   writes: linear_signals, bet_snapshot
   
2. Product Brain (LLM debate: Cynic+Optimist+Synthesis)
   reads: bet_snapshot, linear_signals
   writes: risk_signal_draft
   
3. Coordinator (LlmAgent, recommends interventions)
   reads: risk_signal_draft, bet context
   writes: intervention_proposal
   
4. Governor (deterministic, 8 policy checks)
   reads: intervention_proposal, risk_signal_draft
   writes: governor_decision, pipeline_status
   halts → awaiting_founder_approval
   
5. Executor (runs only if approved)
   reads: founder decision
   writes: executor_result, pipeline_status
```

Entry point: `backend/app/agent.py` (root SequentialAgent).

**Two-invocation model:**
1. Pipeline halts at Governor → `awaiting_founder_approval`
2. External call to `approve_intervention()` / `reject_intervention()` (in `approval_handler.py`)
3. Re-run pipeline → prior agents skip via checkpoint → Executor runs

See `context/agent-architecture.md` for full details.

---

## Locked Architectural Decisions

Do NOT re-derive or debate these:

| Decision | Why |
|----------|-----|
| Signal Engine is deterministic (Python, not LLM) | Eliminates hallucination in metrics computation |
| Strictly sequential pipeline | Product Brain requires Signal Engine output; parallelism was invalid |
| Governor has 8 policy checks | confidence_floor · duplicate_suppression · rate_cap · jules_gate · reversibility · acknowledged_risk · control_level · escalation_ladder |
| MockLinearMCP before agent code | Trust in evals requires isolated, reproducible data |
| Product Brain debate pattern | Flash(Cynic) + Flash(Optimist) + Pro(synthesis) for quality uplift |
| AlloyDB = source of truth | Graphiti (Phase 4) is a derivable temporal index |
| HITL control levels: L1/L2/L3 | Founders start on L1, graduate to reduce fatigue + build trust |
| Governor prompts immutable | Product Brain classification_prompt may evolve; Governor stays stable |
| HeuristicVersion auto-research | Offline replay + manual promotion for MAJOR versions (no live A/B testing) |
| VertexAiMemoryBankService not used | AlloyDB+pgvector is source of truth; Vertex Memory Bank can't answer bi-temporal queries |

See full decision log in main CLAUDE.md section below.

---

## Always Read First

- `context/data-schema.ts` — source of truth for all entities and field names
- `context/agent-architecture.md` — v2.0 sequential pipeline spec
- This file's "Hard Constraints" section (above)

---

## Load on Demand

| Task | Read | Use skill |
|------|------|-----------|
| Backend / ADK agent code | `context/agent-architecture.md` | `/adk-cheatsheet` |
| Frontend (AG-UI, CopilotKit, React Flow) | `context/frontend-integration.md` | `/frontend-design` |
| Testing & evals | `context/agent-architecture.md` | `/adk-eval-guide` |
| ADK Artifacts API (Phase 4) | `internal/AG_Agent/ADK_ARTIFACTS_PLAN.md` |  |
| Data strategy & memory layers | `internal/AG_Agent/aegis-audit-summary.md` |  |
| Product decisions & UX copy | `context/product-principles.md` |  |
| Full product spec | `context/DESIGN_SPEC.md` |  |
| Storage / AlloyDB / Vertex Memory | `context/tech-stack.md` |  |

---

## Folder Structure

```
aegis-agentic-product-os/
├── CLAUDE.md                        ← you are here
├── docker-compose.yml               ← run both services together
├── .github/workflows/               ← CI/CD (agentic-ci.yml, gemini-review.yml)
│
├── context/                         ← read before coding
│   ├── data-schema.ts               ← schema v3.0 (source of truth)
│   ├── agent-architecture.md        ← v2.0 sequential pipeline
│   ├── DESIGN_SPEC.md               ← full product spec
│   ├── frontend-integration.md      ← AG-UI / CopilotKit wiring
│   ├── tech-stack.md                ← storage, memory, observability
│   └── product-principles.md        ← UX copy, product decisions
│
├── internal/AG_Agent/               ← load on demand
│   ├── INTEGRATION_PLAN.md          ← SkillToolset + debate patterns
│   ├── ADK_ARTIFACTS_PLAN.md        ← artifact use cases 1+5
│   └── aegis-audit-summary.md       ← data strategy audit
│
├── backend/                         ← Python + ADK
│   ├── Makefile                     ← all commands
│   ├── pyproject.toml               ← Python deps
│   ├── .env.example                 ← env vars template
│   ├── app/
│   │   ├── agent.py                 ← root pipeline entry point
│   │   ├── main.py                  ← FastAPI + AG-UI endpoint
│   │   ├── config.py                ← config + secrets
│   │   ├── agents/                  ← 5 agents (signal_engine, product_brain, coordinator, governor, executor)
│   │   ├── tools/
│   │   │   └── linear_tools.py      ← MockLinearMCP + RealLinearMCP
│   │   ├── skills/                  ← ADK SkillToolset (L1/L2/L3)
│   │   ├── models/                  ← Pydantic (schema.py, contexts.py, responses.py)
│   │   ├── app_utils/               ← input_context_hash, telemetry, trace_logging
│   │   ├── stubs/                   ← Phase 4+ (memory_synthesis, graphiti, auto_research)
│   │   └── db/                      ← AlloyDB / Alembic migrations
│   ├── tests/
│   │   ├── unit/                    ← signal engine, parsers, validators (15/15 green)
│   │   ├── integration/             ← pipeline, agent chains
│   │   └── eval/evalsets/           ← 5 golden traces (.evalset.json)
│   └── Dockerfile                   ← container for backend
│
├── frontend/                        ← Next.js + TypeScript
│   ├── package.json                 ← npm deps
│   ├── tsconfig.json                ← TypeScript config
│   ├── CLAUDE.md                    ← AGENTS.md pointer
│   ├── AGENTS.md                    ← Next.js version notes
│   ├── app/
│   │   ├── layout.tsx               ← root layout (CopilotKit provider)
│   │   ├── workspace/
│   │   │   ├── page.tsx             ← Mission Control (main canvas)
│   │   │   ├── inbox/page.tsx       ← Intervention Inbox
│   │   │   └── activity/page.tsx    ← Activity log (stub)
│   ├── components/
│   │   ├── canvas/                  ← React Flow nodes (BetNode, AgentActivityNode, RiskEdge)
│   │   ├── interventions/           ← HITL surfaces (ApprovalCard, SeverityBadge, SuppressionLog)
│   │   ├── providers.tsx            ← CopilotKit + React Query setup
│   │   └── error-boundary.tsx       ← error handling
│   ├── hooks/                       ← 6 state hooks (useWorkspaceState, useAgentStateSync, etc.)
│   ├── lib/                         ← types.ts, api.ts, delta.ts (fast-json-patch)
│   ├── styles/globals.css           ← Tailwind v4, design tokens
│   ├── Dockerfile                   ← container for frontend
│   └── playwright.config.ts         ← E2E test config
```

---

## Build State (as of 2026-04-07)

| Phase | Status | Gate |
|-------|--------|------|
| 1 | ✅ Complete | Signal Engine + 5 golden traces, 75/75 tests green |
| 2 | ✅ Complete | Product Brain debate, ADK SkillToolset, eval ≥ 0.8 |
| 3 | ✅ Complete | Coordinator, Governor (8 checks), Escalation Ladder, E2E dry-run |
| 4 | ✅ Complete | Executor, Override & Teach, approval_handler, override_teach |
| 5 | ✅ Scaffold done | Frontend: Next.js 16, CopilotKit, React Flow, HITL surfaces, 6 hooks |
| 6 | 🚧 In progress | Bet Declaration flow, BetOutcomeRecord corpus, Jules Subject Hygiene |
| 7 | — | HeuristicVersion canary rollout, EvalSynthesisJob, deployment hardening |

### Bugs fixed 2026-04-07

| File | Bug | Fix |
|------|-----|-----|
| `backend/app/main.py:184-201` | Approval endpoints called `approval_handler` with wrong signature (`intervention_id` instead of `session_state`) | Replaced with direct `db.repository.update_intervention_status()` calls |
| `backend/app/main.py:196` | Default rejection reason `"founder_rejected"` is not a valid `RejectionReasonCategory` | Changed to `"other"`; added `RejectBody` Pydantic model |
| `backend/app/main.py:193` | `body: dict = {}` mutable default — FastAPI anti-pattern | Replaced with `body: RejectBody = RejectBody()` |
| `frontend/lib/types.ts:6-12` | `RiskType` had EvidenceType values (`missing_hypothesis`, `missing_metric`) and invented `low_confidence` | Aligned with `data-schema.ts`: 4 canonical types incl. `placebo_productivity` |
| `frontend/lib/types.ts:16-21` | `InterventionStatus` had `auto_suppressed` + `snoozed` (neither in backend) | Aligned with `data-schema.ts`: `dismissed` replaces both |
| `frontend/lib/types.ts:137-143` | `GovernorDecision.double_confirm_required` didn't match backend `requires_double_confirm`; had extra `pipeline_status` field | Aligned with `models/responses.py GovernorDecision` exactly |
| `frontend/lib/types.ts:131-135` | `BlastRadius.summary` doesn't exist in backend; missing 3 backend fields | Aligned with `data-schema.ts BlastRadiusPreview` |
| `frontend/lib/constants.ts:28-35` | `RISK_LABELS` had keys for the removed RiskType values | Aligned with corrected `RiskType` |

---

## Next Steps (80/20 — production impact order)

### Priority 1 — Gate for Phase 5 demo (must fix before showing to anyone)

1. **Wire `useJulesPlanApproval` to the corrected `requires_double_confirm` field.**
   Any component that reads `governor_decision.double_confirm_required` must be updated to `requires_double_confirm`. Search: `grep -r "double_confirm_required" frontend/`.

2. **Wire `snoozed` UI state to the new `dismissed` status.**
   `useInterventionInbox` has a `snoozed` set (localStorage). The filter condition that previously checked `status === "auto_suppressed"` must now check `status === "dismissed"`. Ensure `ApprovalCard` and `SuppressionLog` render correctly for both `dismissed` and `snoozed` (local-only).

3. **Add `NEXT_PUBLIC_BACKEND_URL` to `frontend/.env.local`.**
   Default is `http://localhost:8000` (local uvicorn). Docker-compose backend is on `8080`. Mismatch causes silent 404s on all REST calls.
   ```bash
   echo "NEXT_PUBLIC_BACKEND_URL=http://localhost:8000" > frontend/.env.local
   ```

4. **Run `make test` + `make eval-all` on the backend** to confirm no regressions from the approval endpoint rewrite.
   ```bash
   cd backend && make test && make eval-all
   ```

### Priority 2 — Phase 6 build (high signal value, low coupling)

5. **Bet Declaration flow** (`backend/app/agents/` + `frontend/app/workspace/`).
   - Start monitoring scan fires immediately on confirmation (Phase 6 gate).
   - Add `/bets` POST endpoint → persists Bet → triggers first pipeline run.
   - Frontend: simple form modal on Mission Control (not a new route).

6. **`build_jules_subject` (Subject Hygiene for Jules).**
   - Coordinator currently writes `proposed_issue_title` + `proposed_issue_description` as free text.
   - Add `build_jules_subject(bet, risk_signal, action_type) -> str` utility to normalize subject format for Jules L3 actions. Pure function, 100% testable.

### Priority 3 — Eval hardening (phase gate unlock)

7. **Run `make eval-all` and check `tool_trajectory_avg_score` across all 5 traces.**
   Phase 6 gate requires all traces ≥ 0.8. Any that fail need prompt iteration in `product_brain.py` or `coordinator.py`.

8. **Add `classification_rationale` assertions to eval traces** (Phase 3 field — currently written but not evaluated).
   Adds a natural-language audit trail to evals at zero prompt-cost.

### What to skip (YAGNI until Phase 7)
- `BetOutcomeRecord` corpus — valuable for learning, but needs weeks of real data to matter.
- HeuristicVersion canary rollout — zero bets in prod yet; premature.
- PDF digest, mobile fallback, SSE reconnect banner — non-impact for Phase 6.

---

## ADK Gotchas

- **Model 404 errors:** Fix `GOOGLE_CLOUD_LOCATION` (set to `global`, not `us-central1`). Don't change the model name.
- **ADK tool imports:** Import the tool instance, not the module: `from google.adk.tools.load_web_page import load_web_page`
- **Agent parent-check errors:** ADK agents can only have one parent. Use factory functions (`create_*_agent()`) that return fresh instances — never reuse agent objects across tests or eval runs.
- **Eval format:** `adk eval` requires `.evalset.json` (JSON, not YAML). Evalsets live in `backend/tests/eval/evalsets/`.
- **Type checking:** Use `ty` (Astral's type checker), not mypy. See `pyproject.toml` for config.

---

## Common Development Tasks

### Adding a new field to an entity

1. Add to `context/data-schema.ts` with comments
2. Create/update Pydantic model in `backend/app/models/` (e.g., `schema.py`)
3. If database: add Alembic migration in `backend/app/db/alembic/versions/`
4. Update agent(s) that touch that field
5. Add test coverage (unit + eval)

### Writing an agent

1. Create file in `backend/app/agents/my_agent.py`
2. Subclass `google.adk.agents.BaseAgent` (deterministic) or `google.adk.agents.LlmAgent` (LLM)
3. Implement `_run_async_impl(self, ctx: AgentContext) -> AgentResponse`
4. Wire into pipeline: add to `SequentialAgent` in `backend/app/agent.py`
5. Write eval cases (add to `tests/eval/evalsets/`)
6. Run `make eval` iteratively until ≥ 0.8

### Debugging an agent

```bash
# Run single eval case with verbose output
cd backend && uv run adk eval ./app tests/eval/evalsets/trace_01_strategy_unclear.evalset.json

# Inspect agent trace
# Output shows AgentTrace with tool calls, LLM responses, and classifier decisions
```

### Adding a database table

1. Create Alembic migration: `cd backend/app/db && alembic revision --autogenerate -m "Add new table"`
2. Edit migration in `alembic/versions/XXXX_add_new_table.py`
3. Run: `alembic upgrade head`
4. Create Pydantic model in `backend/app/models/`
5. Use in agent code

### Testing a quick fix

```bash
# Run a single unit test
cd backend && uv run pytest tests/unit/test_signal_engine.py::test_bet_metrics -v

# Run all tests in a file
cd backend && uv run pytest tests/unit/test_signal_engine.py -v

# Re-run only failures
cd backend && uv run pytest --lf -v
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `GOOGLE_CLOUD_LOCATION not found` or model 404 | Ensure `.env` has `GOOGLE_CLOUD_LOCATION=global` (not us-central1) |
| Agent import errors (`AgentNotFound`) | Make sure `app/agent.py` exports the root agent with correct name |
| Eval fails with `Model not ready` | Likely missing GCP credentials; set `GOOGLE_APPLICATION_CREDENTIALS` or use mock mode (`AEGIS_MOCK_LINEAR=true`) |
| Database connection errors | Check `ALLOYDB_URL` format and Cloud SQL Auth Proxy is running (`cloud_sql_proxy -instances=project:region:instance`) |
| Tests timeout | Increase pytest timeout in `pyproject.toml` or use `pytest -x` to stop on first failure |
| Linear API 401 errors | Verify `LINEAR_API_KEY` in `.env` (must have at least "Read" scope) |
| Frontend build fails | Clear `node_modules` and `.next`: `rm -rf node_modules .next && npm install && npm run build` |
| Intervention approval not working | Check CopilotKit runtime URL in frontend provider; should point to backend API (`http://localhost:8000` or `http://backend:8080` in Docker) |

---

## CI/CD Pipeline

GitHub Actions (`.github/workflows/`):

| Workflow | Trigger | What |
|----------|---------|------|
| `agentic-ci.yml` | Push to main / PR | Unit tests, eval-all, Workload Identity Auth |
| `gemini-review.yml` | PR | Code review via Gemini (from `GEMINI.md`) |

To run locally:
```bash
cd backend && make test && make eval-all
```

---

## End Constraints (position-aware reinforcement)

- Schema changes always go in `data-schema.ts` first.
- MockLinearMCP must exist before any agent code touches Linear.
- Never auto-promote a MAJOR `HeuristicVersion` — always `requires_manual_review: true`.
- Governor prompts are immutable — only HeuristicVersion numeric thresholds and `classification_prompt_fragment` may evolve.
- `control_level` on `Workspace` is checked as the 7th Governor policy check before every Executor call.
- `escalation_ladder` is the 8th Governor policy check. Coordinator recommends; Governor enforces. Never let Coordinator skip rungs.
- `SkillToolset` API name: verify exact ADK import before coding L1/L2/L3 — may need `before_model_callback` dynamic prompt assembly instead.
- `no_intervention` records: internal audit only — never render in founder-facing UI surfaces.
- Evals use `adk eval`, never pytest alone.

---

## Helpful Links

- **ADK Docs:** https://google.github.io/adk-docs/
- **Gemini API:** https://ai.google.dev/
- **Linear API:** https://linear.app/api/documentation/
- **Next.js Docs:** https://nextjs.org/docs
- **TypeScript Handbook:** https://www.typescriptlang.org/docs/
- **SQLAlchemy (async):** https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html
