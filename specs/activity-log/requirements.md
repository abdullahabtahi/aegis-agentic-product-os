# Requirements — Activity Log

## Behavioral Requirements

### R1 — Timeline Sorted Newest-First
Interventions are displayed in reverse-chronological order by `created_at`. The most recent intervention appears at the top.

### R2 — No no_intervention Records
`no_intervention` action_type records are filtered out before rendering. They must never appear in the founder-facing activity list.

### R3 — Four Status Badge Colors
Each status has a distinct color: `pending` → amber, `accepted` → emerald, `rejected` → red, `dismissed` → muted white. Badge uses the `StatusBadge` component.

### R4 — Denial Reason Shown for Rejected/Dismissed
If `denial_reason` is set (Governor-suppressed interventions), it is displayed below the action label in muted italic text, with underscores replaced by spaces.

### R5 — Empty State
When no interventions exist (after filtering), a centered empty-state message is shown: "No activity yet. Run a pipeline scan to get started."

### R6 — Loading Skeleton
While the query is in-flight, three skeleton rectangles (animated pulse) are displayed instead of an empty page.

### R7 — Click Navigates to Direction Detail
Clicking any row navigates to `/workspace/directions/{bet_id}` via `router.push`.

### R8 — 30-Second Refetch Interval
React Query refetches `GET /interventions` every 30 seconds automatically. No manual refresh button needed.

### R9 — Uses Dynamic Workspace ID
`getInterventions(workspaceId)` uses the workspace ID from `useWorkspaceId()` hook — never a hardcoded string.

### R10 — bet_name Shown When Present
The `bet_name` field on `Intervention` (denormalized for display) is shown as a subtitle below the action label, truncated with ellipsis if too long.

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| All interventions have `action_type: "no_intervention"` | Empty state shown (all filtered out) |
| `bet_name` is undefined | Subtitle row is omitted; row still renders |
| `denial_reason` is undefined | Denial row is omitted; row still renders |
| Single intervention in list | Single row shown; no visual artifacts |
| 50+ interventions | All rows rendered; page scrollable; no truncation of the list |
| Workspace has no interventions yet | Empty state shown immediately after load |
| Network error on fetch | React Query error state; AppShell handles gracefully (no crash) |
