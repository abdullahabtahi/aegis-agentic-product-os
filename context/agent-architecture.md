# Agent Architecture

## System Overview

**Sequential pipeline** (not parallel). Each stage feeds the next.
Signal Engine runs first — deterministic, no LLM.
Product Brain Agent runs second — LLM interprets signals.
Coordinator Agent runs third — LLM selects intervention.
Governor runs fourth — deterministic safety + dedup gate.
Action Executor runs last — deterministic write, never improvises.

```
┌─────────────────────────────────────────────────────────────────┐
│  TRIGGER: weekly cron OR founder-initiated scan                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
            ┌───────────────────────────┐
            │  Signal Engine            │  ← DETERMINISTIC SERVICE
            │                           │
            │  Reads:                   │
            │  - Linear issues/projects │
            │  - Relations graph        │
            │  - AlloyDB snapshots      │
            │                           │
            │  Computes:                │
            │  LinearSignals per bet    │
            │  BetSnapshot → AlloyDB    │
            └──────────────┬────────────┘
                           │ LinearSignals (typed struct)
                           ▼
            ┌───────────────────────────┐
            │  Product Brain Agent      │  ← LLM AGENT (ADK)
            │                           │
            │  Retrieves:               │
            │  - ProductHeuristics      │
            │  - Strategy doc excerpts  │
            │                           │
            │  Produces:                │
            │  - RiskType + confidence  │
            │  - Evidence[]             │
            │  - Headline + explanation │
            └──────────────┬────────────┘
                           │ RiskSignal (typed)
                           ▼
            ┌───────────────────────────┐
            │  Coordinator Agent        │  ← LLM AGENT (ADK)
            │                           │
            │  Selects one Intervention │
            │  from explicit taxonomy   │
            │  Writes RiskSignal +      │
            │  Intervention → AlloyDB   │
            └──────────────┬────────────┘
                           │ proposed Intervention
                           ▼
            ┌───────────────────────────┐
            │  Governor / Policy Engine │  ← DETERMINISTIC SERVICE
            │                           │
            │  Checks:                  │
            │  - confidence threshold   │
            │  - duplicate suppression  │
            │  - intervention rate cap  │
            │  - approval requirements  │
            │                           │
            │  → Approve / PolicyDenied │
            └──────────────┬────────────┘
                           │ ApprovedIntervention
                           ▼
            ┌───────────────────────────┐
            │  AG-UI / CopilotKit       │
            │  Founder: Accept / Edit / │
            │  Reject / Dismiss         │
            └──────────────┬────────────┘
                           │ on Accept
                           ▼
            ┌───────────────────────────┐
            │  Action Executor          │  ← DETERMINISTIC SERVICE
            │  - Linear MCP write       │
            │    (bounded LinearAction) │
            │  - OR Jules API call      │
            │    (requirePlanApproval)  │
            └───────────────────────────┘
```

---

## Component 1: Signal Engine

**Type:** Deterministic Python service — NOT an LLM agent.
**Trigger:** Once per monitoring cycle per bet.
**Context in:** `ExecutionAgentContext` (see data-schema.ts)
**Output:** `LinearSignals` + `BetSnapshot` persisted to AlloyDB

**What it does:**
- Pulls Linear issues in `linear_project_ids` bounded to **last 14 days** only
- Counts status transitions, rollovers, blocked flags, re-opens in that window
- Traverses Linear `relations` graph (`blocked_by`, `blocks`, `related`) across teams — this is the authoritative cross-team thrash signal, not comment parsing
- Determines `metric_linked` via regex/pattern detection on issue descriptions: looks for hypothesis patterns ("we believe X", "our target is Y", explicit numeric targets or success metric references). Does NOT require external metric integrations.
- Compares computed values to `BetHealthBaseline` stored with the bet
- Computes `health_score` (0–100) as weighted composite of signal deltas
- Writes `BetSnapshot` with `status: "ok" | "error"` to AlloyDB before returning

**What it does NOT do:**
- Interpret signals or infer risk type — that's Product Brain's job
- Read strategy docs or Lenny content
- Write to Linear
- Make any LLM calls

**Linear API scope:**
```python
# Bounded window — NEVER unbounded history scan
linear_mcp.list_issues(
    project_id=bet.linear_project_ids,
    updated_after=now() - timedelta(days=14)
)
linear_mcp.list_issue_relations(issue_ids=...)  # blocked_by / blocks / related
```

**Error handling:**
If Linear API fails (rate limit, timeout, auth error), the Signal Engine writes a `BetSnapshot` with `status: "error"` and `error_code` before exiting cleanly. The UI shows "Scan failed — last checked [date]" so the founder never sees stale "healthy" data presented as current.

---

## Component 2: Product Brain Agent

**Type:** ADK agent — LLM reasoning.
**Model:** `gemini-3-pro-preview`
**Context in:** `ProductBrainAgentContext` (see data-schema.ts)
**Output:** `RiskSignal` (without `id` — Coordinator persists it)

**Internal structure (3 sequential steps, 1 agent):**

**Step A — Retrieve:** Pull semantically relevant `ProductHeuristic[]` from Vertex Memory Bank using bet problem statement + signal summary as query. Pull strategy doc excerpts via RAG.

**Step B — Classify:** Given `LinearSignals` + heuristics + strategy excerpts, produce:
- `risk_type: RiskType` (or `null` if signals below confidence floor)
- `confidence: number` (0–1)
- `evidence: Evidence[]` — each evidence item cites specific Linear issue IDs + threshold values

**Step C — Copy:** Given classified risk, generate founder-facing copy:
- `headline` — one sentence, frames as lost upside (never threat). Max 12 words.
- `explanation` — 2–3 sentences. Cites specific product principle by ID.

**Separation matters:** Steps B and C are explicitly separated in the prompt so that classification quality isn't contaminated by copy-writing style pressures. The agent is evaluated on classification accuracy (Step B) separately from copy quality (Step C).

**What it does NOT do:**
- Read raw Linear data directly — receives pre-computed `LinearSignals` from Signal Engine
- Write to Linear or AlloyDB
- Propose or rank interventions — Coordinator does this
- Produce a `RiskSignal` if `confidence < 0.6` (returns `null` — no signal surfaced)

**ADK patterns:**
```python
# Inject structured context, not raw history
agent = LlmAgent(
    before_agent_callback=assemble_product_brain_context,
    after_agent_callback=persist_agent_trace,
)
# Active HeuristicVersion prompt fragment prepended to every run
# Vertex semantic caching on strategy docs (reads are expensive and stable)
```

---

## Component 3: Coordinator Agent

**Type:** ADK agent — LLM reasoning.
**Model:** `gemini-3-pro-preview`
**Context in:** `CoordinatorAgentContext` (see data-schema.ts)
**Output:** `Intervention` proposal + persists `RiskSignal` to AlloyDB

**What it does:**
- Receives `RiskSignal` + `prior_interventions` with outcomes
- Selects exactly **one** intervention from the Intervention Taxonomy (see below)
- Ranks candidates using `intervention_ranking_weights` in active `HeuristicVersion`
- Applies recency suppression: will not repeat same `action_type` on same bet within 30 days unless prior was accepted and resolved
- Calibrates aggressiveness based on workspace acceptance/rejection history
- Writes `RiskSignal` + `Intervention` (status: "pending") to AlloyDB
- Logs `AgentTrace` for AutoResearch

**What it does NOT do:**
- Surface more than one intervention per risk signal
- Execute any Linear writes
- Skip Governor — proposed intervention always goes through policy check next

### Intervention Taxonomy

Every intervention must be one of these. No improvisation outside this list.

| Action Type | Description | Applies When | Requires Founder Approval | Jules Eligible |
|---|---|---|---|---|
| `clarify_bet` | Add comment asking founder to clarify bet scope | `strategy_unclear`, confidence < 0.7 | Yes | No |
| `add_hypothesis` | Create issue to document missing hypothesis | `strategy_unclear`, `missing_hypothesis` evidence | Yes | No |
| `add_metric` | Create issue to define success metric | `missing_metric` evidence | Yes | No |
| `rescope` | Add comment with suggested reduced scope | `execution_issue` + chronic rollovers | Yes | No |
| `align_team` | Comment linking cross-team blocked issues | `alignment_issue` + cross-team thrash | Yes | No |
| `redesign_experiment` | Draft pre-mortem doc (not direct write) | `strategy_unclear` at high severity | Yes, high-visibility | No |
| `pre_mortem_session` | Create issue proposing a team pre-mortem meeting | `alignment_issue` or `execution_issue` at critical severity | Yes | No |
| `kill_bet` | Draft retrospective document summarizing evidence | `execution_issue` at critical + multiple prior cycles | Yes, high-visibility | No |
| `no_intervention` | Log and surface reasoning; no action taken | Low confidence, acknowledged risk, or rate cap hit | N/A | No |
| `jules_instrument_experiment` | Jules scaffolds observability for experiment | `missing_metric` when bet is code-heavy | Yes + Jules plan | Yes |
| `jules_add_guardrails` | Jules adds safety checks to risky deployment | `execution_issue` blocking deployment | Yes + Jules plan | Yes |
| `jules_refactor_blocker` | Jules refactors technical blocker identified in Linear | Chronic blocker in same issue | Yes + Jules plan | Yes |
| `jules_scaffold_experiment` | Jules creates experiment scaffold from bet hypothesis | New bet with `declaration_confidence > 0.8` | Yes + Jules plan | Yes |

**Ranking logic:**
```python
# Coordinator uses HeuristicVersion.intervention_ranking_weights
# Plus these hard rules applied first:
# 1. If same action_type was rejected in last 30 days → skip, try next
# 2. If Jules action AND workspace has no GitHub connected → skip
# 3. If severity == "low" → only clarify_bet, add_hypothesis, add_metric eligible
# 4. If severity == "critical" → pre_mortem_session, kill_bet eligible
# 5. If confidence < 0.7 → only no_intervention eligible
```

---

## Component 4: Governor / Policy Engine

**Type:** Deterministic Python service — NOT an LLM agent.
**Input:** proposed `Intervention` + `HeuristicVersion.policy` + workspace history
**Output:** `ApprovedIntervention` OR `PolicyDenied(reason)`

**Policy checks (all must pass):**

| Check | Rule | On Fail |
|---|---|---|
| Confidence floor | `risk_signal.confidence >= policy.min_confidence` (default: 0.65) | Deny, log reason |
| Duplicate suppression | No identical `action_type` on same `bet_id` in last 30 days | Deny, suggest `no_intervention` |
| Rate cap | Max 1 surfaced intervention per bet per 7 days | Deny, log |
| Jules gate | Jules actions require GitHub repo connected and founder has approved Jules at least once | Deny with `connect_github` prompt |
| Reversibility check | `kill_bet` / `redesign_experiment` flagged as high-visibility — require extra approval step | Flag for explicit double-confirm in UI |
| Acknowledged risk | If `risk_type` matches an `AcknowledgedRisk` on the bet | Auto-deny, no UI surface |

**On PolicyDenied:** writes a `PolicyDeniedEvent` to AlloyDB (audit trail, not surfaced to founder). AutoResearch uses denied events to detect over-triggering heuristics.

---

## Component 5: Action Executor

**Type:** Deterministic Python service.
**Triggered:** Only after `ApprovedIntervention` AND founder accepts in UI.

**On Linear action:**
```python
linear_mcp.execute(intervention.proposed_linear_action)
alloydb.update(Intervention, {status: "accepted", decided_at: now()})
alloydb.schedule_outcome_check(bet_id, delay_days=14)
```

**On Jules action:**
```python
# requirePlanApproval=True is NON-NEGOTIABLE — always set
jules_api.create_session(
    prompt=build_jules_prompt(intervention),
    source_repository=workspace.github_repo,
    requirePlanApproval=True
)
# Jules session status → alloydb (pending plan review)
# Founder sees JulesPlanApprovalDialog before any code is written
# On PR merged → webhook updates Intervention status → outcome check
```

**What it does NOT do:**
- Improvise actions beyond `LinearAction` interface
- Call Jules without `requirePlanApproval=True`
- Write to Linear without a founder-accepted Intervention record

---

## Bet Declaration (Parallel Subsystem)

Bet declaration runs independently of the monitoring pipeline. It's a one-time flow per workspace setup, not a recurring scan.

```
DETECT → DRAFT → [Day 1 Health Report] → CONFIRM
```

### Step 1: Detect

```python
# Cluster Linear projects + issues into candidate bets
# Bounded to last 90 days of activity (not full history)
issues = linear_mcp.list_issues(team_id=workspace.linear_team_id, updated_after=90_days_ago)
projects = linear_mcp.list_projects(team_id=workspace.linear_team_id)

# Cluster by:
# 1. Linear project grouping (first-class signal)
# 2. Semantic similarity of issue titles/descriptions (embed + cluster)
# 3. Shared labels or assignees

# Confidence thresholds:
# >= 0.8 → auto-draft (show as pre-filled)
# 0.6–0.8 → draft with low-confidence label, highlight uncertain fields
# < 0.6 → show raw candidate cluster, ask founder to name/group manually
```

**Edge cases handled:**
- **Overlapping bets:** If two candidates share > 40% of issues, surface as "possible overlap" warning and ask founder to merge or split
- **Mixed work:** Projects with tech debt + product work get `declaration_confidence` penalized and a note: "This project mixes product bets and maintenance work — please confirm scope"
- **Messy workspaces:** < 30% of issues have descriptions → detect and warn; bet clustering will be low confidence across the board
- **Goal-first founders:** If no projects exist but many issues share semantic themes, cluster into goal-based bets and present as proposals

### Step 2: Draft

Product Brain Agent fills in the Bet schema from the candidate cluster:
- `target_segment` — inferred from issue language
- `problem_statement` — synthesized from issue descriptions
- `hypothesis` — if present in any issue; otherwise flagged as missing
- `success_metrics` — extracted if numeric targets found; otherwise empty (flagged)

### Step 3: Day 1 Health Report (NEW — proves value before founder commits)

Before the Confirm screen, Signal Engine runs a quick health scan on the candidate bet. Founder sees:

> "We found this bet. Before you confirm:
> 30% of mapped tickets have no hypothesis.
> 2 issues have been rolled over from last cycle.
> No success metric is defined yet."

This surfaces immediate value. The founder decides whether to confirm, edit, or discard with real data already visible.

### Step 4: Confirm

```
[Confirm] → status: "active" → monitoring starts
[Edit] → founder edits fields → confirm again
[Not a bet] → persists as BetRejection (training data for Detect tuning)
```

---

## AutoResearch (Offline Eval Replay)

**Not live.** AutoResearch runs offline against accumulated traces. No live A/B.

```
TRIGGER: N=20 accepted/rejected interventions accumulated

1. Take active HeuristicVersion
2. Mutate ONE parameter:
   - A threshold (e.g., chronic_rollover_threshold: 2 → 3)
   - A ranking weight (e.g., align_team weight: 0.8 → 0.9)
   - A prompt fragment segment
3. Replay mutated version on last 30 AgentTraces (golden trace replay)
4. Score with LLM-as-judge against eval rubric:
   - Relevance: does the risk type match the evidence?
   - Precision: is the intervention specific, not generic?
   - Founder alignment: does acceptance history support this?
5. If score > active version → create candidate HeuristicVersion
6. Manual review: human compares candidate vs active (no automatic promotion)
7. On manual approval → status: "active"
8. Log change_summary to HeuristicVersion → exposed in UI as Evolution Log entry
```

**For MVP:** Steps 1–4 implemented. Steps 5–7 are manual (founder reviews in Evolution Log, approves promotion). No automated A/B rollout.

**On rejection feedback (future):** If a founder rejects and adds a note, that note is stored on `Intervention.founder_note` and flagged for human review. Future AutoResearch can feed rejection reasons into workspace-specific `ProductHeuristic` mutation.

---

## Memory Model — Source of Truth Boundaries

Three memory systems with non-overlapping responsibilities:

### AlloyDB (structured entities + audit trail)
- `Bet`, `BetSnapshot`, `RiskSignal`, `Intervention`, `Outcome`
- `HeuristicVersion`, `BetRejection`, `AgentTrace`
- `PolicyDeniedEvent` (new — for audit + AutoResearch)
- **TTL:** Indefinite — audit and learning corpus
- **Consistency model:** Strong consistency (PostgreSQL ACID)
- **Never read:** transient runtime state, strategy docs

### Vertex Memory Bank (semantic retrieval)
- `ProductHeuristic[]` — product principles, example patterns, suggested actions
- Bet context for cross-bet pattern detection
- Intervention outcome embeddings (for similarity search on "what worked before")
- **TTL:** Refreshed weekly from AlloyDB (heuristics evolve with AutoResearch)
- **Never stored here:** bets, interventions, risk signals (AlloyDB is authoritative)

### ADK Session (transient runtime)
- `ActiveBet` snapshot for current monitoring run
- Assembled agent context objects (`ProductBrainAgentContext`, etc.)
- In-flight `RiskSignal` before persistence
- **TTL:** Discarded at session end — never restored
- **Rule:** If you need it after the session, write it to AlloyDB first

---

## Failure States & Error Handling

Every component writes structured error state. UI always shows scan freshness.

| Component | Failure Mode | Error Record | UI Behavior |
|---|---|---|---|
| Signal Engine | Linear API rate limit / timeout | `BetSnapshot { status: "error", error_code: "rate_limit" }` | "Scan failed — last updated [date]" |
| Signal Engine | Linear auth expired | `BetSnapshot { status: "error", error_code: "auth_expired" }` | Banner: "Reconnect Linear" |
| Product Brain | LLM hallucinated output (Pydantic validation fails) | `AgentTrace { eval_score: 0, error: "validation_failed" }` | Silently skipped — no signal surfaced |
| Product Brain | Low confidence (< 0.6) | No `RiskSignal` created | No signal surfaced — not an error |
| Governor | Policy denied | `PolicyDeniedEvent` (not shown to founder) | No intervention surfaced |
| Action Executor | Linear write fails | `Intervention { status: "failed" }` | Toast: "Action failed — retry?" |
| Jules | Session creation fails | `JulesSession { status: "error" }` | Toast: "Jules unavailable — try again later" |

---

## ADK Patterns

- Use `InMemorySessionService` for local dev, `VertexAiSessionService` for prod
- Agent tools: prefer MCP tools over custom tools where available
- Use `before_agent_callback` to assemble and inject context objects
- Use `after_agent_callback` to persist `AgentTrace`
- Never pass raw conversation history to agents — pass structured context objects
- Pydantic validation on all LLM agent outputs before any downstream use — validation failure is a silent skip, not a crash
- See `/adk-cheatsheet` skill for code patterns
