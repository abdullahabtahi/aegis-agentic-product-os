# Aegis Agentic Product OS — Project Progress Report

**Phase:** Research ✅ → Concept ✅ → Schema designed ✅ → **Scaffold in progress 🚧**
**Repo:** https://github.com/abdullahabtahi/aegis-agentic-product-os

---

## What Is Built (and Solid)

### ✅ Concept & Problem Framing

The problem is well-defined and non-obvious: founders misdiagnose **execution slippage as a delivery problem** when it's actually a strategy or alignment failure. The three risk-type taxonomy (`strategy_unclear`, `alignment_issue`, `execution_issue`) is the product's core intellectual property — it prevents the classic mistake of throwing execution tooling at strategy problems.

**Strength:** The persona (high-agency founders, 1–20 teams) is specific enough to design against. Product principles explicitly call out psychological design rules (reframe risk as lost upside, one intervention per signal, pilot-with-instruments framing).

---

### ✅ Data Schema (`context/data-schema.ts`)

The TypeScript schema is the source of truth for all entities.

| Entity | Purpose | Strength |
|--------|---------|---------|
| `Bet` | First-class object the system reasons over | Includes `declaration_confidence` score — visible to founders |
| `LinearSignals` | Execution health metrics | `bet_coverage_pct` and `chronic_rollover_count` are the key telemetry |
| `RiskSignal` | Output of detection cycle | `confidence` field always visible — no hiding uncertainty |
| `Intervention` | Bounded proposed action | `proposed_linear_action` limited to `LinearAction` interface only |
| `HeuristicVersion` | AutoResearch layer | Includes `min_confidence_to_surface`, `intervention_rate_cap_days`, `placebo_productivity_threshold` |
| `AgentTrace` | Eval & governance layer | Feeds AutoResearch loop and Agent Evolution Log |

**Schema additions (latest):**
- `min_confidence_to_surface` (default: 0.65) — Governor floor to prevent noise
- `intervention_rate_cap_days` (default: 7) — Anti-fatigue mechanism per bet
- `placebo_productivity_threshold` (default: 0.7) — Flags high-volume work that doesn't map to bets

---

### ✅ Agent Architecture (`context/agent-architecture.md`)

Three-agent design with clear boundaries:

```
Execution Agent (gemini-3-flash) → LinearSignals
Product Brain Agent (gemini-3-pro) → RiskType + Evidence + Copy
Coordinator Agent (gemini-3-pro) → RiskSignal + Intervention + LinearAction proposal
```

**Strong design decisions:**
- Agents receive **structured context objects** (never raw conversation history)
- Pydantic validation gate on all LLM outputs before downstream use — validation failure is a silent skip, not a crash
- Governor layer added to rate-limit interventions and enforce confidence floors
- Error handling table defined: Policy denied → `PolicyDeniedEvent` (silent), Jules failure → toast only

---

### ✅ Tech Stack Defined (`context/tech-stack.md`)

| Layer | Technology |
|-------|-----------|
| Agent framework | Google ADK |
| LLMs | Gemini 3 Flash (speed) + Pro (reasoning) |
| Backend | FastAPI + Cloud Run |
| Frontend | React + CopilotKit + AG-UI + React Flow |
| Storage | AlloyDB + pgvector + Vertex Memory Bank |
| Linear integration | Linear MCP |
| Continuous AI | Jules CLI (`v0.1.42`) ✅ installed |

---

### ✅ Jules Integrated as "Insight Partner"

Jules CLI installed (`v0.1.42`). Role is locked down correctly for this phase:
- **No autonomous code changes** — all sessions require `remote pull` + founder approval
- Used for: quality checks, architecture flaw detection, CI/CD, and eventually scaffolding boilerplate
- `requirePlanApproval: true` defined in tech-stack as a hard constraint for Jules API calls

---

## What Is Not Built Yet

| Component | Status | Risk |
|-----------|--------|------|
| Backend (`backend/`) | ❌ No code yet | None — schema-first is correct |
| Pydantic models (`schema.py`) | ❌ No code yet | Low — direct mirror of TS schema |
| ADK agents (3 agents) | ❌ No code yet | Medium — most complex part |
| FastAPI routes | ❌ No code yet | Low — straightforward |
| Frontend (`frontend/`) | ❌ No code yet | Medium — AG-UI + CopilotKit is non-trivial |
| AlloyDB setup | ❌ No infra yet | Medium — needs GCP project |
| ADK evals / golden traces | ❌ Not started | **High** — don't skip this |
| AutoResearch loop | ❌ Stub only for hackathon | Low — acknowledged deferral |

---

## What's at Risk

### 🔴 Risk 1: No Evals Defined Yet
Success metrics are defined (`risk precision >70%`, `intervention acceptance >50%`) but there are no golden traces, no eval rubric, and no LLM-as-judge setup yet. The AutoResearch loop depends entirely on having `AgentTrace` data.

**Recommendation:** Before writing a single ADK agent, write **3–5 golden trace examples** by hand. One trace per risk type. This is the fastest way to catch prompt/schema gaps before they become bugs.

### 🟡 Risk 2: Product Brain Agent Is Complexity-Heavy
The Product Brain Agent must: hold Lenny heuristics + Tigers/Elephants framing AND write founder-facing copy in a specific tone while citing specific `ProductHeuristic` IDs. That's 3 jobs in one LLM call.

**Recommendation:** Split into **two prompt calls** inside Product Brain: (1) Classify risk type + select heuristics, (2) Write founder copy. Apply `after_model_callback` to validate copy tone separately.

### 🟡 Risk 3: Linear MCP Bounded Writes Need a Test Harness
No sandbox or mock exists yet. If a founder approves an intervention during demo and the Linear write fails silently, trust is destroyed.

**Recommendation:** Build a `MockLinearMCP` first that logs to console and validates the `LinearAction` shape. Use this for all dev/demo. Real MCP only in prod.

---

## Recommended Next Steps

```
Priority 1 — Pre-Scaffold (Do First):
  → Write 3-5 golden trace examples (JSON) by hand — one per risk type
  → These become eval dataset AND few-shot examples for agents

Priority 2 — Scaffold:
  → jules remote new: "Generate backend/models/schema.py from context/data-schema.ts as Pydantic V2"
  → Scaffold FastAPI routes (GET /workspaces, GET /bets, POST /scan)
  → Scaffold frontend with CopilotKit + AG-UI shell

Priority 3 — Build:
  → Execution Agent: LinearSignals computation (most testable, start here)
  → MockLinearMCP harness
  → Product Brain Agent (split into 2 calls)
  → Coordinator Agent + Governor

Priority 4 — Eval:
  → adk eval on golden traces
  → LLM-as-judge for copy tone validation
  → A/B between HeuristicVersion candidates
```

---

## Overall Assessment

This is a well-architected project. The schema design, agent boundaries, governance story (Agent Evolution Log), and product principles are significantly more rigorous than typical hackathon entries. The "pilots with instruments, not passengers on autopilot" framing is a genuine product differentiator.

**The gap is purely execution.** The next 24-48 hours need to go from schema → working Execution Agent → first real `RiskSignal` in the UI. That's the demo-able moment.
