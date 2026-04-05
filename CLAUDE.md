# Product OS — Hackathon Brain

## What this is
Continuous Pre-mortem / Risk Radar: a multi-agent system that watches Linear for
strategy/execution misalignment and surfaces early risk signals with bounded corrective actions.

## Always read first
- `context/data-schema.ts` — TypeScript interfaces are the source of truth for all entities.
  Never invent field names. If a field isn't there, add it to the schema first.
- `context/agent-architecture.md` — three-agent design (Execution / Product Brain / Coordinator).
  Understand agent boundaries before writing any agent code.

## Load on demand (do NOT auto-load)
| Task | Read |
|------|------|
| Frontend work (AG-UI, CopilotKit, React Flow) | `context/frontend-integration.md` + `../../ag-ui-docs.txt` (grep only) |
| Backend / ADK agent work | `context/agent-architecture.md` + `/adk-cheatsheet` skill |
| Product decisions / UX copy | `context/product-principles.md` |
| Full product spec / feature scope | `context/DESIGN_SPEC.md` |
| Storage / AlloyDB / Vertex Memory | `context/tech-stack.md` §Storage |

## Folder structure (scaffold targets)
```
productos/
├── CLAUDE.md                  ← you are here
├── context/                   ← brain (read before coding)
│   ├── DESIGN_SPEC.md
│   ├── data-schema.ts
│   ├── agent-architecture.md
│   ├── tech-stack.md
│   ├── frontend-integration.md
│   └── product-principles.md
├── backend/                   ← ADK agents, FastAPI, MCP tools (scaffold later)
└── frontend/                  ← React, CopilotKit, AG-UI, React Flow (scaffold later)

## AG-UI Integration

Full protocol reference is in `ag-ui-docs.txt`. Do NOT load it automatically.
When an AG-UI task comes up, read only the relevant section using grep/search rather than loading the whole file.
```

## Hard constraints
- **Never mutate objects in place.** Always return new copies.
- **Schema first.** Any new field goes in `data-schema.ts` before implementation.
- **Bounded Linear writes only.** Only operations defined in `LinearAction` interface are permitted.
- **TDD for deterministic code** (parsers, classifiers, schema validators).
  ADK evals (not pytest) for agent behavior.
- **Gemini 3 series only** for new agents: `gemini-3-flash-preview` or `gemini-3-pro-preview`.
- **No chatbot UI.** Structured AG-UI surfaces and CopilotKit approvals only.

## Current phase
Research ✅ → Concept ✅ → **Schema designed ✅** → Scaffold → Build → Eval → Deploy
