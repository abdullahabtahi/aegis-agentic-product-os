# Feature Plan — Workspace ID Injection

## Roadmap Item
Satisfies roadmap item **1. Workspace ID Injection** (`/workspace-id-injection/`)

## Overview

Three frontend pages hardcode `const WORKSPACE_ID = "default_workspace"`. The conversational agent already writes `workspace_id` into AG-UI session state via `declare_bet()`. This feature reads that value from `useCoAgent` state instead of the constant.

## Dependencies

- **No backend changes required.** Backend already sets `workspace_id` in session state.
- **CopilotKit `useCoAgent`** must be accessible in each page component (it is — `Providers.tsx` wraps the whole app in `CopilotKitProvider`).

## Implementation Steps

### Task Group 1 — Shared workspace ID hook

Create a thin hook that reads `workspace_id` from AG-UI state with a safe fallback:

```typescript
// frontend/hooks/useWorkspaceId.ts
"use client";
import { useCoAgent } from "@copilotkit/react-core";
import type { AegisPipelineState } from "@/lib/types";

const FALLBACK_WORKSPACE_ID = "default_workspace";

export function useWorkspaceId(): string {
  const { state } = useCoAgent<AegisPipelineState>({ name: "aegis" });
  return state?.workspace_id ?? FALLBACK_WORKSPACE_ID;
}
```

### Task Group 2 — Patch directions/page.tsx

Replace:
```typescript
const WORKSPACE_ID = "default_workspace";
```
With:
```typescript
const workspaceId = useWorkspaceId();
```
Then replace every downstream use of `WORKSPACE_ID` with `workspaceId`.

### Task Group 3 — Patch directions/[id]/page.tsx

In `DirectionDetailContent` (the inner client component that calls `use(params)`):

Replace:
```typescript
const WORKSPACE_ID = "default_workspace";
```
With:
```typescript
const workspaceId = useWorkspaceId();
```

### Task Group 4 — Patch mission-control/page.tsx

Replace:
```typescript
const WORKSPACE_ID = "default_workspace";
```
With:
```typescript
const workspaceId = useWorkspaceId();
```

## Design Decisions

- **Fallback is correct behavior**: Before any bet is declared in the session, there is no workspace_id in state. The fallback `"default_workspace"` matches the previous hardcoded behavior — no regression.
- **Hook not context**: `useCoAgent` already uses React context internally. A thin wrapper hook is simpler than a separate workspace context.
- **No backend change**: The backend already writes `workspace_id` on `declare_bet()`. This is a pure frontend read.
