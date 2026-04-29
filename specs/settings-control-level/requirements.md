# Requirements — Settings Page: Control Level

## Behavioral Requirements

### R1 — Three Level Cards Rendered
The Settings page renders exactly three option cards: Draft Only (L1), Require Approval (L2), Autonomous Low Risk (L3). Each card shows a badge, label, and prose description.

### R2 — Active Level Highlighted
The card matching `state.control_level` from AG-UI session is visually distinct (indigo border + background tint). If `control_level` is not yet set in state, `"draft_only"` is the default active level.

### R3 — Selecting a Level Sends a Chat Message
Clicking a non-active level card sends a chat message via `useCopilotChat.appendMessage` with content `"Set autonomy level to {level}"`. The existing `adjust_autonomy()` backend tool handles the rest.

### R4 — Selecting the Active Level is a No-Op
Clicking the currently active card does nothing — no message sent, no UI change.

### R5 — UI Updates After Tool Call
After `adjust_autonomy()` runs and updates `control_level` in session state, the AG-UI state reactively updates and the new card becomes highlighted without a page reload.

### R6 — control_level Persisted to Database
`adjust_autonomy()` writes `control_level` to the `Workspace` row in the database via `upsert_workspace(workspace_id, control_level)`. After a backend restart, the persisted value is available.

### R7 — Matches Glassmorphic Design System
Settings page uses `glass-panel` and CSS custom properties. No inline hex colors. Inter font, 8px grid.

### R8 — No New REST Endpoint for Reading
The page reads `control_level` from AG-UI state (`useCoAgent`), not from a new REST endpoint. The only backend change is the database persist in `adjust_autonomy()`.

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| `control_level` not yet in state | `"draft_only"` card is active by default |
| User clicks active card | No action; no message sent |
| `adjust_autonomy()` backend tool fails | Session state not updated; active card stays unchanged; error surfaced in chat |
| User navigates to Settings without declaring a bet | Page renders normally; defaults to L1 |
| Backend restarted after setting L2 | With persistence implemented, L2 is restored from DB |
