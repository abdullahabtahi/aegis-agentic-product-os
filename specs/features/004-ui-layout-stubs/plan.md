# Plan — 004 UI Layout & Stubs

**Created:** April 2026

---

## Approach

Three independent workstreams. The double-layout fix is lowest risk and should go first since it affects 4 pages. Activity log is the most visible user-facing item.

---

## Files to Change

### Fix 1 — Remove Double Layout (`inbox`, `suppression`, `settings`, `activity` pages)
- `frontend/app/workspace/inbox/page.tsx`: remove `AppShell` import and wrapper
- `frontend/app/workspace/suppression/page.tsx`: same
- `frontend/app/workspace/settings/page.tsx`: same
- `frontend/app/workspace/activity/page.tsx`: same (build together with activity log content)
- These pages already receive `GlassmorphicLayout` from `app/workspace/layout.tsx` — no layout wrapper needed

### Fix 2 — Activity Log Page (`frontend/app/workspace/activity/page.tsx`)
- Replace placeholder content with full timeline implementation
- Create `frontend/components/interventions/StatusBadge.tsx`
- Use `getInterventions(workspaceId)` from `lib/api.ts`
- React Query: `queryKey: ["interventions", workspaceId]`, `refetchInterval: 30_000`
- Filter: exclude `status === "no_intervention"` and `action_type === "no_intervention"`
- Sort: newest first by `created_at` or `updated_at`
- Click item → `router.push(\`/workspace/directions/${item.bet_id}\`)`
- Empty state: "No decisions yet. Decisions will appear here after your first pipeline scan."
- Error state: "Failed to load activity. Retrying..." with retry button

### Fix 3 — BetDeclarationModal Reset (`frontend/components/bets/BetDeclarationModal.tsx`)
- Add `resetForm()` call before the `return` in the `persisted === false` branch (~line 104)

### Fix 4 — Execution Health Chart (`frontend/app/workspace/mission-control/page.tsx`)
- Short term: align bar count to label count — `CHART_BARS.slice(0, CHART_DAYS.length)`
- OR replace static chart with empty state component until real Linear data endpoint exists
- Add comment: `// TODO: replace with real data from GET /workspace/{id}/metrics`

### Fix 5 — `console.error` in Production (`frontend/components/layout/Providers.tsx`)
- Wrap `console.error` calls in `handleCopilotError` with `if (process.env.NODE_ENV === 'development')`
- Keep user-facing UI error toast (that's fine in prod)

### Fix 6 — `BACKEND_URL` Startup Assertion (`frontend/app/api/copilotkit/route.ts`)
- After `const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000/adk/v1/app"`
- Add: `if (!process.env.BACKEND_URL && process.env.NODE_ENV === 'production') { throw new Error('BACKEND_URL must be set in production') }`

---

## `StatusBadge` Component Design

```tsx
// frontend/components/interventions/StatusBadge.tsx
type BadgeStatus = "approved" | "rejected" | "dismissed" | "pending" | "no_intervention"

const STATUS_STYLES: Record<BadgeStatus, string> = {
  approved: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  rejected: "bg-red-500/20 text-red-400 border-red-500/30",
  dismissed: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  no_intervention: "hidden", // never rendered
}
```

## Design Decisions

- **Empty state over broken chart**: A clear "Connect Linear" empty state is more honest than a fabricated trend chart. Judges see intentionality, not bugs.
- **Activity log uses existing `getInterventions`**: No new backend endpoint needed. Client-side filter for `no_intervention` is acceptable at this data volume.
- **`AppShell` kept for non-workspace routes**: Only removed where `GlassmorphicLayout` already provides the shell. Don't delete the component.
