# Mission

## What & Why

Aegis is an agentic product OS that runs autonomous pre-mortem risk scans on a startup's active bets. It reads Linear projects and issues, classifies risks, proposes targeted interventions, and routes them through a founder-controlled approval loop before taking any real action.

**Vision:** a calm, always-on co-founder that surfaces the right risk at the right time — not a dashboard of vanity metrics, but a deliberate signal that earns its place in a founder's decision-making.

**Meta-purpose:** demonstrate that a 5-stage autonomous agent pipeline (Signal Engine → Product Brain → Coordinator → Governor → Executor) can operate safely in a Human-in-the-Loop product workflow using Google ADK, CopilotKit, and AG-UI.

## Target Audience

A technical founder or solo product leader running 2–10 active bets tracked in Linear. They want risk surfaced before it's obvious, not a second project management tool. They are comfortable with a chat interface and expect structured, actionable outputs — not vague AI summaries.

Out of scope: non-technical stakeholders, multi-team enterprises, users without Linear.

## Core Constraints

| Allowed | Not Allowed |
|---|---|
| 5-stage sequential pipeline only | Parallel agent stages |
| Gemini 3-flash (workers) / 3-pro (synthesis) | Any other model family |
| Governor = 8 deterministic policy checks | LLM in Governor |
| HITL control levels L1/L2/L3 | Skipping founder approval at L1 |
| MockLinearMCP during eval | Live Linear writes during eval |
| `no_intervention` records | Rendering `no_intervention` in founder UI |
| Schema-first: all new fields in `context/data-schema.ts` first | Adding fields to Pydantic models before updating the schema |

### Why These Constraints Exist

- **Sequential pipeline**: Product Brain requires Signal Engine output. Parallelism was considered and rejected — see `context/agent-architecture.md`.
- **Governor determinism**: Policy checks must be auditable and stable. LLM-in-Governor was considered and rejected because it introduces non-determinism in safety-critical decisions.
- **Schema-first**: The TypeScript schema is shared by frontend, backend models, and eval fixtures. Drift between them has caused bugs; the schema is the contract.
- **MockLinearMCP in eval**: Live API calls during eval runs make traces non-reproducible. Trust in eval scores requires isolated, controlled data.

## User Flows

1. **Bet Declaration**: Founder tells Aegis about a new bet via chat. Aegis stores the bet (POST /bets) and offers an immediate pipeline scan.
2. **Pipeline Scan**: Aegis runs a 5-stage scan on a bet's Linear data. The founder sees live stage progress via `PipelineProgressCard`. After completion, Aegis summarizes findings in chat.
3. **Intervention Inbox**: Governor-approved interventions land in `/workspace/inbox`. Founder reviews, approves, rejects, or snoozes each one.
4. **Approval Flow**: Approved intervention → Executor runs the Linear action. Rejected intervention → stored with `denial_reason`, fed back into `rejection_history` for future scans.
5. **Directions**: `/workspace/directions` shows all active bets with health bars and risk status. Founders drill into `/workspace/directions/[id]` for details.
6. **Autonomy Control**: Founder adjusts control level (L1/L2/L3) via chat (`adjust_autonomy` tool) or the Settings page. Governor enforces the level on every scan.

## Success Criteria

- A founder can declare a bet in chat and immediately trigger a pipeline scan.
- All 5 pipeline stages emit real data (no synthetic stubs reach the production UI).
- Risk signal output (risk_type, confidence, evidence) is rendered as structured UI cards — not raw Markdown.
- The Intervention Inbox shows only Governor-approved interventions that require founder action.
- `no_intervention` records are never visible in any founder-facing surface.
- Approval and rejection each call the correct backend endpoint and refresh the inbox.
- Workspace ID is never hardcoded; it flows from session state on every page.
- Control level (L1/L2/L3) is readable and settable from both chat and the Settings page, and persists across page reloads.
- `make eval-all` passes with `tool_trajectory_avg_score ≥ 0.8` on all 5 golden traces.
