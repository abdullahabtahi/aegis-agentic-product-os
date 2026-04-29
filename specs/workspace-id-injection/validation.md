# Validation — Workspace ID Injection

## Level 1 — Static Verification (grep)

These checks can be run as a pre-commit or CI step:

```bash
# Must return 0 matches — no hardcoded workspace ID outside the hook
grep -rn 'WORKSPACE_ID = "default_workspace"' frontend/app/
# Expected: no output (exit 0)

# Must appear exactly once — in the hook fallback
grep -rn '"default_workspace"' frontend/
# Expected: exactly 1 match in hooks/useWorkspaceId.ts
```

## Level 2 — Manual Smoke Tests

| # | Step | Expected |
|---|---|---|
| S1 | Open `/workspace/directions` in a fresh browser session (no prior bet declared) | Page loads; `workspace_id` resolves to `"default_workspace"` via fallback; no console error |
| S2 | In chat, declare a new bet: "I'm working on a bet called Aegis Demo, workspace ws-demo" | Agent calls `declare_bet()`, session state receives `workspace_id: "ws-demo"` |
| S3 | Navigate to `/workspace/directions` after S2 | Network request to `/bets?workspace_id=ws-demo` (not `default_workspace`) visible in DevTools |
| S4 | Navigate to `/workspace/mission-control` after S2 | Network request to `/interventions?workspace_id=ws-demo` visible in DevTools |
| S5 | Navigate to `/workspace/directions/some-bet-id` after S2 | Network request uses `ws-demo` workspace ID |
| S6 | Refresh the page after S2 | Session restores; workspace_id is still `ws-demo` (not reset to default) |
| S7 | Open a new tab — go to `/workspace/directions` | Falls back to `"default_workspace"` — new tab has no session yet |

## Level 3 — TypeScript Check

```bash
cd frontend && npx tsc --noEmit
# Expected: 0 errors
```

## Traceability

| Check | Traces to |
|---|---|
| `grep` — no hardcoded constant in pages | R1 |
| `grep` — one fallback in hook only | R1 |
| S1 fallback works | R3 |
| S2-S3 reads from AG-UI state | R2 |
| S3-S5 pages use dynamic ID | R5 |
| S4 reactive update without reload | R4 |
| S6 session restore | R4 |
| S7 tab isolation | R3 |
| TypeScript check | R6 (no new backend types needed) |
