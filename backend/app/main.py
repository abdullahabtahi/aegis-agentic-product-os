"""FastAPI AG-UI endpoint — exposes Aegis pipeline as AG-UI SSE stream.

Wraps root_agent (SequentialAgent) via ag_ui_adk for CopilotKit integration.

Run:
  cd backend && uv run uvicorn app.main:app --port 8000 --reload

CopilotKit connects to: http://localhost:8000/
"""

import os
import logging
import json
from hashlib import md5
import google.auth
from fastapi import FastAPI, Response, status, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel
from sqlalchemy import text

# config.py loads .env before instantiating Config, so LINEAR_API_KEY etc. are
# available in os.environ for all downstream modules (agent.py, linear_tools.py).
from ag_ui_adk import ADKAgent, add_adk_fastapi_endpoint

from app.agent import root_agent
from app.config import config  # singleton — resolves secrets after env is loaded
from db.engine import get_session, is_db_configured

logger = logging.getLogger(__name__)


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
    allow_origins=["*"],  # Open for development to avoid port mismatch (3000 vs 3001)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add gzip compression for all responses (60% payload reduction)
app.add_middleware(GZipMiddleware, minimum_size=1000)

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

    # 3. Check Linear API (use config singleton — it resolved from env/GCP Secret Manager)
    api_key = config.LINEAR_API_KEY
    is_mock = os.environ.get("AEGIS_MOCK_LINEAR", "").lower() == "true"
    if is_mock:
        health["dependencies"]["linear_api"] = "mock_mode"
    elif api_key:
        health["dependencies"]["linear_api"] = "configured"
    else:
        health["dependencies"]["linear_api"] = "missing_api_key"
        if not is_mock:
            health["status"] = "unhealthy"

    if health["status"] == "unhealthy":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        
    return health


@app.get("/diag/linear")
async def diagnostic_linear():
    """Diagnostic endpoint to verify Linear API connectivity.
    
    Returns the authenticated user and organization.
    """
    from tools.linear_tools import get_linear_mcp, RealLinearMCP
    client = get_linear_mcp()
    if not isinstance(client, RealLinearMCP):
        return {
            "status": "mock",
            "message": "System is running in MOCK mode (AEGIS_MOCK_LINEAR=true or no API key)."
        }
    return await client.whoami()

@app.get("/taxonomy")
async def get_taxonomy(response: Response):
    """Expose the intervention taxonomy for the frontend to build dynamic UI components."""
    # Static data — cache for 1 hour
    response.headers["Cache-Control"] = "public, max-age=3600, stale-while-revalidate=86400"
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

# ─────────────────────────────────────────────
# INTERVENTION REST ENDPOINTS (read by frontend InboxHook)
# ─────────────────────────────────────────────

from fastapi import Query, HTTPException

@app.get("/interventions")
async def list_interventions(
    response: Response,
    workspace_id: str = Query(...),
    if_none_match: str | None = Header(None, alias="If-None-Match")
):
    """Return pending/recent interventions for a workspace.
    Reads from AlloyDB; returns empty list when DB not configured (local dev).
    Supports ETag-based conditional requests (304 Not Modified).
    """
    from db.engine import is_db_configured
    if not is_db_configured():
        # Local dev without AlloyDB — return empty, not an error
        return []
    try:
        # Repository is bet-scoped; aggregate across all bets for the workspace
        from sqlalchemy import text
        from db.engine import get_session
        async with get_session() as session:
            result = await session.execute(
                text("""
                    SELECT i.id, i.bet_id, i.action_type, i.escalation_level,
                           i.status, i.rejection_reason AS denial_reason,
                           i.rationale, i.confidence, i.created_at, i.decided_at AS resolved_at,
                           i.requires_double_confirm, i.blast_radius,
                           i.proposed_comment, i.proposed_issue_title, i.proposed_issue_description,
                           b.name AS bet_name
                    FROM interventions i
                    LEFT JOIN bets b ON b.id = i.bet_id
                    WHERE i.workspace_id = :wid
                    ORDER BY i.created_at DESC
                    LIMIT 50
                """),
                {"wid": workspace_id},
            )
            rows = [dict(row._mapping) for row in result]

        # Generate ETag from data hash
        data_json = json.dumps(rows, default=str, sort_keys=True)
        etag = f'"{md5(data_json.encode()).hexdigest()}"'

        # Check If-None-Match header for conditional request
        if if_none_match == etag:
            response.status_code = status.HTTP_304_NOT_MODIFIED
            return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers={"ETag": etag})

        # Set cache headers: short TTL (30s), revalidate with ETag
        response.headers["Cache-Control"] = "private, max-age=30, must-revalidate"
        response.headers["ETag"] = etag

        return rows
    except Exception as exc:
        logger.warning("Failed to list interventions for workspace %s: %s", workspace_id, exc)
        return []


class RejectBody(BaseModel):
    reason: str = "other"  # RejectionReasonCategory — default "other" is always valid


@app.post("/interventions/{intervention_id}/approve")
async def approve_intervention_endpoint(intervention_id: str):
    """Mark an intervention accepted.

    Directly updates AlloyDB via update_intervention_status.
    The approval_handler module handles ADK in-memory session state transitions
    (two-invocation model); this REST endpoint is the founder-facing HTTP path.
    """
    from db.repository import update_intervention_status
    if not is_db_configured():
        return {"status": "accepted", "intervention_id": intervention_id, "persisted": False}
    ok = await update_intervention_status(intervention_id, status="accepted")
    if not ok:
        raise HTTPException(status_code=404, detail=f"Intervention {intervention_id} not found or DB error")
    return {"status": "accepted", "intervention_id": intervention_id}


@app.post("/interventions/{intervention_id}/reject")
async def reject_intervention_endpoint(intervention_id: str, body: RejectBody = RejectBody()):
    """Mark an intervention rejected.

    body.reason must be a RejectionReasonCategory value:
      evidence_too_weak | already_handled | not_a_priority | wrong_risk_type | other
    """
    from db.repository import update_intervention_status
    _valid = {"evidence_too_weak", "already_handled", "not_a_priority", "wrong_risk_type", "other"}
    reason = body.reason if body.reason in _valid else "other"
    if not is_db_configured():
        return {"status": "rejected", "intervention_id": intervention_id, "persisted": False}
    ok = await update_intervention_status(intervention_id, status="rejected", rejection_reason=reason)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Intervention {intervention_id} not found or DB error")
    return {"status": "rejected", "intervention_id": intervention_id}


# Mounting ADK routes with the prefix expected by the frontend HttpAgent
add_adk_fastapi_endpoint(app, adk_agent, path="/adk/v1/app")


