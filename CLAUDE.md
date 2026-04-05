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
- **Governor = 7 policy checks.** confidence_floor · duplicate_suppression · rate_cap · jules_gate · reversibility · acknowledged_risk · control_level.
- **Product Brain prompts** may evolve via HeuristicVersion (MAJOR + manual review). **Governor policy prompts are immutable.**

---

## What This Is

Continuous Pre-mortem / Risk Radar: watches Linear for strategy-execution misalignment and surfaces risk signals with bounded corrective actions to founders for approval. Target: "fire investigator not smoke detector" — episodic + outcome-based reasoning, not threshold matching.

---

## Current Build State

```
Research ✅ → Concept ✅ → Schema v3.0 ✅ → Architecture v2.0 ✅ → Scaffold 🚧 → Build → Eval → Deploy
```

**Immediate next: Phase 1 — Foundation**
1. Wire `InMemoryArtifactService` into runner config (one line, preps Phase 4)
2. Build `MockLinearMCP` stub (`backend/tools/linear_tools.py`) — gate before any agent code
3. Write 5 golden traces as YAML in `backend/evals/traces/`
4. Write Pydantic models mirroring schema (`backend/models/schema.py`, `contexts.py`, `responses.py`)
5. AlloyDB + Alembic `01_initial_schema.py` (13 tables including Phase 2 new tables)
6. Signal Engine TDD: `async def compute_signals(workspace_id, bet, monitoring_period_days=14) → BetSnapshot`

---

## Locked Architectural Decisions (do NOT re-derive or re-debate)

| Decision | What was settled | Why |
|----------|-----------------|-----|
| Signal Engine is deterministic | Python service, not LLM | Eliminates hallucination in metrics computation |
| Strictly sequential pipeline | No parallel agents | Product Brain requires Signal Engine output; parallelism was architecturally invalid |
| Signal Engine reads bounded | Always 14-day window | Prevents unbounded Linear API reads |
| Governor has 7 policy checks | Added `control_level` check (7th) | Workspace-configurable autonomy gradient needed for production trust |
| HITL control levels: L1/L2/L3 | `ControlLevel` enum on `Workspace` | Founders start on L1 (draft only) and graduate — prevents both fatigue and trust failure |
| AutoResearch = offline replay | Not live A/B testing | Safer; manual promotion required for MAJOR versions |
| Product Brain debate pattern | Flash(Cynic) + Flash(Optimist) + Pro(synthesis) | Quality uplift; prompt cache on shared `bet_context` offsets Flash cost |
| Governor prompts immutable | AutoResearch tunes HeuristicVersion only | Keeps Governor guarantees stable; product_brain classification_prompt_fragment may evolve via MAJOR |
| AlloyDB = source of truth | Graphiti = temporal index (Phase 4) | If Graphiti dies, AlloyDB has everything; Graphiti is a derivable index |
| Vertex Memory Bank → deprecated | Replaced by 4-layer memory model | Flat cosine-sim cannot answer "3rd recurrence" or bi-temporal queries |
| 4-layer memory model | ADK Session / Graphiti KG / AlloyDB+pgvector / HeuristicVersion | Each layer has distinct TTL and query type; no overlap |
| Between-cycle action caching | Webhook-based invalidation on BetSnapshot | 60-70% of scans can skip full recompute if Linear state unchanged |
| LinearSignals within-cycle caching | SKIP | Sequential pipeline already prevents duplicate reads in same cycle |
| InMemoryArtifactService Phase 1 | GcsArtifactService Phase 4+ | One line to upgrade; no lock-in |
| MockLinearMCP before agent code | Required for safe evals | Trust in evals requires isolated data |
| ADK SkillToolset for Product Brain | L1/L2/L3 progressive skill loading | ~70% token reduction on heuristic injection |
| Versioned Constitution | `version_type: MAJOR\|MINOR\|PATCH` + `requires_manual_review` | MAJOR changes never auto-promoted by AutoResearch |
| HeuristicVersion canary rollout | `is_canary` + `canary_metrics` (Phase 7) | Offline replay comparison; auto-revert on false-positive spike |
| Golden traces Phase 1 | YAML in git (not ADK artifacts) | Simpler, reviewable; migrate to artifacts in Phase 4 |
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
│   └── evals/traces/                ← golden traces YAML (5 by hand, Phase 1)
└── frontend/                        ← scaffold after Phase 2
```

---

## Phase Roadmap

| Phase | Focus | Gate to advance |
|-------|-------|-----------------|
| **1** | Foundation: MockLinearMCP · Pydantic models · 5 golden traces · AlloyDB schema · Signal Engine TDD | 5 golden traces pass eval |
| **2** | Product Brain Agent · ADK SkillToolset (L1/L2/L3) · HypothesisExperiment table · StartupFailurePattern ingest · RejectionReasonCluster NLP · between-cycle action caching | Eval ≥ 0.8 on tone + classification |
| **3** | Coordinator · Governor (7 checks incl. `control_level`) · Escalation Ladder · Blast Radius Preview · Product Brain debate (Cynic+Optimist+Synthesis) · `classification_rationale` field · semantic pre-filter on strategy docs | E2E dry-run passes on all 5 golden traces |
| **4** | Executor · Override & Teach · AutoResearch loop · HeuristicVersion artifacts · Graphiti temporal KG · `MemorySynthesisJob` · `WorkspaceFact` nodes · SkillLibrary decomposition into per-risk-type DetectionSkills | Founder approval flow works end-to-end |
| **5** | Frontend: AG-UI · Intervention Inbox · Suppression Log · `control_level` settings UI · HITL L1/L2/L3 toggle | Demo-ready UI |
| **6** | Replay/Simulation Mode · Day 1 Health Report · Bet Declaration flow · Subject Hygiene for Jules (`build_jules_subject`) · BetOutcomeRecord corpus (opt-in) | Bet declaration flow complete |
| **7** | HeuristicVersion canary rollout · `EvalSynthesisJob` · Deployment + eval hardening | All risk types pass eval threshold |

---

## End Constraints (position-aware reinforcement)

- Schema changes always go in `data-schema.ts` first.
- MockLinearMCP must exist before any agent code touches Linear.
- Never auto-promote a MAJOR `HeuristicVersion` — always `requires_manual_review: true`.
- Governor prompts are immutable — only HeuristicVersion numeric thresholds and `classification_prompt_fragment` may evolve.
- `control_level` on `Workspace` is checked as the 7th Governor policy check before every Executor call.
- Evals use `adk eval`, never pytest alone.
