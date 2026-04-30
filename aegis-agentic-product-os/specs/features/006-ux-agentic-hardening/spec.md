# Strategic Direction Hardening — UX Spec 006

This spec addresses the findings from the April 29 E2E audit. The goal is to move the Aegis UI from a "passive chat" experience to a "proactive Agentic OS" experience by hardening the presence of agentic state across all primary surfaces.

## Audit Findings Addressed

| Finding | Description | Priority | Spec ID |
|---|---|---|---|
| **UX-01** | The sidebar feels like a standard chatbot (Chat/Directions/Settings). | High | R-001 |
| **UX-02** | Proactive interventions are "hidden" in the chat history or separate directions list. | High | R-002 |
| **UX-03** | The Home page is too "static" (feature cards) instead of reflecting the live workspace state. | High | R-003 |
| **UX-04** | It's unclear how to trigger a "Scan" for a specific direction without a chat prompt. | Medium | R-005 |
| **UX-05** | Health scores (88, 35) feel arbitrary without derivation logic visible. | Medium | R-008 |
| **UX-06** | Empty states for Activity and Inbox are unguided. | Low | R-009 |

---

## Functional Requirements

### R-001: Navigation Revamp
The sidebar must prioritize agentic feedback loops.
- **Add Inbox**: A central destination for all "Awaiting Approval" interventions.
- **Add Activity**: A live log of all agentic actions (scans, signal detections, approvals).
- **Remove Settings**: Move settings to a secondary location (profile menu or separate route) to focus on operational clarity.
- **Badge**: The "Inbox" item must show a red numeric badge if there are pending interventions.

### R-002: Mission Control (Home Page)
The `/workspace` home page should be a live "Mission Control" center.
- **Live Stat Cards**:
    - **Active Directions**: Count of active bets.
    - **Pending Approvals**: Count of pending interventions.
    - **Last Scan**: Timestamp of the most recent pipeline run across all bets.
- **Pipeline Strip**: Display a 5-stage status indicator (Signal → Brain → Coord → Gov → Exec) reflecting the *last* or *current* global pipeline state.
- **Remove Feature Cards**: Replace the static "What is Aegis?" cards with actual workspace data.

### R-003: Pipeline Theater
The pipeline execution (Phase 7) must be high-visibility.
- **Theater Card**: A dedicated UI section on the Home page that visualizes the 5-stage pipeline with live status (idle/running/complete/error).
- **Expansion**: The "Product Brain" (Stage 2) and "Governor" (Stage 4) cards must be expandable to show the Cynic/Optimist debate and the Policy Checklist respectively.

### R-004: Direct Actions
Users should be able to trigger the agentic loop without typing.
- **"Scan for risks" button**: Added to the Header of the Direction Detail page.
- **"Scan all" button**: Added to the Mission Control dashboard.
- **One-click Scan**: Each direction card on the home page gets a "Scan ▶" button.

### R-005: Health Score Hardening
Health scores must be derived from the actual risk state, not just static placeholders.
- **Deterministic Mapping**:
    - `0–30`: Critical (Kill criteria triggered or high severity unaddressed risk).
    - `31–60`: Warning (Pending intervention or medium severity risk).
    - `61–84`: Developing (Acknowledged risks or minor staleness).
    - `85–100`: Healthy (Recent scan + no unaddressed risks).
- **Timestamp Display**: Always show "Last monitored X hours ago" near the health score.

---

## Technical Implementation

### Frontend Routing
- `/workspace`: Mission Control (Live Dashboard)
- `/workspace/directions`: List of Bets
- `/workspace/directions/[id]`: Bet Detail
- `/workspace/inbox`: Pending Interventions (Filter of listInterventions)
- `/workspace/activity`: Action Log (Filter of listInterventions)

### State Management
- `useAgentStateSync`: Used to pull global pipeline state (CopilotKit AG-UI state).
- `useInterventions`: Hook to fetch all interventions across all bets for the badge count.
- `useWorkspaceId`: Centralized workspace context.

---

## Visual Design

- **Density**: Transition from "Spacious Chat" to "High-Density Dashboard".
- **Visual Feedback**: Use subtle animations (pulse for scanning) and glassmorphic layers to indicate "Agent is working".
- **Color Cues**:
    - Indigo: Agent Processing
    - Emerald: Success / Passing Policies
    - Amber: Warning / Pending Review
    - Red: Risk / Policy Violation
