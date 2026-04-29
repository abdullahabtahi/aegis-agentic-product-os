<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

## Aegis Frontend — Coding Agent Guide

### Key Hooks (use these — not ad-hoc state)

| Hook | Purpose | Critical Rule |
|---|---|---|
| `useWorkspaceId()` | Single source of workspace ID | Uses `\|\|` not `??` — catches empty string |
| `useCoAgent<AegisPipelineState>({ name: "aegis" })` | AG-UI state sync | Only read agent state via this hook |
| `useCopilotChatInternal` | Send messages to agent | NOT `useCopilotChat` — see `useChatController.ts` |
| `useQuery` | All data fetching | Always add `enabled: !!workspaceId && workspaceId !== FALLBACK_ID` |

### Layout Rule

Every page under `app/workspace/` gets its sidebar from `GlassmorphicLayout`.  
**Do NOT wrap in `<AppShell>`** — that produces a double sidebar. See spec [004](../../spec/features/004-ui-layout-stubs/tasks.md).

### `PipelineStatus` enum

The only valid values are: `"scanning" | "complete" | "error" | "awaiting_approval" | "approved"`  
Old names (`awaiting_founder_approval`, `executed`, `founder_approved`) are bugs. See spec [002](../../spec/features/002-pipeline-state-fixes/).

### Type-check before committing

```bash
npm run build    # type-check without starting server
npm run lint     # ESLint
```

