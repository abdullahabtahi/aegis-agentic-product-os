"""FastAPI AG-UI endpoint — exposes Aegis pipeline as AG-UI SSE stream.

Wraps root_agent (SequentialAgent) via ag_ui_adk for CopilotKit integration.

Run:
  cd backend && uv run uvicorn app.main:app --port 8000 --reload

CopilotKit connects to: http://localhost:8000/
"""

import json
import logging
import os
from hashlib import md5

import google.auth

# config.py loads .env before instantiating Config, so LINEAR_API_KEY etc. are
# available in os.environ for all downstream modules (agent.py, linear_tools.py).
from ag_ui_adk import ADKAgent, add_adk_fastapi_endpoint
from fastapi import FastAPI, Header, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from google.adk.artifacts import InMemoryArtifactService
from pydantic import BaseModel
from sqlalchemy import text

from app.agent import conversational_agent
from app.config import config  # singleton — resolves secrets after env is loaded
from app.session_store import get_session_service
from db.engine import get_session, is_db_configured

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────
# SHARED ADK SERVICES (externalized for /sessions & /artifacts endpoints)
# ─────────────────────────────────────────────

session_service = get_session_service()
artifact_service = InMemoryArtifactService()

ADK_APP_NAME = "app"

# ─────────────────────────────────────────────
# AG-UI ADK AGENT WRAPPER
# ─────────────────────────────────────────────

adk_agent = ADKAgent(
    adk_agent=conversational_agent,
    app_name=ADK_APP_NAME,
    # Fix: ag_ui_adk default extractor uses f"thread_user_{thread_id}" but
    # frontend SessionDrawer calls GET /sessions?user_id=default_user.
    # Setting a static user_id ensures sessions are findable by the UI.
    user_id="default_user",
    session_service=session_service,
    artifact_service=artifact_service,
    use_in_memory_services=False,
)

# ─────────────────────────────────────────────
# FASTAPI APP
# ─────────────────────────────────────────────

app = FastAPI(
    title="Aegis AG-UI",
    description="Agentic Product OS — AG-UI SSE endpoint for CopilotKit",
    version="0.1.0",
)

# CORS origins: configurable via ALLOWED_ORIGINS env var (comma-separated).
# Defaults to permissive for local dev; MUST be set in production.
_allowed_origins = os.environ.get("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
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
            "linear_api": "not_configured",
        },
    }

    # 1. Check AlloyDB
    if is_db_configured():
        try:
            async with get_session() as session:
                await session.execute(text("SELECT 1"))
                health["dependencies"]["alloydb"] = "connected"
        except Exception as e:
            health["dependencies"]["alloydb"] = f"error: {e!s}"
            health["status"] = "unhealthy"

    # 2. Check Google Cloud Auth
    try:
        _, project = google.auth.default()
        health["dependencies"]["google_cloud"] = f"connected (project: {project})"
    except Exception as e:
        health["dependencies"]["google_cloud"] = f"error: {e!s}"
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
    from tools.linear_tools import RealLinearMCP, get_linear_mcp

    client = get_linear_mcp()
    if not isinstance(client, RealLinearMCP):
        return {
            "status": "mock",
            "message": "System is running in MOCK mode (AEGIS_MOCK_LINEAR=true or no API key).",
        }
    return await client.whoami()


@app.get("/taxonomy")
async def get_taxonomy(response: Response):
    """Expose the intervention taxonomy for the frontend to build dynamic UI components."""
    # Static data — cache for 1 hour
    response.headers["Cache-Control"] = (
        "public, max-age=3600, stale-while-revalidate=86400"
    )
    return {
        "version": "2.0.0",
        "levels": {
            "1": {
                "name": "Clarify",
                "actions": ["clarify_bet", "add_hypothesis", "add_metric"],
            },
            "2": {
                "name": "Adjust",
                "actions": ["rescope", "align_team", "redesign_experiment"],
            },
            "3": {
                "name": "Escalate",
                "actions": [
                    "pre_mortem_session",
                    "jules_instrument_experiment",
                    "jules_add_guardrails",
                    "jules_refactor_blocker",
                    "jules_scaffold_experiment",
                ],
            },
            "4": {"name": "Terminal", "actions": ["kill_bet"]},
        },
        "description": "Standard intervention taxonomy for Aegis Agentic Product OS.",
    }


# ─────────────────────────────────────────────
# INTERVENTION REST ENDPOINTS (read by frontend InboxHook)
# ─────────────────────────────────────────────

@app.get("/interventions")
async def list_interventions(
    response: Response,
    workspace_id: str = Query(...),
    if_none_match: str | None = Header(None, alias="If-None-Match"),
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
            return Response(
                status_code=status.HTTP_304_NOT_MODIFIED, headers={"ETag": etag}
            )

        # Set cache headers: short TTL (30s), revalidate with ETag
        response.headers["Cache-Control"] = "private, max-age=30, must-revalidate"
        response.headers["ETag"] = etag

        return rows
    except Exception as exc:
        logger.warning(
            "Failed to list interventions for workspace %s: %s", workspace_id, exc
        )
        return []


# ─────────────────────────────────────────────
# BET ENDPOINTS (Phase 6 — Bet Declaration flow)
# ─────────────────────────────────────────────


class BetCreateBody(BaseModel):
    """Minimal fields required to declare a new bet. Defaults applied for optional fields."""

    workspace_id: str
    name: str
    target_segment: str
    problem_statement: str
    hypothesis: str = ""
    success_metrics: list[dict] = []  # [{name, target_value, unit}]
    time_horizon: str = ""  # ISO 8601 date or relative (e.g. "Q2 2026")
    linear_project_ids: list[str] = []


@app.post("/bets", status_code=201)
async def create_bet(body: BetCreateBody):
    """Declare a new strategic bet.

    Auto-creates a workspace record if it doesn't exist yet (idempotent upsert).
    Returns the persisted bet dict. When DB is not configured (local dev),
    returns the bet with persisted=False — still useful for wiring agent state.
    """
    import uuid
    from datetime import datetime, timezone

    from db.repository import save_bet, upsert_workspace

    now = datetime.now(timezone.utc).isoformat()
    bet_id = str(uuid.uuid4())

    bet = {
        "id": bet_id,
        "workspace_id": body.workspace_id,
        "name": body.name,
        "target_segment": body.target_segment,
        "problem_statement": body.problem_statement,
        "hypothesis": body.hypothesis,
        "success_metrics": body.success_metrics,
        "time_horizon": body.time_horizon,
        "linear_project_ids": body.linear_project_ids,
        "declaration_source": {"type": "manual", "raw_artifact_refs": []},
        "declaration_confidence": 1.0,
        "status": "active",
        "health_baseline": {
            "expected_bet_coverage_pct": 0.5,
            "expected_weekly_velocity": 3,
            "hypothesis_required": bool(body.hypothesis),
            "metric_linked_required": len(body.success_metrics) > 0,
        },
        "acknowledged_risks": [],
        "linear_issue_ids": [],
        "doc_refs": [],
        "created_at": now,
        "last_monitored_at": now,
    }

    persisted = False
    if is_db_configured():
        # Ensure workspace exists (no-op if already created)
        await upsert_workspace(
            {
                "id": body.workspace_id,
                "linear_team_id": "",
                "control_level": "draft_only",
                "created_at": now,
            }
        )
        saved_id = await save_bet(bet)
        persisted = saved_id is not None

    return {**bet, "persisted": persisted}


@app.get("/bets")
async def list_bets_endpoint(
    workspace_id: str = Query(...),
    status: str | None = Query(None),
):
    """List bets for a workspace. Returns [] when DB not configured."""
    from db.repository import list_bets

    if not is_db_configured():
        return []
    return await list_bets(workspace_id=workspace_id, status=status)


@app.get("/bets/{bet_id}")
async def get_bet_endpoint(bet_id: str):
    """Fetch a single bet by id."""
    from db.repository import get_bet

    if not is_db_configured():
        raise HTTPException(status_code=503, detail="Database not configured")
    bet = await get_bet(bet_id)
    if not bet:
        raise HTTPException(status_code=404, detail=f"Bet {bet_id} not found")
    return bet


class RejectBody(BaseModel):
    reason: str = "other"  # RejectionReasonCategory — default "other" is always valid


_DEFAULT_REJECT_BODY = RejectBody()


@app.post("/interventions/{intervention_id}/approve")
async def approve_intervention_endpoint(intervention_id: str):
    """Mark an intervention accepted.

    Directly updates AlloyDB via update_intervention_status.
    The approval_handler module handles ADK in-memory session state transitions
    (two-invocation model); this REST endpoint is the founder-facing HTTP path.
    """
    from db.repository import update_intervention_status

    if not is_db_configured():
        return {
            "status": "accepted",
            "intervention_id": intervention_id,
            "persisted": False,
        }
    ok = await update_intervention_status(intervention_id, status="accepted")
    if not ok:
        raise HTTPException(
            status_code=404,
            detail=f"Intervention {intervention_id} not found or DB error",
        )
    return {"status": "accepted", "intervention_id": intervention_id}


@app.post("/interventions/{intervention_id}/reject")
async def reject_intervention_endpoint(
    intervention_id: str, body: RejectBody = _DEFAULT_REJECT_BODY
):
    """Mark an intervention rejected.

    body.reason must be a RejectionReasonCategory value:
      evidence_too_weak | already_handled | not_a_priority | wrong_risk_type | other
    """
    from db.repository import update_intervention_status

    _valid = {
        "evidence_too_weak",
        "already_handled",
        "not_a_priority",
        "wrong_risk_type",
        "other",
    }
    reason = body.reason if body.reason in _valid else "other"
    if not is_db_configured():
        return {
            "status": "rejected",
            "intervention_id": intervention_id,
            "persisted": False,
        }
    ok = await update_intervention_status(
        intervention_id, status="rejected", rejection_reason=reason
    )
    if not ok:
        raise HTTPException(
            status_code=404,
            detail=f"Intervention {intervention_id} not found or DB error",
        )
    return {"status": "rejected", "intervention_id": intervention_id}


# ─────────────────────────────────────────────
# SESSION & ARTIFACT ENDPOINTS (frontend history/artifacts UI)
# ─────────────────────────────────────────────


@app.get("/sessions")
async def list_sessions(user_id: str = Query("default_user")):
    """List ADK sessions for a user. Returns SessionSummary[] matching data-schema.ts."""
    result = await session_service.list_sessions(
        app_name=ADK_APP_NAME,
        user_id=user_id,
    )
    summaries = []
    for s in result.sessions:
        state = s.state or {}
        summaries.append(
            {
                "session_id": s.id,
                "session_title": state.get("session_title")
                or state.get("bet", {}).get("name"),
                "last_update_time": s.last_update_time,
                "created_at": s.last_update_time,
                "pipeline_status": state.get("pipeline_status", "idle"),
                "tags": _derive_session_tags(state),
            }
        )
    return summaries


def _derive_session_tags(state: dict) -> list[str]:
    """Derive display tags from session state for the session history UI."""
    tags: list[str] = []
    if state.get("pipeline_status") and state["pipeline_status"] != "idle":
        tags.append("pipeline")
    if state.get("bet"):
        tags.append("bet")
    if state.get("risk_signal_draft"):
        tags.append("risk")
    if state.get("intervention_proposal"):
        tags.append("intervention")
    return tags


@app.get("/artifacts")
async def list_artifacts(
    user_id: str = Query("default_user"),
    session_id: str | None = Query(None),
):
    """List artifact keys and metadata. Returns ArtifactEntry[] matching data-schema.ts."""
    keys = await artifact_service.list_artifact_keys(
        app_name=ADK_APP_NAME,
        user_id=user_id,
        session_id=session_id,
    )
    entries = []
    for filename in keys:
        versions = await artifact_service.list_versions(
            app_name=ADK_APP_NAME,
            user_id=user_id,
            filename=filename,
            session_id=session_id,
        )
        entries.append(
            {
                "filename": filename,
                "session_id": session_id,
                "versions": versions,
                "latest_version": max(versions) if versions else 0,
                "mime_type": "application/octet-stream",  # InMemoryArtifactService doesn't track MIME
            }
        )
    return entries


@app.get("/artifacts/{filename}")
async def get_artifact(
    filename: str,
    user_id: str = Query("default_user"),
    session_id: str | None = Query(None),
    version: int | None = Query(None),
):
    """Download a specific artifact by filename."""
    part = await artifact_service.load_artifact(
        app_name=ADK_APP_NAME,
        user_id=user_id,
        filename=filename,
        session_id=session_id,
        version=version,
    )
    if part is None:
        raise HTTPException(status_code=404, detail=f"Artifact '{filename}' not found")
    # Return as JSON with inline_data if available, or text
    if hasattr(part, "inline_data") and part.inline_data:
        return Response(
            content=part.inline_data.data,
            media_type=part.inline_data.mime_type or "application/octet-stream",
        )
    if hasattr(part, "text") and part.text:
        return Response(content=part.text, media_type="text/plain")
    return {"artifact": filename, "version": version, "data": str(part)}


# ─────────────────────────────────────────────
# DEBUG ENDPOINT — diagnose agent connectivity issues
# ─────────────────────────────────────────────


@app.get("/debug/ping")
async def debug_ping():
    """Quick connectivity test for frontend health indicator."""
    return {"ok": True, "backend": "aegis"}


@app.get("/debug/agent-test")
async def debug_agent_test():
    """Test that the ADK agent + Gemini auth is working without CopilotKit.
    Returns ok=True if the agent can be invoked, with any error details.
    """
    from google.adk.runners import Runner
    from google.adk.sessions import InMemorySessionService

    try:
        test_session_service = InMemorySessionService()
        session = await test_session_service.create_session(
            app_name="debug", user_id="debug"
        )
        runner = Runner(
            agent=conversational_agent,
            app_name="debug",
            session_service=test_session_service,
        )
        from google.genai import types as genai_types

        events = []
        async for event in runner.run_async(
            user_id="debug",
            session_id=session.id,
            new_message=genai_types.Content(
                role="user",
                parts=[genai_types.Part(text="hello, reply with just 'ok'")],
            ),
        ):
            events.append(event.__class__.__name__)
            if len(events) > 5:
                break
        return {"ok": True, "events": events, "agent": conversational_agent.name}
    except Exception as e:
        logger.error("[debug/agent-test] Failed: %s", e, exc_info=True)
        return {
            "ok": False,
            "error": str(e),
            "hint": "Check GCP auth and GOOGLE_CLOUD_PROJECT env var",
        }


# Mounting ADK routes with the prefix expected by the frontend HttpAgent
add_adk_fastapi_endpoint(app, adk_agent, path="/adk/v1/app")
