# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Aegis — Agentic Product OS

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

## Commands

All commands run from `backend/`:

```bash
cd backend
make install           # Install deps via uv (auto-installs uv if missing)
make playground        # ADK web playground at localhost:8501 (auto-reloads)
make test              # Unit + integration tests (pytest)
make eval              # Single evalset (default: trace_01_strategy_unclear)
make eval EVALSET=tests/eval/evalsets/trace_03_execution_issue.evalset.json  # Specific evalset
make eval-all          # All 5 golden traces
make lint              # codespell + ruff check + ruff format + ty check
```

Run a single test file: `cd backend && uv run pytest tests/unit/test_signal_engine.py -v`
Run Python scripts: `cd backend && uv run python script.py`

Environment: copy `backend/.env.example` → `backend/.env`. Required: `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`. Optional: `LINEAR_API_KEY` (enables real Linear reads), `AEGIS_MOCK_LINEAR` (forces mock).

---

## What This Is

Continuous Pre-mortem / Risk Radar: watches Linear for strategy-execution misalignment and surfaces risk signals with bounded corrective actions to founders for approval. Target: "fire investigator not smoke detector" — episodic + outcome-based reasoning, not threshold matching.

---

## Current Build State

```
Research ✅ → Concept ✅ → Schema v3.0 ✅ → Architecture v2.0 ✅ → Phase 1 ✅ → Phase 2 ✅ → Eval 🚧 → Deploy
```

**Phase 2 complete — gate: `make eval-all` with rubric_based tone + classification ≥ 0.8**
- `product_brain.py`: debate pipeline — `cynic_agent` (flash) → `optimist_agent` (flash) → `synthesis_agent` (pro)
- Hypothesis staleness penalty: `time_horizon` expiry + `hypothesis_staleness_days > 30` → `+0.10` confidence boost to `strategy_unclear`
- `governor.py`: approved path sets `pipeline_status = "awaiting_founder_approval"` + `awaiting_approval_intervention` for CopilotKit (Jules #3)
- `backend/skills/`: `risk-classifier/SKILL.md` · `strategy-heuristics/SKILL.md` · `intervention-ranker/SKILL.md`
- `RejectionReasonCluster` NLP deferred permanently — categorical `denial_reason` enum only (Jules #2)

**Phase 1 complete — Linear MCP wired:**
- `backend/tools/linear_tools.py`: `MockLinearMCP` + `RealLinearMCP` (httpx → Linear GraphQL) + `get_linear_mcp()` factory
- `backend/.env.example`: `LINEAR_API_KEY`, `AEGIS_MOCK_LINEAR`, `GOOGLE_CLOUD_PROJECT/LOCATION`, `ALLOYDB_URL`
- `SignalEngineAgent._linear_mcp = get_linear_mcp()` — live scan when `LINEAR_API_KEY` set; eval-safe otherwise
- **Lenny MCP** (`https://lenny-mcp.onrender.com/mcp`): 284 podcast episodes — wired as Phase 2 `StartupFailurePattern` source for Product Brain. Add via: `claude mcp add -t http -s user lenny-transcripts https://lenny-mcp.onrender.com/mcp`

**Phase 1 complete (gate pending `adk eval` confirmation):**
- MockLinearMCP + 3 fixtures (healthy · messy · cross-team)
- 5 golden traces in `backend/tests/eval/evalsets/` (strategy_unclear, alignment_issue, execution_issue, low_confidence, acknowledged_risk)
- Pydantic models: `schema.py`, `contexts.py`, `responses.py`
- AlloyDB Alembic migration: 13 tables (`01_initial_schema.py`)
- Signal Engine TDD: 15/15 green
- Pipeline: `SequentialAgent(sub_agents=[signal_engine, product_brain, coordinator, governor])`
- **Gate:** run `make eval-all` — all 5 traces must score `tool_trajectory_avg_score > 0.8`

---

## Locked Architectural Decisions (do NOT re-derive or re-debate)

| Decision | What was settled | Why |
|----------|-----------------|-----|
| Signal Engine is deterministic | Python service, not LLM | Eliminates hallucination in metrics computation |
| Strictly sequential pipeline | No parallel agents | Product Brain requires Signal Engine output; parallelism was architecturally invalid |
| Signal Engine reads bounded | Always 14-day window | Prevents unbounded Linear API reads |
| Governor has 8 policy checks | confidence_floor · duplicate_suppression · rate_cap · jules_gate · reversibility · acknowledged_risk · control_level · escalation_ladder | control_level = 7th (workspace autonomy gradient); escalation_ladder = 8th (Coordinator recommends, Governor enforces) |
| HITL control levels: L1/L2/L3 | `ControlLevel` enum on `Workspace` | Founders start on L1 (draft only) and graduate — prevents both fatigue and trust failure |
| AutoResearch = offline replay | Not live A/B testing | Safer; manual promotion required for MAJOR versions |
| Product Brain debate pattern | Flash(Cynic) + Flash(Optimist) + Pro(synthesis) | Quality uplift; prompt cache on shared `bet_context` offsets Flash cost |
| Governor prompts immutable | AutoResearch tunes HeuristicVersion only | Keeps Governor guarantees stable; product_brain classification_prompt_fragment may evolve via MAJOR |
| AlloyDB = source of truth | Graphiti = temporal index (Phase 4) | If Graphiti dies, AlloyDB has everything; Graphiti is a derivable index |
| VertexAiMemoryBankService not used | `VertexAiMemoryBankService` exists in ADK v1.x but we chose AlloyDB+pgvector for Phases 1–3 + Graphiti for Phase 4 | Flat cosine-sim cannot answer "3rd recurrence" or bi-temporal queries; AlloyDB is source of truth |
| 4-layer memory model | ADK Session / Graphiti KG / AlloyDB+pgvector / HeuristicVersion | Each layer has distinct TTL and query type; no overlap |
| Between-cycle action caching | Webhook-based invalidation on BetSnapshot | 60-70% of scans can skip full recompute if Linear state unchanged |
| LinearSignals within-cycle caching | SKIP | Sequential pipeline already prevents duplicate reads in same cycle |
| InMemoryArtifactService Phase 1 | GcsArtifactService Phase 4+ | One line to upgrade; no lock-in |
| MockLinearMCP before agent code | Required for safe evals | Trust in evals requires isolated data |
| Phase 2 Linear upgrade path | ADK native `McpToolset(StreamableHTTPConnectionParams(url="https://mcp.linear.app/mcp", headers={"Authorization": f"Bearer {LINEAR_API_KEY}"}))` — 24 tools incl. `list_issues`, `list_projects`, `list_cycles`, `create_comment` | No custom MCP needed; one-line swap from MockLinearMCP |
| ADK SkillToolset for Product Brain | L1/L2/L3 progressive skill loading | ~70% token reduction on heuristic injection |
| Versioned Constitution | `version_type: MAJOR\|MINOR\|PATCH` + `requires_manual_review` | MAJOR changes never auto-promoted by AutoResearch |
| HeuristicVersion canary rollout | `is_canary` + `canary_metrics` (Phase 7) | Offline replay comparison; auto-revert on false-positive spike |
| Golden traces Phase 1 | JSON `.evalset.json` in git (not YAML, not ADK artifacts) | `adk eval` requires JSON; simpler and reviewable; migrate to artifacts in Phase 4 |
| Pipeline composition | ADK `SequentialAgent` wrapping SignalEngineAgent + ProductBrainAgent + CoordinatorAgent + GovernorAgent | Native ADK event tracing, `output_key` propagation, eval compatibility — manual wiring loses all of these |
| Signal Engine ADK type | `BaseAgent` subclass (`_run_async_impl`) — deterministic, no LLM | Must participate in ADK event loop for AgentTrace capture + eval compatibility; standalone Python service would be invisible to `adk eval` |
| Governor ADK type | `CustomAgent` (BaseAgent subclass) in SequentialAgent — NOT `before_tool_callback` | Governor decisions need their own `AgentTrace` for AutoResearch to detect over-triggering. `before_tool_callback` is lighter but loses traceability. |
| Escalation ladder enforcement | Governor check #8 (deterministic), NOT Coordinator (LLM) | LLMs cannot reliably enforce hard policy — Coordinator recommends, Governor enforces. Coordinator still reasons about escalation level as a hint. |
| `input_context_hash` computation | `sha256(json.dumps({"bet_id", "signals" (exclude read_window_days), "heuristic_version_id"}, sort_keys=True))` — excludes all timestamps | Including any timestamp makes every trace unique, breaking AutoResearch grouping by input |
| First monitoring scan | Runs immediately on bet confirmation; subsequent scans weekly cron | Eliminates 0-7 day onboarding gap; founder sees risk signals within minutes, not a week |
| `risk_type_hypothesis` removed | `ProductBrainAgentContext` uses `prior_risk_types: RiskType[]` (historical, labeled as past) instead | Pre-classification by Signal Engine would anchor LLM reasoning via confirmation bias; Product Brain must classify independently |
| `CoordinatorAgentContext.bet` narrowed | `Pick<Bet, "id" \| "name" \| "status" \| "hypothesis" \| "success_metrics" \| "time_horizon" \| "acknowledged_risks">` — not full Bet | `linear_issue_ids` (potentially hundreds), `doc_refs`, `declaration_source` irrelevant to intervention selection; context minimization |
| Blast radius computation | Derived from `BetSnapshot.linear_signals.total_issues_analyzed` — no fresh Linear API call | Signal Engine already bounded reads to 14 days; blast radius must not make a new unbounded API call |
| `classification_rationale` on AgentTrace | Phase 3 field addition | Enables post-hoc debugging + RejectionReasonCluster NLP extraction |
| HypothesisExperiment table | Phase 2 | Enables staleness detection; `Bet.hypothesis` as string alone is insufficient |
| StartupFailurePattern corpus | IdeaProof ingest Phase 2 | Very low effort, immediate signal enrichment for Product Brain |
| BetOutcomeRecord | Phase 3, opt-in, workspace_hash only | Cross-workspace learning with privacy; SHA256 hash, never reversible |
| RejectionReasonCluster | Phase 2 NLP extraction | Closes the AutoResearch feedback loop — learns new failure modes, not just threshold tuning |
| Tree-of-Thought / LATS / MCTS | SKIP | Overkill for ticket classification; hurts latency and cost |
| Skill factory (agent writes SKILL.md) | SKIP | Overengineering |
| SSE streaming for AutoResearch | SKIP | Not needed Phase 1-4 |
| PDF weekly digest | SKIP | Feature, not infrastructure |
| GitHub MCP | Phase 6 (leading indicators only) | PR velocity, review lag as Signal Engine inputs — not Phase 1-3 |

---

## Pipeline Architecture (how agents connect)

Entry point: `backend/app/agent.py` → `SequentialAgent("aegis_pipeline")` wraps 5 sub-agents.
Each agent reads from `ctx.session.state` and writes its output back to state for the next stage.

```
Signal Engine (BaseAgent, deterministic)
  reads: session.state["bet"], ["workspace_id"]
  writes: "linear_signals", "bet_snapshot"
    ↓
Product Brain (SequentialAgent, LLM debate)
  sub-agents: cynic_agent (flash) → optimist_agent (flash) → synthesis_agent (pro)
  reads: "bet_snapshot", "linear_signals"
  writes: "risk_signal_draft"
    ↓
Coordinator (LlmAgent)
  reads: "risk_signal_draft", bet context
  writes: "intervention_proposal"
    ↓
Governor (BaseAgent, deterministic — 8 policy checks)
  reads: "intervention_proposal", "risk_signal_draft", workspace config
  writes: "governor_decision", "pipeline_status"
    ↓
Executor (BaseAgent, deterministic)
  reads: "governor_decision" (only runs if approved + founder accepted)
  writes: "executor_result", "pipeline_status"
```

Two-invocation model: Pipeline halts at Governor → `awaiting_founder_approval`. External call to `approve_intervention()` / `reject_intervention()` (in `approval_handler.py`) transitions state. Re-run pipeline → prior agents skip via checkpoint → Executor runs.

Override & Teach (`override_teach.py`): If same `(risk_type, action_type, rejection_reason)` rejected 2x in 30 days, Governor auto-suppresses that pattern.

---

## Always Read First (before any code)

- `context/data-schema.ts` — source of truth for all entities and field names.
- `context/agent-architecture.md` — v2.0 sequential pipeline spec. Read before touching any agent boundary.

---

## Load on Demand (do NOT auto-load)

| Task | Read |
|------|------|
| Frontend (AG-UI, CopilotKit, React Flow) | `context/frontend-integration.md` + grep `../../ag-ui-docs.txt` |
| Backend / ADK agent code | `context/agent-architecture.md` + `/adk-cheatsheet` skill |
| ADK Artifacts API (Phase 4) | `internal/AG_Agent/ADK_ARTIFACTS_PLAN.md` §Use Cases 1+5 only |
| ADK SkillToolset pattern | `internal/AG_Agent/INTEGRATION_PLAN.md` §Priority 1 |
| Debate pattern implementation | `internal/AG_Agent/INTEGRATION_PLAN.md` §Opponent Processor |
| Data strategy + memory layers | `internal/AG_Agent/aegis-audit-summary.md` (token-optimized) |
| AutoResearch loop (Phase 4) | `internal/AG_Agent/aegis-audit-summary.md` §Phase 4 |
| Product decisions / UX copy | `context/product-principles.md` |
| Full product spec | `context/DESIGN_SPEC.md` |
| Storage / AlloyDB / Vertex Memory | `context/tech-stack.md` §Storage |
| Eval methodology | `/adk-eval-guide` skill |
| Scaffold commands | `/adk-scaffold` skill |

---

## Folder Structure

```
aegis-agentic-product-os/
├── CLAUDE.md                        ← you are here
├── context/                         ← brain (read before coding)
│   ├── DESIGN_SPEC.md
│   ├── data-schema.ts               ← schema v3.0 source of truth
│   ├── agent-architecture.md        ← v2.0 sequential pipeline
│   ├── tech-stack.md
│   ├── frontend-integration.md
│   └── product-principles.md
├── internal/AG_Agent/               ← agent research (load on demand)
│   ├── INTEGRATION_PLAN.md          ← SkillToolset + debate patterns
│   ├── ADK_ARTIFACTS_PLAN.md        ← artifact use cases 1+5
│   └── aegis-audit-summary.md       ← data strategy audit (token-optimized)
├── backend/                         ← scaffold target (Phase 1)
│   ├── app/                         ← ADK agent entry point
│   ├── tools/
│   │   └── linear_tools.py          ← MockLinearMCP stub (build first)
│   ├── skills/                      ← ADK SkillToolset (L1/L2/L3)
│   ├── models/                      ← Pydantic models mirroring data-schema.ts
│   └── tests/eval/evalsets/         ← 5 golden traces (Phase 1, .evalset.json)
└── frontend/                        ← scaffold after Phase 2
```

---

## Phase Roadmap

| Phase | Focus | Gate to advance |
|-------|-------|-----------------|
| **1** | Foundation: MockLinearMCP · Pydantic models · 5 golden traces · AlloyDB schema · Signal Engine TDD | 5 golden traces pass `adk eval` with `tool_trajectory_avg_score > 0.8` |
| **2** | Product Brain Agent · ADK SkillToolset (L1/L2/L3) · HypothesisExperiment table · StartupFailurePattern ingest · RejectionReasonCluster NLP · between-cycle action caching | Eval ≥ 0.8 on tone + classification |
| **3** | Coordinator · Governor (7 checks incl. `control_level`) · Escalation Ladder · Blast Radius Preview · Product Brain debate (Cynic+Optimist+Synthesis) · `classification_rationale` field · semantic pre-filter on strategy docs | E2E dry-run passes on all 5 golden traces |
| **4** | Executor · Override & Teach · AutoResearch loop · HeuristicVersion artifacts · Graphiti temporal KG · `MemorySynthesisJob` · `WorkspaceFact` nodes · SkillLibrary decomposition into per-risk-type DetectionSkills | Founder approval flow works end-to-end |
| **5** | Frontend: AG-UI · Intervention Inbox · Suppression Log · `control_level` settings UI · HITL L1/L2/L3 toggle | Demo-ready UI |
| **6** | Replay/Simulation Mode · Day 1 Health Report · Bet Declaration flow · Subject Hygiene for Jules (`build_jules_subject`) · BetOutcomeRecord corpus (opt-in) | Bet declaration flow complete |
| **7** | HeuristicVersion canary rollout · `EvalSynthesisJob` · Deployment + eval hardening | All risk types pass eval threshold |

---

## ADK Gotchas

- **Model 404 errors**: Fix `GOOGLE_CLOUD_LOCATION` (set to `global`, not `us-central1`). Don't change the model name.
- **ADK tool imports**: Import the tool instance, not the module: `from google.adk.tools.load_web_page import load_web_page`
- **Agent parent-check errors**: ADK agents can only have one parent. Use factory functions (`create_*_agent()`) that return fresh instances — never reuse agent objects across tests or eval runs.
- **Eval format**: `adk eval` requires `.evalset.json` (JSON, not YAML). Evalsets live in `backend/tests/eval/evalsets/`.

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
