# Aegis Frontend-Backend Integration Guide

**Note for Frontend Agents (Antigravity/Claude):** 
Use this guide to wire the React/Next.js frontend to the Aegis Agentic Backend.

## 1. API Endpoints
The backend runs FastAPI on port 8000.

| Endpoint | Method | Purpose |
| :--- | :--- | :--- |
| `/health` | `GET` | Dependency health check. Verify this before loading the app. |
| `/taxonomy` | `GET` | Returns the intervention taxonomy. Use this to build UI badges. |
| `/` | `GET/POST` | The CopilotKit/AG-UI SSE stream. Connect via `ADKAgent` hooks. |

## 2. The "Streaming State" Pattern
Agent reasoning is slow (30s+). Do NOT use standard blocking fetches for scans.

### Implementation logic:
1.  **Poll /health:** Ensure `alloydb` and `google_cloud` are `connected`.
2.  **Fetch /taxonomy:** Map `action_type` to UI components:
    - Level 1: Info/Blue (Clarify)
    - Level 2: Warning/Yellow (Adjust)
    - Level 3: Danger/Orange (Escalate)
    - Level 4: Critical/Red (Terminal)
3.  **SSE Sync:** Use the `ag-ui-adk` client-side hooks to listen for `AgentTrace` events.
    - When `agent_name == "signal_engine"`, show "Analyzing Linear Data..."
    - When `agent_name == "product_brain"`, show "Debating Strategy Alignment..."
    - When `pipeline_status == "awaiting_founder_approval"`, trigger the `InterventionApprovalCard`.

## 3. Data Schema (The Law)
Refer to `context/data-schema.ts` for all object shapes.
- **RiskSignal:** `id`, `risk_type`, `confidence`, `headline`, `explanation`.
- **Intervention:** `id`, `action_type`, `escalation_level`, `status`, `blast_radius`.

## 4. Intervention Approval Flow
When a founder clicks "Approve" in the UI:
1.  Call the backend to transition `pipeline_status` from `awaiting_founder_approval` → `founder_approved`.
2.  The `SequentialAgent` will automatically resume at the **Executor** stage.
3.  Listen for the `executor_complete` event in the SSE stream to show a "Success" toast.

## 5. Blast Radius Warning
If `intervention.blast_radius` is present, you MUST render a warning badge or dialog:
> "This action will affect {affected_issue_count} issues."
> If `reversible == false`, use a `shadcn/AlertDialog` for final confirmation.
