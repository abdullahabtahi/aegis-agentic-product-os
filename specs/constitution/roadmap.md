# Roadmap

Ordered feature list for Aegis Phase 7 and UI completion.
Each item is a self-contained spec folder. Mark items `[x]` when implementation + validation pass.

Phases 1–6 are complete (see `CLAUDE.md` build state table). This roadmap covers the remaining high-value gaps identified after Phase 6.

---

## Features

### [ ] 1. Workspace ID Injection
**Folder:** `/workspace-id-injection/`

Replace three hardcoded `const WORKSPACE_ID = "default_workspace"` constants in frontend pages with dynamic workspace IDs sourced from the AG-UI session state. The conversational agent's `declare_bet()` tool already writes `workspace_id` into session state — the frontend just never reads it.

**Done when:**
- `directions/page.tsx`, `directions/[id]/page.tsx`, and `mission-control/page.tsx` no longer contain hardcoded `"default_workspace"`.
- Workspace ID resolves from the CopilotKit agent state (`useCoAgent`) on every page.
- A fallback of `"default_workspace"` is used only when no session has been established yet.
- No new backend code required.

---

### [ ] 2. Risk Signal Cards
**Folder:** `/risk-signal-cards/`

Parse the structured `risk_signal_draft` (JSON blob) emitted by Product Brain into the AG-UI session state, and render it as a `RiskSignalCard` component inside the chat message feed — replacing the raw Markdown summary the conversational agent currently generates.

**Done when:**
- After a `run_pipeline_scan` completes, a structured `RiskSignalCard` appears in the chat alongside (or instead of) the Markdown reply.
- The card shows: risk type badge, severity badge, confidence bar, headline, explanation, and evidence summary.
- If `risk_signal_draft` is absent or malformed, the chat falls back to Markdown only — no crash.
- Card styling matches the glassmorphic design system (Inter, 8px grid, CSS custom properties from `linear-theme.css`).

---

### [ ] 3. Settings Page — Control Level
**Folder:** `/settings-control-level/`

Replace the empty Settings stub (`app/workspace/settings/page.tsx`) with a functional control level selector that reads and writes `control_level` via the existing `adjust_autonomy` backend tool, and persists the value to the database.

**Done when:**
- Settings page renders three option cards: Draft Only (L1), Require Approval (L2), Autonomous Low Risk (L3).
- The currently active level (from AG-UI state) is visually highlighted.
- Selecting a level sends a chat message that triggers `adjust_autonomy()` or calls a new REST endpoint.
- `control_level` is persisted to the `Workspace` row in the database (not just session state).
- After page reload, the previously set control level is still reflected in the UI.

---

### [ ] 4. Activity Log
**Folder:** `/activity-log/`

Replace the empty Activity stub (`app/workspace/activity/page.tsx`) with a chronological timeline of all interventions taken against a workspace, sourced from `GET /interventions`.

**Done when:**
- Activity page renders a timeline of all interventions for the current workspace, sorted newest-first.
- Each entry shows: timestamp, bet name, action type, escalation level, status badge (accepted/rejected/dismissed), and (if rejected) the denial reason.
- Empty state is shown when no interventions exist yet.
- Data is fetched via React Query with a 30-second refetch interval.
- Clicking an entry navigates to the relevant direction detail page.

---

### [ ] 5. Control Level Persistence
**Folder:** `/control-level-persistence/`

Wire the one-line TODO in `conversational.py:559` that updates `workspace.control_level` only in session state — not in AlloyDB. After this, control level survives page reloads and backend restarts.

**Done when:**
- `adjust_autonomy()` tool calls `upsert_workspace({id: workspace_id, control_level})` in the database repository after updating session state.
- `GET /bets` response (or a new `GET /workspace` endpoint) returns the persisted `control_level`.
- Frontend Settings page reads `control_level` from the backend on mount, not from session state alone.
- `control_level` reset to `"draft_only"` on page reload is no longer reproducible.

---

## Completion Gate

Before Phase 7 demo, confirm:

> "Can a founder declare a bet, trigger a scan, see a structured risk card, approve or reject the intervention, and then adjust their autonomy level — all without any hardcoded data or synthetic stubs?"

If yes → run `make eval-all`, verify ≥ 0.8 across all 5 traces, and cut the demo video.
