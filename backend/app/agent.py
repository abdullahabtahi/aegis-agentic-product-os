# ruff: noqa
"""Aegis Pipeline — SequentialAgent root entry point.

Pipeline (CLAUDE.md — strictly sequential, no parallelism between stages):
  Signal Engine → Product Brain → Coordinator → Governor

Each stage reads from and writes to ctx.session.state.
State flows: bet + workspace_id → linear_signals → risk_signal_draft → intervention_proposal → governor_decision

To test interactively:
  make playground      # adk web at localhost:8501
  make eval            # run adk eval against golden traces

To trigger a scan, send a message with session state pre-loaded:
  {"workspace_id": "ws-001", "bet": {...}, "workspace": {...}}

Phase 4: InMemoryArtifactService → swap to GcsArtifactService(bucket_name="aegis-artifacts")
Phase 4: InMemorySessionService  → swap to VertexAiSessionService for production
"""

import os

import google.auth
from google.adk.agents import SequentialAgent
from google.adk.apps import App
from google.adk.artifacts import InMemoryArtifactService  # Phase 4: swap to GcsArtifactService

# Import individual agents
from app.agents.coordinator import coordinator_agent
from app.agents.governor import governor_agent
from app.agents.product_brain import product_brain_agent
from app.agents.signal_engine import signal_engine_agent

_, project_id = google.auth.default()
os.environ["GOOGLE_CLOUD_PROJECT"] = project_id
os.environ["GOOGLE_CLOUD_LOCATION"] = "global"
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"

# ─────────────────────────────────────────────
# AEGIS PIPELINE — Sequential, no parallelism
# ─────────────────────────────────────────────
# sub_agents run in order. Each agent's output_key writes to session state
# which the next agent reads via {state_key} in its instruction.

aegis_pipeline = SequentialAgent(
    name="aegis_pipeline",
    description=(
        "Continuous pre-mortem for startup bets. "
        "Runs: Signal Engine → Product Brain → Coordinator → Governor."
    ),
    sub_agents=[
        signal_engine_agent,   # Deterministic: reads Linear, computes LinearSignals
        product_brain_agent,   # LLM: classifies risk, generates copy
        coordinator_agent,     # LLM: selects intervention
        governor_agent,        # Deterministic: 8 policy checks
    ],
)

# root_agent is required by adk web / adk eval
root_agent = aegis_pipeline

# ─────────────────────────────────────────────
# APP — entry point for adk web playground
# ─────────────────────────────────────────────
# artifact_service lives on Runner (not App).
# For programmatic use and tests, wire it there:
#
#   from google.adk.runners import Runner
#   from google.adk.sessions import InMemorySessionService
#   runner = Runner(
#       agent=root_agent,
#       app_name="aegis",
#       session_service=InMemorySessionService(),
#       artifact_service=InMemoryArtifactService(),  # Phase 4: GcsArtifactService
#   )

app = App(
    root_agent=root_agent,
    name="aegis",
)

# Expose artifact_service for use in runner creation (tests, eval, Phase 4)
artifact_service = InMemoryArtifactService()
