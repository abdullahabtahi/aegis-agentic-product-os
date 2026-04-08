# Aegis Ship-Readiness Report

> Audit date: 2026-04-08
> Auditor: Automated comprehensive audit
> Verdict: **Runnable but not demo-ready** — see justification below

---

## 1. Architecture Summary

Aegis is a **5-stage sequential AI pipeline** that monitors startup bets via Linear workspace data and autonomously recommends interventions.

```
User (Chat / Bet Declaration)
    ↓
Conversational Agent (Gemini 3 Flash)
    ↓ (triggers via run_pipeline_scan tool)
┌────────────────────────────────────────────┐
│ Signal Engine (deterministic Python)       │ ← Reads Linear, computes metrics
│ Product Brain (LLM debate: Cynic+Optimist) │ ← Classifies risk type + confidence
│ Coordinator (LLM)                          │ ← Recommends intervention
│ Governor (deterministic, 8 policy checks)  │ ← Approves/denies intervention
│ Executor (deterministic)                   │ ← Writes to Linear/Jules
└────────────────────────────────────────────┘
    ↓
Founder sees intervention in UI → Approves/Rejects
```

**Key design decisions:**
- Sequential pipeline — each stage feeds the next, no parallelism
- Governor is fully deterministic (8 hard-coded policy checks, no LLM)
- Conversational agent wraps pipeline as a tool (not a separate router)
- AG-UI protocol for real-time state streaming to CopilotKit frontend
- AlloyDB for persistence with graceful fallback to session-state-only mode

**Tech stack:**
- Backend: Python 3.10+, Google ADK, FastAPI, SQLAlchemy (async), AlloyDB/PostgreSQL
- Frontend: Next.js 16, React 19, CopilotKit 1.54, AG-UI, Tailwind v4, React Query
- Models: Gemini 3 Flash (workers/debate), Gemini 3 Pro (synthesis)
- CI: 2-tier GitHub Actions (fast lint/test + separate eval/integration)

---

## 2. Ship-Readiness Status

### ✅ Working Now

| Component | Evidence | Files |
|-----------|----------|-------|
| **Signal Engine** (Stage 1) | 122/122 unit tests pass, deterministic | `backend/app/agents/signal_engine.py` |
| **Product Brain** (Stage 2) | Debate pattern (Cynic+Optimist+Synthesis) implemented | `backend/app/agents/product_brain.py` |
| **Coordinator** (Stage 3) | LLM agent recommends interventions | `backend/app/agents/coordinator.py` |
| **Governor** (Stage 4) | 8 policy checks, all deterministic, tested | `backend/app/agents/governor.py` |
| **Executor** (Stage 5) | Linear writes + Jules stubs, checkpoint guard | `backend/app/agents/executor.py` |
| **14 REST endpoints** | All functional, no stubs | `backend/app/main.py` |
| **CopilotKit ↔ AG-UI bridge** | HttpAgent → SSE stream at `/adk/v1/app` | `frontend/app/api/copilotkit/route.ts` |
| **Chat UI** | Hero mode + message feed, pipeline progress card | `frontend/app/workspace/page.tsx` |
| **Mission Control** | Pipeline stage display, intervention panel, health chart | `frontend/app/workspace/mission-control/` |
| **Intervention Inbox** | REST polling, approve/reject buttons, snooze | `frontend/app/workspace/inbox/` |
| **Session persistence** | SQLite-backed ADK sessions, survives restarts | `backend/app/session_store.py` |
| **Health endpoint** | Deep check (AlloyDB + GCP + Linear) | `GET /health` |
| **CI/CD** | 2-tier pipeline, ~2min fast / separate eval | `.github/workflows/tier-{1,2}-*.yml` |
| **Backend lint** | codespell + ruff + ty, all passing | `backend/pyproject.toml` |
| **Backend tests** | 122 unit tests, 4/5 eval traces passing | `backend/tests/` |

### ⚠️ Broken or Unverified

| Issue | Impact | Evidence |
|-------|--------|----------|
| **Conversational agent only runs Stages 0-1** | Coordinator/Governor/Executor never execute from UI path | `conversational.py:135-142` — emits synthetic stage progression |
| **Approval flow never exercised from UI** | Governor sets `awaiting_founder_approval` but it's unreachable | Pipeline reaches Governor only via `aegis_pipeline` (eval/playground) |
| **Eval trace 04 failing** | Low-confidence edge case doesn't pass ≥0.8 threshold | Missing `risk_signal_draft` handling in Coordinator |
| **Frontend build blocked without Google Fonts** | CI/offline environments fail `next build` | `frontend/app/layout.tsx:2` — uses `next/font/google` |
| **No frontend E2E tests** | Playwright configured but zero tests written | `frontend/playwright.config.ts` exists, no test files |
| **AlloyDB not usable without Cloud SQL Proxy** | All DB-backed features return `[]` in local dev | `backend/db/engine.py` |

### 🔴 Must Fix Before Demo

| # | Issue | Severity | Impact | Effort | Files | Recommended Fix |
|---|-------|----------|--------|--------|-------|-----------------|
| 1 | **Pipeline stages 2-4 not wired in conversational agent** | CRITICAL | Without this, the demo shows synthetic progress, not actual risk analysis + intervention | Medium (2-4h) | `backend/app/agents/conversational.py` | Wire Coordinator → Governor → Executor inline within `run_pipeline_scan()`. Import and invoke each stage's core logic directly (not as SequentialAgent sub-agents). |
| 2 | **No intervention is ever created from the UI path** | CRITICAL | Demo can't show the full approve/reject workflow with real data | Medium (2h) | `backend/app/agents/conversational.py`, `backend/db/repository.py` | After wiring stages 2-4, Governor will create interventions that persist to DB and appear in the Inbox |
| 3 | **Mock data in Mission Control** | HIGH | 2 hardcoded intervention cards show even when backend is connected | Low (30m) | `frontend/app/workspace/mission-control/page.tsx` | Remove mock cards or gate them behind a `NEXT_PUBLIC_DEMO_MODE` flag |
| 4 | **Execution Health chart is static mock data** | MEDIUM | Chart shows fake bar data (Mon-Sun), misleading in a demo | Low (1h) | `frontend/app/workspace/mission-control/page.tsx` | Wire to `/interventions` or `/bets` aggregate data, or show "No data yet" placeholder |

### 🟡 Must Fix Before Production

| # | Issue | Severity | Impact | Effort | Files | Recommended Fix |
|---|-------|----------|--------|--------|-------|-----------------|
| 5 | **CORS defaults to `*`** | HIGH | Any origin can call API in production | Low (15m) | `backend/app/main.py:75`, `docker-compose.yml` | Already warns in logs; enforce via `ALLOWED_ORIGINS` env var in deployment |
| 6 | **InMemoryArtifactService loses data on restart** | MEDIUM | Artifacts (reports, session replays) disappear | Medium (2h) | `backend/app/agent.py:126`, `backend/app/main.py:43` | Swap to `GcsArtifactService(bucket_name=...)` when GCS bucket available |
| 7 | **No rate limiting on API** | MEDIUM | Public endpoints could be abused | Low (1h) | `backend/app/main.py` | Add `slowapi` or similar rate limiter to POST endpoints |
| 8 | **No authentication on REST endpoints** | HIGH | Anyone can approve/reject interventions | Medium (4h) | `backend/app/main.py` | Add API key validation or OAuth2 middleware |
| 9 | **`adjust_autonomy()` only updates session state** | MEDIUM | Control level resets on new session | Low (30m) | `backend/app/agents/conversational.py:374` | Write to AlloyDB `workspaces.control_level` |
| 10 | **Database migrations not auto-applied** | MEDIUM | Schema drift if migrations aren't run manually | Low (1h) | `backend/migrations/` | Add Alembic upgrade to Docker entrypoint or health check |
| 11 | **Google Fonts blocks offline builds** | MEDIUM | CI/air-gapped environments can't build frontend | Low (30m) | `frontend/app/layout.tsx` | Switch to `next/font/local` with self-hosted font files |
| 12 | **No structured logging (JSON)** | LOW | Hard to parse logs in Cloud Run / centralized logging | Low (1h) | `backend/app/main.py:33-35` | Use `python-json-logger` or `structlog` for JSON output |

### 🟢 Nice to Improve Later

| # | Issue | Impact | Effort | Files |
|---|-------|--------|--------|-------|
| 13 | Add frontend E2E tests (Playwright) | Catch regressions in approval flow | Medium (4h) | `frontend/` |
| 14 | Delete legacy `agentic-ci.yml` workflow | Reduce confusion | Low (5m) | `.github/workflows/agentic-ci.yml` |
| 15 | Add coverage reporting to CI | Track test gaps | Low (30m) | `.github/workflows/tier-1-ci.yml` |
| 16 | Wire `useJulesPlanApproval` portal rendering | L3 Jules approval modal actually visible | Medium (2h) | `frontend/app/workspace/layout.tsx`, components |
| 17 | Expand DESIGN_SPEC.md (currently only 84 lines) | Onboarding clarity | Low (1h) | `context/DESIGN_SPEC.md` |
| 18 | Add Sentry or equivalent error tracking | Catch production errors | Medium (2h) | `backend/app/main.py`, `frontend/` |
| 19 | Implement outcome check scheduler | Phase 7 — check if interventions had impact after 14 days | High (8h) | New service |
| 20 | Replace `test_dummy.py` with real test | Better test hygiene | Low (10m) | `backend/tests/unit/test_dummy.py` |

---

## 3. Prioritized Checklist (for coding agents)

### Priority 1 — Demo blockers (do these first)

- [ ] **Wire Coordinator/Governor/Executor into conversational agent** (`backend/app/agents/conversational.py:134-142`)
  - Import `create_coordinator_agent`, `create_governor_agent`, `create_executor_agent` core logic
  - After Signal Engine + Product Brain complete, invoke Coordinator with bet_snapshot + risk signals
  - Pass intervention proposal to Governor for 8 policy checks
  - If Governor approves, set `pipeline_status` to `awaiting_founder_approval`
  - If Governor denies, set `pipeline_status` to `denied` with reason
  - Persist intervention to AlloyDB via `save_intervention()` from `db/repository.py`
  - This is the **single biggest gap** — everything else works once this is wired

- [ ] **Remove or gate mock intervention cards in Mission Control** (`frontend/app/workspace/mission-control/page.tsx`)
  - Currently shows 2 hardcoded cards: "Governor Halt: Auth Refactor" and "Rollout Threshold Alert"
  - Either remove them or wrap in `process.env.NEXT_PUBLIC_DEMO_MODE === 'true'`

- [ ] **Replace static Execution Health chart data** (`frontend/app/workspace/mission-control/page.tsx`)
  - Replace `CHART_BARS` constant with real data from `/interventions` or `/bets`
  - Or show "Connect database to see execution health" placeholder

### Priority 2 — Production blockers

- [ ] **Add authentication to REST endpoints** (`backend/app/main.py`)
  - At minimum: API key header validation for mutation endpoints (approve, reject, create bet)
  - Consider: Firebase Auth or Auth0 for user-level auth

- [ ] **Enforce CORS in production** — already has warning, needs documentation in deployment guide

- [ ] **Swap InMemoryArtifactService to GCS** (`backend/app/agent.py:126`, `backend/app/main.py:43`)

- [ ] **Wire `adjust_autonomy()` to AlloyDB** (`backend/app/agents/conversational.py`)

- [ ] **Add rate limiting** (`backend/app/main.py`) — `slowapi` is a 15-line integration

- [ ] **Auto-apply Alembic migrations** — add `alembic upgrade head` to Docker entrypoint

### Priority 3 — Polish & hardening

- [ ] **Switch to local fonts** (`frontend/app/layout.tsx`) — download Public Sans + Space Grotesk
- [ ] **Add Playwright E2E tests** — at least: chat flow, approve intervention, reject intervention
- [ ] **Delete `agentic-ci.yml`** — confirmed superseded by tier-1 + tier-2
- [ ] **Add JSON structured logging** for Cloud Run
- [ ] **Add test coverage reporting** to Tier 1 CI
- [ ] **Fix eval trace 04** — handle missing `risk_signal_draft` in Coordinator
- [ ] **Implement Jules L3 approval modal rendering** — portal from useJulesPlanApproval into workspace

---

## 4. What Was Verified

| Check | Result |
|-------|--------|
| Backend imports cleanly without GCP creds | ✅ (try/except DefaultCredentialsError guard) |
| All 122 unit tests pass | ✅ |
| Backend lint (codespell + ruff + ty) passes | ✅ |
| Frontend lint (ESLint) passes | ✅ |
| Frontend TypeScript compiles (`tsc --noEmit`) | ✅ (in CI) |
| 14 REST endpoints are implemented (not stubs) | ✅ |
| AG-UI SSE stream endpoint exists and is mountable | ✅ |
| CopilotKit bridge correctly wired to backend | ✅ |
| Session persistence survives restarts (SQLite) | ✅ |
| DB graceful fallback (all operations no-op without DB) | ✅ |
| No secrets in source code | ✅ |
| Docker images build with non-root user | ✅ |
| CI runs in ~2min (Tier 1) | ✅ |

## 5. What Was Fixed (this PR)

| Fix | File | Impact |
|-----|------|--------|
| `get_intervention_history` queries AlloyDB instead of returning mock data | `backend/app/agents/conversational.py` | Intervention history tool now works with real DB |
| Added `list_interventions()` repository function | `backend/db/repository.py` | Database query for conversational agent |
| Wired `useJulesPlanApproval` hook into workspace layout | `frontend/app/workspace/layout.tsx` | Jules L3 approval CopilotKit action now registered |
| CopilotKit `showDevConsole` respects `NODE_ENV` | `frontend/components/layout/Providers.tsx` | No dev console in production builds |
| Added `placebo_productivity` to `explain_risk_type` | `backend/app/agents/conversational.py` | All 4 canonical risk types now explainable |
| Updated TROUBLESHOOTING.md test count to 122 | `TROUBLESHOOTING.md` | Accurate documentation |
| Docker-compose setup instructions + session DB default | `docker-compose.yml` | Clearer onboarding for Docker users |
| Sanitized debug endpoint error output | `backend/app/main.py` | No stack trace leakage |
| Added CORS wildcard warning | `backend/app/main.py` | Alerts on misconfiguration |

## 6. What Remains (Biggest Risks to Shipping)

### Risk 1: Pipeline stages 2-4 are not exercised from the UI (CRITICAL)
The entire Coordinator → Governor → Executor flow exists and is tested via `aegis_pipeline` (SequentialAgent for evals), but the conversational agent's `run_pipeline_scan()` tool only runs Signal Engine then emits synthetic "analyzing" events for stages 2-4. **This means the demo shows fake progress — the risk classification, intervention recommendation, policy checks, and execution never actually happen from the main user interface.**

### Risk 2: No authentication
All REST endpoints (approve/reject interventions, create bets, list sessions) are completely unauthenticated. Acceptable for local dev but a blocker for any shared deployment.

### Risk 3: Frontend assumes database exists for most features
Without AlloyDB, the Inbox shows empty, bets list is empty, and intervention history is empty. The only path that works end-to-end without a database is the chat interface.

---

## 7. Final Verdict

### **Runnable but not demo-ready**

**Justification:**
- The system **is locally runnable** — backend starts, frontend connects, chat works, Signal Engine computes real metrics from Linear (or mock data).
- The system **is NOT demo-ready** because the core value proposition (5-stage pipeline producing an intervention for the founder to approve) only works end-to-end via the ADK playground, not from the user-facing chat interface. The UI shows synthetic "complete" states for Coordinator through Executor.
- The system **is NOT production-ready** due to missing authentication, rate limiting, and the critical pipeline gap.

**To reach demo-ready:** Fix item #1 (wire stages 2-4 into conversational agent). This is a medium-effort task (2-4 hours) that unlocks the entire pipeline for live demos.

**To reach production-ready:** Fix items #1, #5-12 (authentication, CORS enforcement, rate limiting, artifact persistence, structured logging, migrations). Estimated 2-3 days of focused work.
