# Spec — 006 Pipeline Theater (Judge-Facing Observability)

**Created:** April 2026
**Status:** Open
**Priority:** HIGH — hackathon judge visibility

## Context

The Aegis 5-stage agentic pipeline (Signal Engine → Product Brain → Coordinator → Governor → Executor) is fully functional but invisible unless a judge knows to type specific chat commands. The Product Brain debate (Cynic vs. Optimist vs. Synthesis) — the most technically differentiating feature — is completely hidden in session state and never rendered.

This spec replaces the home page with a **Pipeline Theater**: a live, always-on view of the pipeline that makes the agentic architecture immediately obvious. Chat remains accessible from the left navigation.

---

## User Stories

### US-01: Pipeline as landing page centrepiece
As a judge, when I open the app I immediately see the 5-stage pipeline with named stages, their live status, and stage descriptions — without reading any docs.

**Acceptance Scenarios:**
- Given pipeline is idle → all 5 stages show "IDLE" with soft indicators
- Given scan is running → the currently active stage pulses; prior stages show "COMPLETE"
- Given scan completes → all stages show "COMPLETE" with elapsed times

---

### US-02: Product Brain debate visible
As a judge, I want to see the Cynic vs. Optimist adversarial debate that the Product Brain runs, not just the final risk signal.

**Acceptance Scenarios:**
- Given a scan completed → Stage 2 (Product Brain) card has an expand chevron
- Given expanded → Cynic assessment shown (risk_type, confidence, key_concerns)
- Given expanded → Optimist assessment shown (risk_type, confidence, mitigating_factors)
- Given expanded → Synthesis verdict shown (final classification + confidence + classification_rationale)
- Given no scan yet → debate panel shows "(run a scan to see the debate)"

---

### US-03: Governor 8-check checklist visible
As a judge, I want to see the Governor's deterministic policy checks so I understand this is NOT an LLM making arbitrary decisions.

**Acceptance Scenarios:**
- Given scan completed + Governor ran → Stage 4 card shows expand chevron
- Given expanded → all 8 checks listed with pass/fail icons
- Given a check failed → that check highlighted in red with denial reason
- Given no scan yet → checklist shows placeholder state

---

### US-04: One-click scan from a direction card
As a judge, I want to trigger a full pipeline scan on a specific direction without typing — one click only.

**Acceptance Scenarios:**
- Given active directions exist → each direction card has a "Scan ▶" button
- Given "Scan ▶" clicked → pipeline stages begin updating (signal_engine → running)
- Given scan in progress → "Scan ▶" button disabled with spinner
- Given no Linear connection → scan still triggers (mock mode); pipeline runs with stub signals

---

### US-05: Chat accessible from left nav
As a judge, I want to access the full conversational AI from the left navigation sidebar without losing it.

**Acceptance Scenarios:**
- Given any page → left nav has a "Chat" item with MessageSquare icon
- Given Chat nav item clicked → navigates to `/workspace/chat`
- Given `/workspace/chat` → full hero + chat mode exactly as before this spec
- Given session history item selected → navigates to `/workspace/chat?session=<id>`

---

## Functional Requirements

| ID | Requirement |
|---|---|
| FR-001 | `cynic_assessment` and `optimist_assessment` forwarded from sub-pipeline to parent tool_context state |
| FR-002 | `cynic_assessment` and `optimist_assessment` typed in `AegisPipelineState` |
| FR-003 | `/workspace/page.tsx` replaced with Pipeline Theater (5-stage layout) |
| FR-004 | `/workspace/chat/page.tsx` created with existing chat/hero functionality |
| FR-005 | `Sidebar.tsx` adds Chat nav item (MessageSquare icon, `/workspace/chat`) |
| FR-006 | `GlassmorphicLayout.tsx` session history navigation points to `/workspace/chat` |
| FR-007 | Stage 2 (Product Brain) card shows expandable DebatePanel |
| FR-008 | Stage 4 (Governor) card shows expandable GovernorChecklist |
| FR-009 | Direction cards on theater page have "Scan ▶" button using `useChatController.sendMessage` |
| FR-010 | No fake/hardcoded data — all panels show real pipeline state or placeholder |

---

## Non-Goals (out of scope)

- Real-time per-agent streaming within the sub-pipeline (requires backend SSE refactor)
- New backend endpoints
- Changes to agent logic
- Changes to chat functionality
