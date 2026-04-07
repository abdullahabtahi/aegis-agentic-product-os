# Aegis — Agentic Product OS

> Continuous pre-mortem for startup bets. Aegis monitors your Linear workspace, detects execution risk early, and surfaces recommended interventions for founder approval — before you waste another sprint.

---

## What it does

Aegis runs a sequential agent pipeline against your Linear workspace:

```
Signal Engine → Product Brain → Coordinator → Governor → Executor
```

1. **Signal Engine** (deterministic) — reads Linear issues/projects, computes coverage, rollover rates, cross-team thrash, and other bet-health signals.
2. **Product Brain** (LLM debate) — Cynic agent + Optimist agent → Pro model synthesis → `RiskSignal` with risk type, severity, and confidence.
3. **Coordinator** (LLM) — selects the best intervention action from the taxonomy (L1 Clarify → L2 Adjust → L3 Escalate → L4 Terminal).
4. **Governor** (deterministic) — 8 policy checks enforce rate caps, escalation ladder, duplicate suppression, and founder control level.
5. **Executor** (deterministic) — runs the approved intervention (e.g. Linear comment, issue creation, Jules task).

The founder reviews interventions through a CopilotKit-wired frontend (HITL) before any L2+ action touches their workspace.

---

## Architecture

```
frontend/          Next.js 16 + CopilotKit + AG-UI
  └── app/workspace/          Linear-style UI
  └── components/interventions/  HITL approval surfaces
  └── hooks/                  useCoAgent, useWorkspaceState, …

backend/           Python + Google ADK
  └── app/agents/             5-agent sequential pipeline
  └── app/main.py             FastAPI + AG-UI SSE endpoint (/adk/v1/app)
  └── models/                 Pydantic schema (mirrors context/data-schema.ts)
  └── tools/                  MockLinearMCP + RealLinearMCP
  └── db/                     AlloyDB / Alembic migrations (Phase 2+)
  └── tests/unit/             Deterministic tests — no GCP, no LLM
  └── tests/integration/      Agent stream tests — requires GCP (Tier 2 CI)
  └── tests/eval/             ADK evalsets — 5 golden traces
```

Full schema: [`context/data-schema.ts`](context/data-schema.ts)  
Full architecture spec: [`context/agent-architecture.md`](context/agent-architecture.md)

---

## Quick start

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | ≥ 3.10 | [python.org](https://python.org) |
| uv | latest | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| Node.js | ≥ 18 | [nodejs.org](https://nodejs.org) |
| Google Cloud SDK | latest | [cloud.google.com/sdk](https://cloud.google.com/sdk/docs/install) |
| Docker (optional) | latest | [docker.com](https://docker.com) |

### 1. Backend

```bash
cd backend
cp .env.example .env       # fill in GCP project + optional LINEAR_API_KEY
make install               # uv sync
make playground            # ADK web playground → http://localhost:8501

# Or run as FastAPI server (for frontend integration):
uv run uvicorn app.main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install

# Create .env.local
cat > .env.local <<'EOF'
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
BACKEND_URL=http://localhost:8000/adk/v1/app
EOF

npm run dev   # → http://localhost:3000
```

### 3. Docker (both services)

```bash
docker-compose up   # backend :8080, frontend :3000
```

---

## Environment variables

Copy `backend/.env.example` → `backend/.env`:

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLOUD_PROJECT` | ✅ | GCP project ID (Vertex AI / Gemini) |
| `GOOGLE_CLOUD_LOCATION` | ✅ | Must be `global` for Gemini 3 models |
| `LINEAR_API_KEY` | Optional | Live Linear workspace scans. Omit → MockLinearMCP |
| `AEGIS_MOCK_LINEAR` | Optional | Force mock even if API key is set (`true`/`false`) |
| `ALLOYDB_URL` | Optional | Phase 2+ persistence. Omit → in-memory only |
| `GOOGLE_APPLICATION_CREDENTIALS` | Local dev | Path to SA JSON key (production uses WIF) |

---

## Running tests

```bash
cd backend

# Unit tests — fast, no GCP, no LLM (used by Tier 1 CI)
make test

# Integration tests — requires GCP credentials
make test-integration

# Agent evaluations (all 5 golden traces)
make eval-all

# Lint + type check
make lint
```

```bash
cd frontend
npm run lint          # ESLint
npx tsc --noEmit      # TypeScript type check
npm run test          # Playwright E2E (if configured)
```

---

## CI pipeline

Two-tier GitHub Actions setup:

| Workflow | Trigger | Jobs | GCP needed? |
|----------|---------|------|-------------|
| `tier-1-ci.yml` | Every push / PR | Lint, type check, unit tests | ❌ No |
| `tier-2-eval.yml` | `main` / `release/**` / manual | Integration tests, ADK evals | ✅ Yes |

**Tier 1** gives sub-2-minute feedback on every branch push with zero GCP cost.  
**Tier 2** validates LLM behaviour and full pipeline integrity only when merging to main.

### GCP auth for Tier 2

Option 1 — **Workload Identity Federation** (recommended, no long-lived key):  
Add secrets `WIF_PROVIDER` and `WIF_SERVICE_ACCOUNT` to your GitHub repo.

Option 2 — **Service Account key** (fallback):  
Add secret `GCP_SA_KEY` (base64-encoded JSON key).

If neither is configured, Tier 2 fails immediately with a clear diagnostic message.

---

## Troubleshooting

See [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) for common errors (AlloyDB not available, Linear timeouts, greenlet missing, etc.).

---

## Project status

| Phase | Status |
|-------|--------|
| 1 — Signal Engine + 5 golden traces | ✅ Complete |
| 2 — Product Brain debate + ADK SkillToolset | ✅ Complete |
| 3 — Coordinator, Governor (8 checks), Escalation Ladder | ✅ Complete |
| 4 — Executor, Override & Teach, approval handler | ✅ Complete |
| 5 — Linear-style UI (LinearLayout, Home, Inbox, HITL) | ✅ UI done — backend wiring in progress |
| 6 — Bet Declaration flow, Jules Subject Hygiene | 🔜 Next |
| 7 — HeuristicVersion canary rollout, deployment hardening | 🔜 Planned |

---

## Licence

Apache 2.0 — see [LICENSE](LICENSE).
