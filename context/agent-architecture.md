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

**Type:** Deterministic ADK `BaseAgent` subclass — NOT an LLM agent.
**ADK implementation:** `class SignalEngineAgent(BaseAgent)` with `_run_async_impl`.
Participates in ADK event loop (emits events, session state propagation, eval compatibility).
No LLM calls. All logic is pure Python + Linear API reads.
**Trigger:** Once per monitoring cycle per bet.
**Context in:** `ExecutionAgentContext` (see data-schema.ts)
**Output:** `LinearSignals` + `BetSnapshot` persisted to AlloyDB; writes `linear_signals` to `ctx.session.state["linear_signals"]` for downstream agents.

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
# Context objects written to ctx.session.state["product_brain_context"] for AutoResearch replay
```

**Retry on validation failure:**
```python
# In after_model_callback — 1 retry before silent skip
# LLMs are stochastic; the exact same prompt succeeds on retry far more often than not.
if not validate_pydantic_output(response):
    if ctx.session.state.get("product_brain_retry_count", 0) < 1:
        ctx.session.state["product_brain_retry_count"] = 1
        return None  # trigger ADK retry
    # After 1 retry still fails → silent skip, log AgentTrace with eval_score=0
    log_validation_failure(response, ctx)
    return skip_signal()
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

### Escalation Ladder

Coordinator selects the best intervention within the current escalation level.
**Hard enforcement is handled by the Governor (check #8)** — Coordinator cannot
bypass this by producing a higher-level intervention; Governor will deny it.

```
Level 1 (Clarify):  clarify_bet, add_hypothesis, add_metric
Level 2 (Adjust):   rescope, align_team, redesign_experiment
Level 3 (Escalate): pre_mortem_session, jules_* actions
Level 4 (Terminal): kill_bet
```

**What Coordinator does:** Uses `prior_interventions` with outcomes to understand
current escalation level and select an appropriate intervention. It should prefer
lower-level actions, but enforcement of the ladder is deterministic in Governor.

**Why enforcement is in Governor, not Coordinator:** Coordinator is an LLM — it can
reason about escalation levels but cannot guarantee it will never skip rungs under
adversarial input or unusual prompting. Governor check #8 is a hard deterministic
gate. See Governor section for the exact rule.

**Exception:** `severity == "critical"` AND `chronic_rollover_count >= 3` → Governor allows skip to Level 3 directly.

---

## Component 4: Governor / Policy Engine

**Type:** Deterministic Python service — NOT an LLM agent.
**Input:** proposed `Intervention` + `HeuristicVersion.policy` + workspace history
**Output:** `ApprovedIntervention` OR `PolicyDenied(reason)`

**Policy checks (all 8 must pass — deterministic, no LLM):**

| # | Check | Rule | On Fail |
|---|---|---|---|
| 1 | Confidence floor | `risk_signal.confidence >= policy.min_confidence` (default: 0.65) | Deny, log reason |
| 2 | Duplicate suppression | No identical `action_type` on same `bet_id` in last 30 days | Deny, suggest `no_intervention` |
| 3 | Rate cap | Max 1 surfaced intervention per bet per 7 days | Deny, log |
| 4 | Jules gate | Jules actions require GitHub repo connected and founder approved Jules at least once | Deny with `connect_github` prompt |
| 5 | Reversibility check | `kill_bet` / `redesign_experiment` or any `draft_document` at `escalation_level >= 3` flagged high-visibility | Flag for explicit double-confirm in UI |
| 6 | Acknowledged risk | If `risk_type` matches an `AcknowledgedRisk` on the bet | Auto-deny, no UI surface |
| 7 | Control level | `workspace.control_level` determines whether action requires approval or can auto-execute | Enforce L1/L2/L3 before Executor |
| 8 | Escalation ladder | Proposed `escalation_level` must not exceed `max(prior_accepted_interventions.escalation_level) + 1`. Exception: `severity == "critical"` AND `chronic_rollover_count >= 3` allows skip to Level 3 | Deny with `escalation_ladder` reason; Coordinator must retry with lower-level action |

**Why escalation ladder is in Governor, not Coordinator:** Coordinator is an LLM agent and cannot reliably enforce hard policy constraints. Governor is deterministic. The ladder is a hard rule, not a recommendation. Coordinator _recommends_ the best intervention; Governor _enforces_ that it doesn't skip rungs.

**On PolicyDenied:** writes a `PolicyDeniedEvent` to AlloyDB (audit trail, not surfaced to founder). AutoResearch uses denied events to detect over-triggering heuristics.

### Blast Radius Preview

Before surfacing any Level 3–4 intervention (or any Jules action) to the founder,
the Governor computes a `BlastRadiusPreview` — a deterministic count of what will
change if the action is executed.

```python
# Deterministic — uses already-computed BetSnapshot data (NO fresh Linear API call).
# Signal Engine already bounded reads to 14 days — reuse that data, don't re-read.
def compute_blast_radius(
    intervention: Intervention,
    bet_snapshot: BetSnapshot,   # latest snapshot from AlloyDB, already computed
    bet: Bet,
) -> BlastRadiusPreview:
    if intervention.action_type in {"kill_bet", "rescope", "jules_refactor_blocker"}:
        return BlastRadiusPreview(
            # Use Signal Engine's already-computed count — no fresh unbounded Linear read
            affected_issue_count=bet_snapshot.linear_signals.total_issues_analyzed,
            affected_assignee_ids=[],   # approximation: exact assignees are in BetSnapshot if needed
            affected_project_ids=bet.linear_project_ids,
            estimated_notification_count=bet_snapshot.linear_signals.total_issues_analyzed,
            reversible=intervention.action_type != "kill_bet",
        )
    return BlastRadiusPreview(affected_issue_count=0, affected_assignee_ids=[], affected_project_ids=[], estimated_notification_count=0, reversible=True)
```

The `BlastRadiusPreview` is attached to the `Intervention` before it's surfaced.
The UI (`InterventionApprovalCard`) renders it as a warning badge:

> "This will affect 23 issues, 4 assignees, 2 projects."

Heavy, irreversible interventions (`kill_bet`, `reversible=False`) require an additional
explicit confirmation step in the UI (shadcn `AlertDialog`).

### Override & Teach

When a founder rejects an intervention, the UI prompts a single-tap reason:

```
Why reject?  [ Evidence too weak ]  [ Already handled ]
             [ Not a priority   ]  [ Wrong risk type  ]
```

The selected `RejectionReasonCategory` is stored on the `Intervention` record and fed
into a **Governor suppression rule**: if the same `(risk_type, action_type, rejection_reason)`
combination is rejected twice within 30 days, the Governor automatically suppresses
that combination for this workspace for `policy.auto_suppress_days` (default: 14).

This creates a lightweight learning loop without requiring AutoResearch or LLM tuning:
```
Reject(reason) → store on Intervention → Governor reads rejection history
→ auto-suppress matching pattern → surfaced in Suppression Log as "Suppressed: you said this wasn't relevant"
```

The suppression is surfaced in the Suppression Log UI, so founders can see and undo it.

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
[Confirm] → status: "active" → first LIVE monitoring scan runs immediately
           → subsequent scans: weekly cron (not a 7-day wait before first value)
[Edit] → founder edits fields → confirm again
[Not a bet] → persists as BetRejection (training data for Detect tuning)
```

**Why first scan is immediate:** A founder who connects Linear and confirms bets should see
risk signals within minutes, not a week later. The Replay simulation (Step 5) shows historical
value; the immediate live scan shows current risk. Together they eliminate the "0-7 day
onboarding gap" where the product provides no value.

### Step 5: Replay / Simulation Mode (runs automatically at Confirm)

Immediately after a bet is confirmed, the system runs the full Signal Engine →
Product Brain → Coordinator pipeline in **dry-run mode** against the past 14 days
of Linear data for that bet's `linear_project_ids`. No writes. No interventions executed.

The founder sees a timeline on the Confirm screen before hitting final confirm:

```
Past 14 days — what Aegis would have flagged:

  Day 2  ──  Execution risk detected: 2 issues rolled over
             → Would have proposed: add_hypothesis label
             → Confidence: 72%

  Day 9  ──  Alignment issue detected: cross-team block on AUTH-234
             → Would have proposed: align_team comment
             → Confidence: 81%

  Day 13 ──  Strategy unclear: no success metric in any linked issue
             → Would have proposed: add_metric issue
             → Confidence: 76%
```

**Why this works without new infrastructure:**
Signal Engine already accepts `monitoring_period_days` + a bounded time window.
Replay mode passes `period_end = now - N_days` instead of `now`. Same code, same
deterministic service — just a different time window. Product Brain and Coordinator
run identically; results are tagged `is_replay: true` so they are never persisted
as real `RiskSignal` or `Intervention` records.

**Backend entry point:**
```python
async def run_bet_simulation(
    bet: Bet,
    replay_days: int = 14,
) -> list[SimulatedRiskEvent]:
    """
    Returns sorted list of {day_offset, risk_signal, proposed_intervention}
    for display in ReplayPreview.tsx. Nothing is written to AlloyDB.
    """
```

**Demo value:** Shows founders that Aegis would have caught real problems earlier
than they were noticed manually. This is the clearest proof of "earlier-than-human" value.

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

### AlloyDB + pgvector (semantic retrieval — Phases 1–3)
- `ProductHeuristic[]` — product principles, example patterns, suggested actions (stored in AlloyDB, retrieved via pgvector similarity search using bet problem_statement + signal summary as query vector)
- `StartupFailurePattern[]` — failure corpus embeddings (Phase 2)
- `BetOutcomeRecord[]` — cross-workspace outcome embeddings for similarity search (Phase 3)
- **TTL:** Indefinite — same AlloyDB instance, no separate service to maintain
- **Never stored here:** transient runtime state, raw strategy doc text

### Graphiti Temporal KG (episodic retrieval — Phase 4+)
- Temporal knowledge graph layered on top of AlloyDB (not a replacement for it)
- Enables bi-temporal queries: "what did we know about this bet on day N?" and "how many times has this risk pattern recurred?"
- AlloyDB is always the source of truth. Graphiti is a derivable index — if it dies, rebuild from AlloyDB.
- **Phase 1–3:** skip Graphiti entirely. AlloyDB+pgvector is sufficient.

**Note on `VertexAiMemoryBankService`:** This ADK class exists in v1.x (`from google.adk.memory import VertexAiMemoryBankService`) but we are not using it. It provides flat cosine-similarity retrieval only — insufficient for bi-temporal episodic queries. Our choice: AlloyDB+pgvector (Phases 1–3) → Graphiti (Phase 4+).

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
