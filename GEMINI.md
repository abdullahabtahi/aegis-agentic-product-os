# Aegis — Agentic Product OS

Aegis is a "continuous pre-mortem" system designed for startup founders to detect execution slippage and strategic drift before they lead to missed quarterly goals. It connects to Linear, analyzes project signals, and proposes specific interventions to keep "bets" on track.

## Project Overview

- **Purpose:** Provide founders with high-leverage insights and interventions for their product bets.
- **Core Loop:** Signal Engine (Metrics) → Product Brain (AI Debate) → Coordinator (Intervention Selection) → Governor (Policy Checks) → Executor (Action).
- **Key Technologies:**
    - **Backend:** Python 3.10+, Google ADK (Agent Development Kit), FastAPI, `uv` for package management.
    - **LLMs:** Google Gemini 3 Flash (workers/debate) and Gemini 3 Pro (synthesis).
    - **Frontend:** Next.js 16, React 19, TypeScript, Tailwind v4, CopilotKit (Agent-UI bridge).
    - **Integrations:** Linear API (via MockLinearMCP/RealLinearMCP).

## Architecture: The 5-Stage Pipeline

Aegis uses a strictly sequential pipeline where each stage feeds the next:

1.  **Signal Engine (Deterministic):** Reads Linear data and computes project health metrics (rollover rates, coverage, etc.). No LLM involved.
2.  **Product Brain (LLM Debate):** A multi-agent debate (Cynic vs. Optimist) synthesized by a Pro model into a `RiskSignal`.
3.  **Coordinator (LLM):** Selects exactly one intervention from a predefined taxonomy (L1 Clarify → L4 Terminal).
4.  **Governor (Deterministic):** Runs 8 non-negotiable policy checks (confidence floor, rate caps, etc.). No LLM.
5.  **Executor (Deterministic):** Executes the approved action (Linear comment, new issue, etc.) after human-in-the-loop (HITL) approval.

## Quick Start

### Backend (Python)
```bash
cd backend
cp .env.example .env            # Configure GCP Project & Location
make install                    # Install dependencies via uv
make playground                 # Start ADK playground at http://localhost:8501
```

### Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev                     # Start dev server at http://localhost:3000
```

### Testing & Validation
```bash
cd backend
make test                       # Run 118+ unit & integration tests
make eval-all                   # Run all 5 golden agent eval traces
```

## Development Conventions

- **Schema First:** All data changes must be reflected in `context/data-schema.ts` before implementation.
- **Immutability:** Never mutate objects in place; always return fresh copies.
- **Strict Sequence:** The pipeline must remain sequential (Signal → Brain → Coord → Gov → Exec).
- **Deterministic Governor:** The Governor agent must remain 100% deterministic (no LLM).
- **Model Usage:** Use `gemini-3-flash-preview` for worker/debate tasks and `gemini-3-pro-preview` for synthesis.
- **Mocking:** Always use `MockLinearMCP` for development and evals to avoid live writes.

## Repository Structure

- `backend/app/agents/`: Individual agent implementations.
- `backend/app/agent.py`: Root pipeline and conversational entry point.
- `frontend/app/workspace/`: Main UI pages (Mission Control, Inbox, Directions).
- `context/`: Source-of-truth documentation (Architecture, Schema, Design Spec).
- `backend/tests/eval/evalsets/`: Golden traces for agent behavior validation.

## Important Constraints

- **Governor Policy:** 8 checks: confidence_floor, duplicate_suppression, rate_cap, jules_gate, reversibility, acknowledged_risk, control_level, escalation_ladder.
- **HITL:** Every external write to Linear *must* be approved by the user in the UI.
- **ADK Location:** `GOOGLE_CLOUD_LOCATION` must be set to `global`.

---
*For more detailed technical specs, refer to `context/agent-architecture.md` and `CLAUDE.md`.*
