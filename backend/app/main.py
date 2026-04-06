"""FastAPI AG-UI endpoint — exposes Aegis pipeline as AG-UI SSE stream.

Wraps root_agent (SequentialAgent) via ag_ui_adk for CopilotKit integration.

Run:
  cd backend && uv run uvicorn app.main:app --port 8000 --reload

CopilotKit connects to: http://localhost:8000/
"""

import os
import google.auth
from fastapi import FastAPI, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from ag_ui_adk import ADKAgent, add_adk_fastapi_endpoint

from app.agent import root_agent
from db.engine import get_session, is_db_configured

# ─────────────────────────────────────────────
# AG-UI ADK AGENT WRAPPER
# ─────────────────────────────────────────────

adk_agent = ADKAgent(
    adk_agent=root_agent,
    app_name="app",
    use_in_memory_services=True,
)

# ─────────────────────────────────────────────
# FASTAPI APP
# ─────────────────────────────────────────────

app = FastAPI(
    title="Aegis AG-UI",
    description="Agentic Product OS — AG-UI SSE endpoint for CopilotKit",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────
# HEALTH & TAXONOMY ENDPOINTS
# ─────────────────────────────────────────────

@app.get("/health")
async def health_check(response: Response):
    """Deep health check for cloud readiness (AlloyDB, Google Cloud, Linear)."""
    health = {
        "status": "healthy",
        "dependencies": {
            "alloydb": "not_configured",
            "google_cloud": "failed",
            "linear_api": "not_configured"
        }
    }
    
    # 1. Check AlloyDB
    if is_db_configured():
        try:
            async with get_session() as session:
                await session.execute(text("SELECT 1"))
                health["dependencies"]["alloydb"] = "connected"
        except Exception as e:
            health["dependencies"]["alloydb"] = f"error: {str(e)}"
            health["status"] = "unhealthy"

    # 2. Check Google Cloud Auth
    try:
        _, project = google.auth.default()
        health["dependencies"]["google_cloud"] = f"connected (project: {project})"
    except Exception as e:
        health["dependencies"]["google_cloud"] = f"error: {str(e)}"
        health["status"] = "unhealthy"

    # 3. Check Linear API
    api_key = os.environ.get("LINEAR_API_KEY")
    is_mock = os.environ.get("AEGIS_MOCK_LINEAR", "").lower() == "true"
    if is_mock:
        health["dependencies"]["linear_api"] = "mock_mode"
    elif api_key:
        health["dependencies"]["linear_api"] = "configured"
    else:
        health["dependencies"]["linear_api"] = "missing_api_key"
        # Not a fatal error if Mock mode is expected, but worth flagging
        if not is_mock:
            health["status"] = "unhealthy"

    if health["status"] == "unhealthy":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        
    return health

@app.get("/taxonomy")
async def get_taxonomy():
    """Expose the intervention taxonomy for the frontend to build dynamic UI components."""
    return {
        "version": "2.0.0",
        "levels": {
            "1": {"name": "Clarify", "actions": ["clarify_bet", "add_hypothesis", "add_metric"]},
            "2": {"name": "Adjust", "actions": ["rescope", "align_team", "redesign_experiment"]},
            "3": {"name": "Escalate", "actions": ["pre_mortem_session", "jules_instrument_experiment", "jules_add_guardrails", "jules_refactor_blocker", "jules_scaffold_experiment"]},
            "4": {"name": "Terminal", "actions": ["kill_bet"]}
        },
        "description": "Standard intervention taxonomy for Aegis Agentic Product OS."
    }

add_adk_fastapi_endpoint(app, adk_agent, path="/")
