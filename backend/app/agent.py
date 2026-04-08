# ruff: noqa
"""Aegis Agent — Unified conversational entry point.

ARCHITECTURE CHANGE (2026-04-07):
- OLD: Separate router → pipeline OR conversational agent
- NEW: Single conversational agent that triggers pipeline via tool

The agent now handles BOTH:
1. Natural conversation (questions, explanations, queries)
2. Pipeline triggering (autonomous risk scans via run_pipeline_scan tool)

No router needed - Gemini 3 Flash is smart enough to decide when to scan vs chat.

Pipeline (CLAUDE.md — strictly sequential, triggered by conversational agent):
  Signal Engine → Product Brain → Coordinator → Governor → Executor

To test interactively:
  make playground      # adk web at localhost:8501
  make eval            # run adk eval against golden traces

To chat naturally or trigger scan:
  User: "hi there" → Agent chats
  User: "scan my bet" → Agent calls run_pipeline_scan() tool

Phase 4: InMemoryArtifactService → swap to GcsArtifactService(bucket_name="aegis-artifacts")
Phase 4: InMemorySessionService  → swap to VertexAiSessionService for production
"""

import os

import google.auth
from google.adk.agents import SequentialAgent
from google.adk.apps import App
from google.adk.artifacts import (
    InMemoryArtifactService,
)  # Phase 4: swap to GcsArtifactService

from app.app_utils.telemetry import setup_telemetry

# Initialize observability (OpenTelemetry + Cloud Trace)
setup_telemetry()

# Import factories — always create fresh instances to avoid ADK eval parent-check errors
from app.agents.conversational import create_conversational_agent
from app.agents.coordinator import create_coordinator_agent
from app.agents.executor import create_executor_agent
from app.agents.governor import create_governor_agent
from app.agents.product_brain import create_product_brain_debate
from app.agents.signal_engine import create_signal_engine_agent

# Resolve GCP project: prefer env var (set by CI/local .env), fall back to ADC.
# Wrapped in try/except so modules that import from `app` (e.g. approval_handler,
# override_teach) can be imported in unit tests without GCP credentials.
if not os.environ.get("GOOGLE_CLOUD_PROJECT"):
    try:
        _, _project_id = google.auth.default()
        os.environ["GOOGLE_CLOUD_PROJECT"] = _project_id or ""
    except google.auth.exceptions.DefaultCredentialsError:
        pass  # credentials not available; agent init will fail at runtime if needed
os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "global")
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "True")

# ─────────────────────────────────────────────
# AEGIS PIPELINE — Sequential (triggered by conversational agent)
# ─────────────────────────────────────────────
# This pipeline is now invoked as a tool by the conversational agent.
# It's kept for backwards compatibility with evals and direct testing.

aegis_pipeline = SequentialAgent(
    name="aegis_pipeline",
    description=(
        "Continuous pre-mortem for startup bets. "
        "Runs: Signal Engine → Product Brain → Coordinator → Governor → Executor."
    ),
    sub_agents=[
        create_signal_engine_agent(),  # Deterministic: reads Linear, computes LinearSignals
        create_product_brain_debate(),  # Debate: Cynic (flash) → Optimist (flash) → Synthesis (pro)
        create_coordinator_agent(),  # LLM: selects intervention
        create_governor_agent(),  # Deterministic: 8 policy checks
        create_executor_agent(),  # Deterministic: executes approved interventions
    ],
)

# ─────────────────────────────────────────────
# ROOT AGENT — Conversational entry point
# ─────────────────────────────────────────────
# This is the new primary agent. It handles both:
# 1. Natural conversation (questions, explanations)
# 2. Pipeline triggering (via run_pipeline_scan tool)

root_agent = create_conversational_agent()

# Legacy: Keep aegis_pipeline for eval tests
# TODO: Update evals to use conversational agent instead

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
    name="app",  # Must match directory name for adk web session routing
)

# Expose artifact_service for use in runner creation (tests, eval, Phase 4)
artifact_service = InMemoryArtifactService()
