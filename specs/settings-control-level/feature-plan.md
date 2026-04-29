# Feature Plan — Settings Page: Control Level

## Roadmap Item
Satisfies roadmap item **3. Settings Page — Control Level** (`/settings-control-level/`)

## Overview

Replace the empty Settings stub with three option cards (L1/L2/L3). Selecting a level sends a CopilotKit chat message that triggers the existing `adjust_autonomy()` tool on the backend. The backend also persists `control_level` to the `Workspace` row in the database (plugging the TODO at `conversational.py:559`).

## Dependencies

- **Control Level Persistence** (feature 5) should be implemented alongside or after this feature. Without it, the selected level is lost on page reload.
- `AegisPipelineState.control_level` needs to be added to the frontend type (it's already in session state on the backend but not typed on the frontend).
- The `adjust_autonomy` backend tool already exists and works via chat.

## Implementation Steps

### Task Group 1 — Add control_level to AegisPipelineState

```typescript
// frontend/lib/types.ts — add to AegisPipelineState
export type ControlLevel = "draft_only" | "require_approval" | "autonomous_low_risk";

export interface AegisPipelineState {
  // ... existing fields ...
  control_level?: ControlLevel;
}
```

### Task Group 2 — Settings page component

```typescript
// frontend/app/workspace/settings/page.tsx
"use client";

import { AppShell } from "@/components/layout/AppShell";
import { useCoAgent, useCopilotChat } from "@copilotkit/react-core";
import type { AegisPipelineState, ControlLevel } from "@/lib/types";

const LEVELS: Array<{
  value: ControlLevel;
  label: string;
  description: string;
  badge: string;
}> = [
  {
    value: "draft_only",
    label: "Draft Only",
    description: "Aegis drafts all interventions. You review and approve every action before anything touches Linear.",
    badge: "L1",
  },
  {
    value: "require_approval",
    label: "Require Approval",
    description: "Low-escalation actions (L1/L2) are auto-applied. L3+ actions always require your approval.",
    badge: "L2",
  },
  {
    value: "autonomous_low_risk",
    label: "Autonomous Low Risk",
    description: "Aegis handles routine L1 actions autonomously. High-risk and L3+ actions still require approval.",
    badge: "L3",
  },
];

export default function SettingsPage() {
  const { state } = useCoAgent<AegisPipelineState>({ name: "aegis" });
  const { appendMessage } = useCopilotChat();
  const current = state?.control_level ?? "draft_only";

  function handleSelect(level: ControlLevel) {
    if (level === current) return;
    appendMessage({
      id: `set-autonomy-${Date.now()}`,
      role: "user",
      content: `Set autonomy level to ${level}`,
    });
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-6 p-8">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-foreground/90">Autonomy Settings</h1>
          <p className="text-sm text-foreground/50">Control how much Aegis acts on your behalf.</p>
        </div>
        <div className="space-y-3">
          {LEVELS.map((l) => {
            const isActive = current === l.value;
            return (
              <button
                key={l.value}
                onClick={() => handleSelect(l.value)}
                className={`w-full rounded-xl border p-4 text-left transition-all ${
                  isActive
                    ? "border-indigo-500/60 bg-indigo-500/10"
                    : "border-white/8 bg-white/3 hover:border-white/15"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="rounded-md bg-indigo-500/15 px-2 py-0.5 text-xs font-bold text-indigo-400">
                    {l.badge}
                  </span>
                  <span className="text-sm font-medium text-foreground/90">{l.label}</span>
                  {isActive && (
                    <span className="ml-auto text-xs text-indigo-400">Active</span>
                  )}
                </div>
                <p className="mt-2 text-xs text-foreground/50 leading-relaxed">{l.description}</p>
              </button>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
```

### Task Group 3 — Backend persistence (conversational.py:559 TODO)

In `backend/app/agents/conversational.py`, in `adjust_autonomy()`, replace:
```python
# TODO: Update workspace.control_level in AlloyDB
tool_context.state["control_level"] = control_level
```
With:
```python
tool_context.state["control_level"] = control_level
from db.repository import upsert_workspace
await upsert_workspace(
    workspace_id=tool_context.state.get("workspace_id", "default_workspace"),
    control_level=control_level,
)
```

Add `upsert_workspace` to `backend/db/repository.py` if not present:
```python
async def upsert_workspace(workspace_id: str, control_level: str) -> None:
    async with get_session() as session:
        stmt = (
            insert(WorkspaceModel)
            .values(id=workspace_id, control_level=control_level)
            .on_conflict_do_update(
                index_elements=["id"],
                set_={"control_level": control_level},
            )
        )
        await session.execute(stmt)
        await session.commit()
```

## Design Decisions

- **Chat message trigger, not direct REST call**: The Settings page sends a chat message instead of calling a new REST endpoint. This ensures the `adjust_autonomy()` tool is the single point of truth for level changes — the same code path used when the founder adjusts autonomy via chat.
- **Read from AG-UI state, not REST**: `control_level` is already in AG-UI session state after any chat interaction. Reading it from `useCoAgent` avoids a new REST endpoint.
- **L1/L2/L3 framing**: Shown as badge labels (L1/L2/L3) for scannability in the UI, with full prose descriptions explaining what each level means.
