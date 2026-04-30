# Roadmap — Aegis Fix Specs (April 2026 Refinement Stage)

**Ratified:** April 2026  
**Rule:** No new feature specs open until all 5 fix specs are closed.

---

## Phase R — Refinement (current)

All items below are derived from the April 2026 comprehensive audit (3-agent parallel review: frontend, backend, security/integration).

| # | Spec | Priority | Status | Done-When |
|---|---|---|---|---|
| 001 | Security Hardening | CRITICAL | ✅ Closed | Auth on all write endpoints; CORS explicit; keys rotated; debug routes gated; rate limit on expensive endpoints |
| 002 | Pipeline State Fixes | CRITICAL | ✅ Closed | Approval UI renders on Governor halt; AG-UI deltas update stages in real time; pipeline failure returns error state, not silent success |
| 003 | Data Integrity | HIGH | ✅ Closed | bet_id filter works; approve/reject 404s on phantom IDs; control_level saves correctly; all pages use same workspace ID |
| 004 | UI Layout & Stubs | HIGH | ✅ Closed | Activity log renders timeline; no double sidebar on any page; chart shows real data or explicit empty state |
| 005 | Code Quality | MEDIUM | ✅ Closed | Dead code removed; constants deduplicated; stubs raise NotImplementedError; lint and type-check pass clean |

**Completion gate:** When all 5 specs are closed, `make eval-all` passes ≥ 0.8, and the app is deployed to Cloud Run with a public URL.

> **Status (April 29, 2026):** All 5 specs closed. Evals 5/5 PASS. Phase R complete — Phase F now unblocked.

---

## Phase F — New Features (Phase R now complete)

Phase R (specs 001–005) closed April 29, 2026. All 5 fix specs shipped. 134/134 unit tests passing. Frontend build clean. ADK evals 5/5 PASS.

| # | Spec | Priority | Status | Done-When |
|---|---|---|---|---|
| 006 | [UX Agentic Hardening](../features/006-ux-agentic-hardening/) | HIGH | Open | Sidebar has Inbox+Activity; home hero shows live stats; scan CTA on direction detail; health score derived from real risk state |
| 007 | Deployment Hardening | HIGH | Not specced | Cloud Run, GCP Secret Manager, migrations on deploy, Cloud SQL proxy |
| 008 | Eval Hardening | MEDIUM | Not specced | HeuristicVersion canary rollout (offline replay + manual promotion); EvalSynthesisJob |

---

## Audit Finding → Spec Traceability

| Audit ID | Finding | Spec |
|---|---|---|
| C1 | Live API keys in `.env` | 001 |
| C2 | No auth on any endpoint | 001 |
| C3 | CORS credentials + wildcard | 001 |
| C4 | ADK singleton agents | 002 |
| C5 | `write_action` implicit None return | 002 |
| C6 | `httpx.AsyncClient` leaked | 002 |
| H1 | `bet_id` filter ignored | 003 |
| H2 | `pipeline_status` mismatch | 002 |
| H3 | No rate limiting | 001 |
| H4 | Debug endpoints open | 001 |
| H5 | No security headers | 001 |
| H6 | `BACKEND_URL` fallback to localhost in prod | 004 |
| H7 | `pipeline_status` blocks approval UI | 002 |
| H8 | `applyStateDelta` silently drops updates | 002 |
| H9 | `bet_id` ignored in SQL | 003 |
| H10 | Triple workspace ID source | 003 |
| H11 | `_run_sub_pipeline` returns `{}` on failure | 002 |
| H12 | `update_workspace_control_level` INSERT fails | 003 |
| H13 | `update_intervention_status` returns 200 for phantom IDs | 003 |
| H14 | Double layout nesting | 004 |
| H15 | Activity log is a stub | 004 |
| M1 | `WorkspaceMeta.control_level: string` not `ControlLevel` | 005 |
| M2 | No `enabled` guard on workspace queries | 003 |
| M3 | BetDeclarationModal no resetForm on early return | 004 |
| M4 | `console.error` leaks infra details in prod | 004 |
| M5 | Chart 12 bars / 7 labels | 004 |
| M6 | `inmemory_bets.append()` mutation | 003 |
| M2 | No `enabled` guard on workspace queries | 003 |
| M3 | BetDeclarationModal no `resetForm` on early return | 004 |
| M11 | `workspace_id` missing from interventions SELECT | 003 |
| M12 | `RiskSignalCard` duplicates constants | 005 |
| L1–L7 | Dead code, stubs, type gaps | 005 |
| E2E-01 | Governor `denial_reason`/`details` not surfaced in UI | 002 |
| E2E-02 | Executor external tool calls lack per-call error boundaries | 002 |
| E2E-03 | Coordinator recommends Jules for workspaces without `github_repo` (wasted pipeline run) | 005 |
