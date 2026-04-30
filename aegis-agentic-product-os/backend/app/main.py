"""FastAPI AG-UI endpoint — exposes Aegis pipeline as AG-UI SSE stream.

Wraps root_agent (SequentialAgent) via ag_ui_adk for CopilotKit integration.

Run:
  cd backend && uv run uvicorn app.main:app --port 8000 --reload

CopilotKit connects to: http://localhost:8000/
"""

import json
import logging
import os
from contextlib import asynccontextmanager
from hashlib import md5

import google.auth

# config.py loads .env before instantiating Config, so LINEAR_API_KEY etc. are
# available in os.environ for all downstream modules (agent.py, linear_tools.py).
from ag_ui_adk import ADKAgent, add_adk_fastapi_endpoint
from fastapi import FastAPI, Header, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from google.adk.artifacts import GcsArtifactService, InMemoryArtifactService
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.agent import conversational_agent
from app.config import config  # singleton — resolves secrets after env is loaded
from app.session_store import get_session_service
from db.engine import close_connector, get_session, is_db_configured

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    await close_connector()

# ─────────────────────────────────────────────
# SHARED ADK SERVICES (externalized for /sessions & /artifacts endpoints)
# ─────────────────────────────────────────────

session_service = get_session_service()

_artifact_bucket = os.environ.get("ARTIFACT_BUCKET")
if _artifact_bucket:
    artifact_service = GcsArtifactService(bucket_name=_artifact_bucket)
    logger.info("Using GcsArtifactService (bucket: %s)", _artifact_bucket)
else:
    artifact_service = InMemoryArtifactService()
    logger.warning(
        "ARTIFACT_BUCKET not set — using InMemoryArtifactService. "
        "Artifacts will be lost on scale-out. Set ARTIFACT_BUCKET for production."
    )

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
    lifespan=lifespan,
)

# CORS: configurable for production. Set ALLOWED_ORIGINS=https://yourapp.com in prod.
_allowed_origins = os.environ.get("ALLOWED_ORIGINS", "*").split(",")
if "*" in _allowed_origins and not os.environ.get("AEGIS_LOCAL_DEV"):
    logger.warning(
        "CORS allows all origins (ALLOWED_ORIGINS=*). "
        "Set ALLOWED_ORIGINS to your frontend URL in production."
    )

_has_wildcard = "*" in _allowed_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=not _has_wildcard,
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
    bet_id: str | None = Query(None),
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
            query = """
                SELECT i.id, i.bet_id, i.workspace_id, i.action_type, i.escalation_level,
                       i.status, i.rejection_reason AS denial_reason,
                       i.rationale, i.confidence, i.created_at, i.decided_at AS resolved_at,
                       i.requires_double_confirm, i.blast_radius,
                       i.proposed_comment, i.proposed_issue_title, i.proposed_issue_description,
                       b.name AS bet_name
                FROM interventions i
                LEFT JOIN bets b ON b.id = i.bet_id
                WHERE i.workspace_id = :wid
            """
            params: dict = {"wid": workspace_id}
            if bet_id is not None:
                query += " AND i.bet_id = :bet_id"
                params["bet_id"] = bet_id
            query += " ORDER BY i.created_at DESC LIMIT 50"
            result = await session.execute(text(query), params)
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
# PIVOT DIAGNOSIS (Feature 010)
# ─────────────────────────────────────────────


class PivotDiagnosisBody(BaseModel):
    scores: list[dict]  # list of PivotPScore dicts


@app.post("/interventions/{intervention_id}/pivot-diagnosis", status_code=201)
async def create_pivot_diagnosis(intervention_id: str, body: PivotDiagnosisBody):
    """Attach a 4Ps pivot diagnosis to an intervention.

    Computes recommendation from scores and persists as JSONB.
    """
    import uuid
    from datetime import datetime, timezone

    from app.app_utils.pivot_scoring import compute_pivot_recommendation
    from models.schema import PivotDiagnosis, PivotPScore

    if len(body.scores) != 4:
        raise HTTPException(
            status_code=422,
            detail="scores must contain exactly 4 items (one per P)",
        )

    # Build PivotPScore objects
    p_scores = [
        PivotPScore(
            p=s["p"],
            label=s.get("label", s["p"].capitalize()),
            confidence=s.get("confidence"),
            founder_note=s.get("founder_note", ""),
            is_weakest=s.get("is_weakest", False),
        )
        for s in body.scores
    ]

    rec, rationale, weakest_p = compute_pivot_recommendation(p_scores)

    # Mark is_weakest
    p_scores_final = [
        s.model_copy(update={"is_weakest": s.p == weakest_p})
        for s in p_scores
    ]

    diagnosis_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    # Resolve bet_id from intervention
    bet_id = intervention_id  # fallback
    if is_db_configured():
        try:
            async with get_session() as session:
                r = await session.execute(
                    text("SELECT bet_id FROM interventions WHERE id = :id"),
                    {"id": intervention_id},
                )
                row = r.fetchone()
                if row is None:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Intervention {intervention_id} not found",
                    )
                bet_id = row[0]
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning(
                "Failed to fetch intervention %s: %s", intervention_id, exc
            )

    diagnosis = PivotDiagnosis(
        id=diagnosis_id,
        intervention_id=intervention_id,
        bet_id=bet_id,
        conducted_at=now,
        scores=p_scores_final,
        recommendation=rec,
        recommendation_rationale=rationale,
        weakest_p=weakest_p,
    )

    if is_db_configured():
        try:
            async with get_session() as session:
                await session.execute(
                    text("""
                        UPDATE interventions
                        SET pivot_diagnosis = :pd::jsonb
                        WHERE id = :id
                    """),
                    {"pd": json.dumps(diagnosis.model_dump()), "id": intervention_id},
                )
        except Exception as exc:
            logger.warning(
                "Failed to save pivot_diagnosis for %s: %s", intervention_id, exc
            )

    return diagnosis.model_dump()


# ─────────────────────────────────────────────
# BET ENDPOINTS (Phase 6 — Bet Declaration flow)
# ─────────────────────────────────────────────

# In-memory fallback for bets when DB is not configured (local dev / CI).
# Shared with the conversational agent's declare_direction tool via bet_store.py
# so bets created via chat AND via the modal both appear in GET /bets.
from app.bet_store import inmemory_bets as _inmemory_bets
from app.services.bet_discovery import discover_bets_from_linear


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
    kill_criteria: dict | None = None


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
        "kill_criteria": body.kill_criteria,
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
    else:
        # No DB — keep bet in process memory so GET /bets reflects it this session
        _inmemory_bets.append(bet)

    return {**bet, "persisted": persisted}


@app.get("/workspace/{workspace_id}")
async def get_workspace_endpoint(workspace_id: str):
    """Return workspace metadata including control_level."""
    from db.repository import get_workspace
    ws = await get_workspace(workspace_id)
    if ws is None:
        return {"id": workspace_id, "control_level": "draft_only"}
    return {"id": ws["id"], "control_level": ws.get("control_level", "draft_only")}


_VALID_CONTROL_LEVELS = frozenset(
    {"draft_only", "require_approval", "autonomous_low_risk"}
)


class WorkspaceUpdateBody(BaseModel):
    control_level: str


@app.patch("/workspace/{workspace_id}")
async def update_workspace_endpoint(workspace_id: str, body: WorkspaceUpdateBody):
    """Update control_level for a workspace."""
    if body.control_level not in _VALID_CONTROL_LEVELS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"control_level must be one of: "
                f"{', '.join(sorted(_VALID_CONTROL_LEVELS))}"
            ),
        )
    from db.repository import update_workspace_control_level

    if not is_db_configured():
        return {"id": workspace_id, "control_level": body.control_level}
    await update_workspace_control_level(workspace_id, body.control_level)
    return {"id": workspace_id, "control_level": body.control_level}


@app.get("/bets")
async def list_bets_endpoint(
    workspace_id: str = Query(...),
    status: str | None = Query(None),
):
    """List bets for a workspace. Falls back to in-memory store when DB not configured."""
    from db.repository import list_bets

    if not is_db_configured():
        # Serve from process-scoped fallback (local dev / CI)
        result = [b for b in _inmemory_bets if b["workspace_id"] == workspace_id]
        if status:
            result = [b for b in result if b["status"] == status]
        return result
    return await list_bets(workspace_id=workspace_id, status=status)


@app.get("/bets/{bet_id}")
async def get_bet_endpoint(bet_id: str):
    """Fetch a single bet by id."""
    from db.repository import get_bet

    if not is_db_configured():
        bet = next((b for b in _inmemory_bets if b["id"] == bet_id), None)
        if not bet:
            raise HTTPException(status_code=404, detail="Bet not found")
        return bet
    bet = await get_bet(bet_id)
    if not bet:
        raise HTTPException(status_code=404, detail=f"Bet {bet_id} not found")
    return bet


@app.get("/brief")
async def get_founder_brief(workspace_id: str = Query(...)):
    """Get the weekly founder brief for a workspace.

    Returns a FounderBrief object with conviction deltas, at-risk bets,
    pending interventions, and a weekly question.
    No LLM calls — always <300ms.
    """
    from app.app_utils.brief_builder import build_founder_brief
    from db.repository import list_bets

    if not workspace_id or workspace_id.strip() == "":
        raise HTTPException(status_code=400, detail="workspace_id required")

    # Load bets
    if is_db_configured():
        bets_raw = await list_bets(workspace_id=workspace_id, status=None)
    else:
        bets_raw = [b for b in _inmemory_bets if b.get("workspace_id") == workspace_id]

    # Load snapshots (newest first per bet)
    snapshots_by_bet: dict = {}
    if is_db_configured():
        try:
            async with get_session() as session:
                for bet in bets_raw:
                    r = await session.execute(
                        text("""
                            SELECT id, bet_id, captured_at, conviction_score, health_score
                            FROM bet_snapshots
                            WHERE bet_id = :bid
                            ORDER BY captured_at DESC
                            LIMIT 10
                        """),
                        {"bid": bet["id"]},
                    )
                    snapshots_by_bet[bet["id"]] = [
                        dict(row._mapping) for row in r
                    ]
        except Exception as exc:
            logger.warning("Failed to load snapshots for brief: %s", exc)

    # Load interventions
    interventions_raw: list = []
    if is_db_configured():
        try:
            async with get_session() as session:
                r = await session.execute(
                    text("""
                        SELECT i.id, i.bet_id, i.action_type, i.status,
                               i.title, i.confidence,
                               b.name AS bet_name
                        FROM interventions i
                        LEFT JOIN bets b ON b.id = i.bet_id
                        WHERE i.workspace_id = :wid AND i.status = 'pending'
                        ORDER BY i.created_at DESC
                        LIMIT 20
                    """),
                    {"wid": workspace_id},
                )
                interventions_raw = [dict(row._mapping) for row in r]
        except Exception as exc:
            logger.warning("Failed to load interventions for brief: %s", exc)

    brief = build_founder_brief(
        workspace_id=workspace_id,
        bets=bets_raw,
        snapshots_by_bet=snapshots_by_bet,
        interventions=interventions_raw,
    )
    return brief.model_dump()


# ─────────────────────────────────────────────
# BET MUTATIONS (edit, archive, acknowledged risks)
# ─────────────────────────────────────────────


class BetUpdateBody(BaseModel):
    """All fields are optional — only provided fields are updated."""

    name: str | None = None
    target_segment: str | None = None
    problem_statement: str | None = None
    hypothesis: str | None = None
    success_metrics: list[dict] | None = None
    time_horizon: str | None = None
    linear_project_ids: list[str] | None = None


@app.patch("/bets/{bet_id}")
async def update_bet_endpoint(bet_id: str, body: BetUpdateBody):
    """Edit mutable fields on an existing bet."""
    from db.repository import get_bet, update_bet

    fields = body.model_dump(exclude_none=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    if not is_db_configured():
        bet = next((b for b in _inmemory_bets if b["id"] == bet_id), None)
        if not bet:
            raise HTTPException(status_code=404, detail="Bet not found")
        idx = next(i for i, b in enumerate(_inmemory_bets) if b["id"] == bet_id)
        _inmemory_bets[idx] = {**bet, **fields}
        return _inmemory_bets[idx]

    ok = await update_bet(bet_id, fields)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Bet {bet_id} not found")
    return await get_bet(bet_id)


@app.post("/bets/{bet_id}/archive")
async def archive_bet_endpoint(bet_id: str):
    """Soft-delete a bet: sets status='archived' and removes it from the workspace
    active_bet_ids array.
    """
    from datetime import datetime, timezone

    from db.repository import archive_bet

    if not is_db_configured():
        bet = next((b for b in _inmemory_bets if b["id"] == bet_id), None)
        if not bet:
            raise HTTPException(status_code=404, detail="Bet not found")
        now_iso = datetime.now(timezone.utc).isoformat()
        idx = next(i for i, b in enumerate(_inmemory_bets) if b["id"] == bet_id)
        _inmemory_bets[idx] = {**bet, "status": "archived", "completed_at": now_iso}
        return {"bet_id": bet_id, "status": "archived"}

    ok = await archive_bet(bet_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Bet {bet_id} not found")

    # Remove from workspace.active_bet_ids
    try:
        async with get_session() as session:
            await session.execute(
                text("""
                    UPDATE workspaces
                    SET active_bet_ids = array_remove(active_bet_ids, :bet_id)
                    WHERE id = (SELECT workspace_id FROM bets WHERE id = :bet_id)
                """),
                {"bet_id": bet_id},
            )
    except Exception as exc:
        logger.warning(
            "Failed to remove bet %s from workspace active_bet_ids: %s", bet_id, exc
        )

    return {"bet_id": bet_id, "status": "archived"}


class AcknowledgedRiskBody(BaseModel):
    risk_type: str
    founder_note: str | None = None


@app.post("/bets/{bet_id}/acknowledged-risks")
async def upsert_acknowledged_risk(bet_id: str, body: AcknowledgedRiskBody):
    """Upsert an acknowledged risk entry on a bet.
    If risk_type already exists the entry is replaced; otherwise appended.
    """
    from datetime import datetime, timezone

    from db.repository import get_bet, update_acknowledged_risks

    now_iso = datetime.now(timezone.utc).isoformat()
    new_entry: dict = {
        "risk_type": body.risk_type,
        "acknowledged_at": now_iso,
        "founder_note": body.founder_note,
    }

    if not is_db_configured():
        bet = next((b for b in _inmemory_bets if b["id"] == bet_id), None)
        if not bet:
            raise HTTPException(status_code=404, detail="Bet not found")
        current = bet.get("acknowledged_risks") or []
        updated_risks = [
            r for r in current if r.get("risk_type") != body.risk_type
        ] + [new_entry]
        idx = next(i for i, b in enumerate(_inmemory_bets) if b["id"] == bet_id)
        _inmemory_bets[idx] = {**bet, "acknowledged_risks": updated_risks}
        return updated_risks

    bet = await get_bet(bet_id)
    if not bet:
        raise HTTPException(status_code=404, detail=f"Bet {bet_id} not found")
    current = bet.get("acknowledged_risks") or []
    if not isinstance(current, list):
        current = []
    updated_risks = [
        r for r in current if r.get("risk_type") != body.risk_type
    ] + [new_entry]
    ok = await update_acknowledged_risks(bet_id, updated_risks)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Bet {bet_id} not found")
    return updated_risks


@app.delete("/bets/{bet_id}/acknowledged-risks/{risk_type}")
async def remove_acknowledged_risk(bet_id: str, risk_type: str):
    """Remove an acknowledged risk entry by risk_type."""
    from db.repository import get_bet, update_acknowledged_risks

    if not is_db_configured():
        bet = next((b for b in _inmemory_bets if b["id"] == bet_id), None)
        if not bet:
            raise HTTPException(status_code=404, detail="Bet not found")
        current = bet.get("acknowledged_risks") or []
        updated_risks = [r for r in current if r.get("risk_type") != risk_type]
        idx = next(i for i, b in enumerate(_inmemory_bets) if b["id"] == bet_id)
        _inmemory_bets[idx] = {**bet, "acknowledged_risks": updated_risks}
        return updated_risks

    bet = await get_bet(bet_id)
    if not bet:
        raise HTTPException(status_code=404, detail=f"Bet {bet_id} not found")
    current = bet.get("acknowledged_risks") or []
    if not isinstance(current, list):
        current = []
    updated_risks = [r for r in current if r.get("risk_type") != risk_type]
    ok = await update_acknowledged_risks(bet_id, updated_risks)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Bet {bet_id} not found")
    return updated_risks


# ─────────────────────────────────────────────
# BET DISCOVERY (auto-detect from Linear issues)
# ─────────────────────────────────────────────


class DiscoverBody(BaseModel):
    workspace_id: str = Field(..., min_length=1, max_length=128)


@app.post("/bets/discover")
async def discover_bets_endpoint(body: DiscoverBody):
    """Scan recent Linear issues and auto-detect strategic directions.

    Uses Gemini Flash to cluster up to 50 issues into 2-5 proposed Bets
    with status=detecting. Deduplicates against existing bets by name.
    Falls back to in-memory store when DB is not configured (local dev).
    """
    from db.repository import list_bets, save_bet

    # Load existing bet names for dedup
    try:
        if is_db_configured():
            existing = await list_bets(body.workspace_id)
        else:
            existing = [b for b in _inmemory_bets if b["workspace_id"] == body.workspace_id]
    except Exception as exc:
        logger.warning("Failed to load existing bets for discovery: %s", exc)
        existing = []

    existing_names = {b["name"].lower() for b in existing}

    new_bets = await discover_bets_from_linear(body.workspace_id, existing_names)

    # Upsert workspace ONCE (not per bet)
    if is_db_configured() and new_bets:
        from db.repository import upsert_workspace
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        await upsert_workspace({
            "id": body.workspace_id,
            "linear_team_id": "",
            "control_level": "draft_only",
            "created_at": now,
        })

    created = []
    skipped = 0
    write_errors = 0
    for bet in new_bets:
        # Double-check dedup (race condition guard)
        if bet["name"].lower() in existing_names:
            skipped += 1
            continue
        if is_db_configured():
            try:
                saved_id = await save_bet(bet)
            except Exception as exc:
                logger.warning("Failed to save discovered bet %s: %s", bet.get("name"), exc)
                saved_id = None
            if saved_id:
                created.append(bet)
            else:
                write_errors += 1
        else:
            _inmemory_bets.append(bet)
            created.append(bet)
        existing_names.add(bet["name"].lower())

    return {"created": created, "skipped_duplicates": skipped, "write_errors": write_errors}


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
    intervention_id: str, body: RejectBody | None = None
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
    reason = (body.reason if body and body.reason in _valid else None) or "other"
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
# SUPPRESSION RULES
# ─────────────────────────────────────────────


@app.get("/suppression-rules")
async def list_suppression_rules_endpoint(
    workspace_id: str = Query(...),
):
    """List active suppression rules for a workspace."""
    if not is_db_configured():
        return []
    from db.repository import list_suppression_rules

    return await list_suppression_rules(workspace_id)


@app.delete("/suppression-rules/{rule_id}")
async def delete_suppression_rule_endpoint(rule_id: str):
    """Remove (unsuppress) a suppression rule by id."""
    if not is_db_configured():
        raise HTTPException(
            status_code=404, detail=f"Suppression rule {rule_id} not found"
        )
    from db.repository import delete_suppression_rule

    ok = await delete_suppression_rule(rule_id)
    if not ok:
        raise HTTPException(
            status_code=404, detail=f"Suppression rule {rule_id} not found"
        )
    return {"deleted": rule_id}


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
        # Priority: explicit title → bet name → first user message
        title = state.get("session_title") or (state.get("bet") or {}).get("name")
        if not title:
            title = _derive_title_from_events(getattr(s, "events", None) or [])
        summaries.append(
            {
                "session_id": s.id,
                "session_title": title,
                "last_update_time": s.last_update_time,
                "created_at": s.last_update_time,
                "pipeline_status": state.get("pipeline_status", "idle"),
                "tags": _derive_session_tags(state),
            }
        )
    return summaries


def _derive_title_from_events(events: list) -> str | None:
    """Extract the first user message from session events as a fallback session title."""
    for event in events:
        if getattr(event, "author", None) != "user":
            continue
        content = getattr(event, "content", None)
        if not content or not getattr(content, "parts", None):
            continue
        text = "".join(
            p.text for p in content.parts if hasattr(p, "text") and p.text
        ).strip()
        if text:
            return text[:55] + ("…" if len(text) > 55 else "")
    return None


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


@app.get("/sessions/{session_id}/messages")
async def get_session_messages(
    session_id: str,
    user_id: str = Query("default_user"),
):
    """Return conversation messages for a session.

    Uses get_session() (not list_sessions) so events are fully populated.
    Returns only user/assistant text turns — skips tool calls and empty events.
    """
    session = await session_service.get_session(
        app_name=ADK_APP_NAME,
        user_id=user_id,
        session_id=session_id,
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    messages = []
    for event in session.events:
        if not event.content or not event.content.parts:
            continue
        # Collect text parts only (skip function_call / function_response)
        text = "".join(
            part.text
            for part in event.content.parts
            if hasattr(part, "text") and part.text
        ).strip()
        if not text:
            continue
        role = "user" if event.author == "user" else "assistant"
        messages.append(
            {
                "id": event.id or str(event.timestamp),
                "role": role,
                "content": text,
                "timestamp": event.timestamp,
            }
        )

    return messages


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
