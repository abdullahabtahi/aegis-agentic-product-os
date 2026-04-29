# Feature Plan — Activity Log

## Roadmap Item
Satisfies roadmap item **4. Activity Log** (`/activity-log/`)

## Overview

Replace the empty Activity stub with a chronological timeline of all interventions for the current workspace, fetched from `GET /interventions`. Data exists in the database — this is a pure frontend render task using React Query and the existing `getInterventions` API client.

## Dependencies

- **Workspace ID Injection** (feature 1): the Activity page needs `workspaceId` from AG-UI state, not hardcoded.
- `getInterventions(workspaceId)` already exists in `frontend/lib/api.ts`.
- `Intervention` type already defined in `frontend/lib/types.ts`.

## Implementation Steps

### Task Group 1 — Status badge component

```typescript
// frontend/components/interventions/StatusBadge.tsx
"use client";
import type { InterventionStatus } from "@/lib/types";

const CONFIG: Record<InterventionStatus, { label: string; className: string }> = {
  pending:   { label: "Pending",   className: "bg-amber-400/10 text-amber-400" },
  accepted:  { label: "Accepted",  className: "bg-emerald-400/10 text-emerald-400" },
  rejected:  { label: "Rejected",  className: "bg-red-400/10 text-red-400" },
  dismissed: { label: "Dismissed", className: "bg-white/10 text-foreground/40" },
};

export function StatusBadge({ status }: { status: InterventionStatus }) {
  const { label, className } = CONFIG[status] ?? CONFIG.dismissed;
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
```

### Task Group 2 — Activity log page

```typescript
// frontend/app/workspace/activity/page.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/interventions/StatusBadge";
import { useWorkspaceId } from "@/hooks/useWorkspaceId";
import { getInterventions } from "@/lib/api";
import type { Intervention } from "@/lib/types";

const ACTION_LABELS: Record<string, string> = {
  clarify_bet: "Clarify Bet",
  add_hypothesis: "Add Hypothesis",
  add_metric: "Add Metric",
  rescope: "Rescope",
  align_team: "Align Team",
  redesign_experiment: "Redesign Experiment",
  pre_mortem_session: "Pre-Mortem Session",
  jules_instrument_experiment: "Jules: Instrument Experiment",
  jules_add_guardrails: "Jules: Add Guardrails",
  jules_refactor_blocker: "Jules: Refactor Blocker",
  jules_scaffold_experiment: "Jules: Scaffold Experiment",
  kill_bet: "Kill Bet",
  no_intervention: "No Action",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ActivityPage() {
  const workspaceId = useWorkspaceId();
  const router = useRouter();

  const { data: interventions = [], isLoading } = useQuery({
    queryKey: ["interventions", workspaceId],
    queryFn: () => getInterventions(workspaceId),
    refetchInterval: 30_000,
  });

  const sorted = [...interventions]
    .filter((i) => i.action_type !== "no_intervention")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-6 p-8">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-foreground/90">Activity</h1>
          <p className="text-sm text-foreground/50">All agent actions for this workspace.</p>
        </div>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && sorted.length === 0 && (
          <div className="flex h-40 items-center justify-center rounded-xl border border-white/6">
            <p className="text-sm text-foreground/30">No activity yet. Run a pipeline scan to get started.</p>
          </div>
        )}

        {!isLoading && sorted.length > 0 && (
          <div className="space-y-2">
            {sorted.map((item: Intervention) => (
              <button
                key={item.id}
                onClick={() =>
                  router.push(`/workspace/directions/${encodeURIComponent(item.bet_id)}`)
                }
                className="glass-panel w-full rounded-xl p-4 text-left hover:bg-white/5 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5 flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground/85 truncate">
                      {ACTION_LABELS[item.action_type] ?? item.action_type}
                    </p>
                    {item.bet_name && (
                      <p className="text-xs text-foreground/45 truncate">{item.bet_name}</p>
                    )}
                    {item.denial_reason && (
                      <p className="text-xs text-foreground/35 italic">
                        Denied: {item.denial_reason.replace(/_/g, " ")}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <StatusBadge status={item.status} />
                    <span className="text-[10px] text-foreground/30">
                      {formatDate(item.created_at)}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
```

## Design Decisions

- **Filter `no_intervention`**: Audit records are for internal use only. The mission.md constraint is explicit: `no_intervention` records must never appear in founder-facing surfaces.
- **Sort newest-first**: Most recent activity is most relevant to a founder checking in.
- **Click → direction detail**: Each row links to the Direction detail page for the associated bet, giving founders context for the action.
- **30-second refetch**: Consistent with Mission Control's polling cadence.
- **Immutable sort**: `[...interventions].sort(...)` — never mutates the React Query cache array.
