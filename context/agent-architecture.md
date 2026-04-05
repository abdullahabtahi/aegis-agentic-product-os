# Agent Architecture

## System overview

Three ADK agents coordinated by the Coordinator. Execution Agent and Product Brain Agent
run in parallel; Coordinator synthesizes and acts.

```
┌─────────────────────────────────────────────────────────────────────┐
│  TRIGGER: weekly cron OR founder-initiated scan                     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
              ┌────────────────┴────────────────┐
              ▼                                 ▼
  ┌───────────────────┐             ┌─────────────────────────┐
  │  Execution Agent  │             │  Product Brain Agent    │
  │                   │             │                         │
  │  Tools:           │             │  Tools:                 │
  │  - Linear MCP     │             │  - Lenny MCP            │
  │  - AlloyDB read   │             │  - Vertex Memory Bank   │
  │                   │             │  - strategy doc reader  │
  │  Output:          │             │                         │
  │  LinearSignals    │             │  Output:                │
  │  per bet          │             │  risk_type_hypothesis   │
  │                   │             │  relevant_heuristics    │
  └────────┬──────────┘             └──────────┬──────────────┘
           │                                   │
           └──────────────┬────────────────────┘
                          ▼
             ┌─────────────────────────┐
             │   Coordinator Agent     │
             │                         │
             │  Receives:              │
             │  - LinearSignals        │
             │  - risk_type_hypothesis │
             │  - relevant_heuristics  │
             │  - prior_interventions  │
             │                         │
             │  Produces:              │
             │  - RiskSignal           │
             │  - Intervention         │
             │  - proposed LinearAction│
             └──────────┬──────────────┘
                        │
                        ▼
          ┌─────────────────────────────┐
          │  AG-UI / CopilotKit surface │
          │  Founder: Accept / Edit /   │
          │  Reject / Dismiss           │
          └──────────┬──────────────────┘
                     │ on Accept
                     ▼
          ┌─────────────────────────────┐
          │  Linear MCP write           │
          │  (bounded LinearAction only)│
          └─────────────────────────────┘
```

## Agent 1: Execution Agent

**Model:** `gemini-3-flash-preview` (high frequency, latency-sensitive)
**Trigger:** Once per monitoring cycle per bet
**Context in:** `ExecutionAgentContext` (see data-schema.ts)
**Output:** `LinearSignals` + preliminary `RiskType` hypothesis

**What it does:**
- Reads Linear projects + issues via Linear MCP
- Computes `LinearSignals` struct (coverage %, rollover counts, hypothesis presence, etc.)
- Compares against `BetHealthBaseline`
- Emits a preliminary `risk_type_hypothesis` for Product Brain to validate
- Logs `BetSnapshot` to AlloyDB

**What it does NOT do:**
- Classify risk type definitively (Product Brain does this)
- Read strategy docs or Lenny content
- Write to Linear

**Key tool calls:**
```python
linear_mcp.list_issues(project_id=bet.linear_project_ids)
linear_mcp.list_issues(label="bet:{bet_id}")
alloydb.read(BetSnapshot, filters={bet_id: ..., period: last_4_weeks})
```

## Agent 2: Product Brain Agent

**Model:** `gemini-3-pro-preview` (reasoning-heavy, runs once per bet per cycle)
**Context in:** `ProductBrainAgentContext` (see data-schema.ts)
**Output:** typed `RiskType`, `Evidence[]`, `headline`, `explanation`, `product_principle_refs`

**What it does:**
- Holds product strategy knowledge (Lenny MCP, Tigers/Elephants, PMF patterns)
- Retrieves relevant `ProductHeuristic[]` from Vertex Memory Bank semantically
- Validates Execution Agent's preliminary hypothesis
- Generates the founder-facing copy: headline + explanation
  - Framed as lost upside, NOT threat (see product-principles.md)
  - Cites specific product principles by ID
- Compares LinearSignals against strategy doc excerpts for `strategy_doc_mismatch` evidence

**What it does NOT do:**
- Read raw Linear data directly
- Write to Linear or AlloyDB
- Propose interventions (Coordinator does this)

**Context engineering note:**
Product heuristics are injected as explicit context objects, not vague hints.
Each `ProductHeuristic` has: principle, example_pattern, suggested_action, confidence_weight.
The active `HeuristicVersion.classification_prompt_fragment` is prepended to every run.

## Agent 3: Coordinator Agent

**Model:** `gemini-3-pro-preview`
**Context in:** `CoordinatorAgentContext` (see data-schema.ts)
**Output:** `RiskSignal` (persisted), `Intervention` (proposed, pending founder approval)

**What it does:**
- Synthesizes Execution + Product Brain outputs into a final `RiskSignal`
- Selects one `Intervention` (ranked by `intervention_ranking_weights` in active HeuristicVersion)
- Avoids repeating failed past interventions (reads `prior_interventions` with outcomes)
- Calibrates aggressiveness based on workspace acceptance/rejection history
- Writes `RiskSignal` + `Intervention` to AlloyDB
- Logs `AgentTrace` for AutoResearch

**What it does NOT do:**
- Execute Linear writes directly — only proposes `LinearAction`
- Surface more than one intervention per risk signal (reduces founder decision fatigue)

**On founder "Accept":**
```python
linear_mcp.execute(intervention.proposed_linear_action)
alloydb.update(Intervention, {status: "accepted", decided_at: now})
alloydb.schedule_outcome_check(bet_id, delay_days=14)
```

## AutoResearch loop (background, not user-facing)

Runs after N accepted/rejected interventions accumulate (target: N=20 before first tune).

```
1. Take active HeuristicVersion
2. Mutate one parameter (threshold, weight, or prompt fragment)
3. Run mutated version on last 30 AgentTraces (golden trace replay)
4. Score with LLM-as-judge against eval rubric
5. If score > active version → promote to "candidate" → A/B with 10% of workspaces
6. If A/B acceptance_rate > active → promote to "active"
7. Log change_summary to HeuristicVersion
8. Expose in UI as Agent Evolution Log entry
```

**For hackathon demo:** stub steps 2–6. Log real AgentTraces and accepted/rejected
interventions. Show one manually crafted evolution log entry to tell the story.

## Bet declaration flow (Detect / Draft / Confirm)

```python
# Step 1: Detect — cluster Linear projects into candidate bets
async def detect_bets(workspace: Workspace) -> list[BetCandidate]:
    issues = linear_mcp.list_issues(team_id=workspace.linear_team_id)
    projects = linear_mcp.list_projects(team_id=workspace.linear_team_id)
    # Cluster by semantic similarity + project grouping
    # Return with declaration_confidence scores
    # Low confidence (<0.6) → show raw candidates, ask founder to group

# Step 2: Draft — Product Brain structures each candidate into Bet schema
async def draft_bet(candidate: BetCandidate) -> Bet:
    # Uses ProductBrainAgent to fill: target_segment, problem_statement,
    # hypothesis, success_metrics, time_horizon
    # Sets status = "detecting"

# Step 3: Confirm — founder sees card, makes decision
# AG-UI surface: Confirm | Edit | Not a bet
# "Not a bet" → persists as BetRejection (labeled training data)
# "Confirm" → sets status = "active", starts monitoring
```

## ADK patterns to follow

- Use `InMemorySessionService` for local dev, `VertexAiSessionService` for prod
- Agent tools: prefer MCP tools over custom tools where available
- Use `before_agent_callback` to assemble and inject context objects
- Use `after_agent_callback` to persist AgentTrace
- Never pass raw conversation history to agents — pass structured context objects
- See `/adk-cheatsheet` skill for code patterns
