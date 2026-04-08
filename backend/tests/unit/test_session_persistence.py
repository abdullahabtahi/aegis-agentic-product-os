"""TDD tests for SQLite session persistence.

Verifies that sessions survive a backend restart (service re-instantiation).
Run with: uv run pytest tests/unit/test_session_persistence.py -v
"""

from __future__ import annotations

import os

import pytest
from google.adk.sessions import DatabaseSessionService

APP_NAME = "app"
USER_ID = "default_user"


@pytest.fixture
def db_url(tmp_path):
    """SQLite URL pointing to a temp file — auto-cleaned by pytest."""
    return f"sqlite+aiosqlite:///{tmp_path}/test_sessions.db"


# ─────────────────────────────────────────────
# TESTS
# ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_session_survives_service_restart(db_url):
    """Core invariant: sessions created before restart are retrievable after."""
    svc1 = DatabaseSessionService(db_url=db_url)
    session = await svc1.create_session(app_name=APP_NAME, user_id=USER_ID)
    session_id = session.id

    # Simulate restart: new service instance, same db file
    svc2 = DatabaseSessionService(db_url=db_url)
    recovered = await svc2.get_session(
        app_name=APP_NAME, user_id=USER_ID, session_id=session_id
    )

    assert recovered is not None, "Session lost after service restart"
    assert recovered.id == session_id


@pytest.mark.asyncio
async def test_session_state_survives_restart(db_url):
    """State written to a session (pipeline_status, workspace_id) persists."""
    svc1 = DatabaseSessionService(db_url=db_url)
    session = await svc1.create_session(
        app_name=APP_NAME,
        user_id=USER_ID,
        state={"workspace_id": "ws-test-123", "pipeline_status": "idle"},
    )
    session_id = session.id

    svc2 = DatabaseSessionService(db_url=db_url)
    recovered = await svc2.get_session(
        app_name=APP_NAME, user_id=USER_ID, session_id=session_id
    )

    assert recovered is not None
    assert recovered.state.get("workspace_id") == "ws-test-123"
    assert recovered.state.get("pipeline_status") == "idle"


@pytest.mark.asyncio
async def test_list_sessions_after_restart(db_url):
    """list_sessions returns previously created sessions after restart."""
    svc1 = DatabaseSessionService(db_url=db_url)
    s1 = await svc1.create_session(app_name=APP_NAME, user_id=USER_ID)
    s2 = await svc1.create_session(app_name=APP_NAME, user_id=USER_ID)

    svc2 = DatabaseSessionService(db_url=db_url)
    result = await svc2.list_sessions(app_name=APP_NAME, user_id=USER_ID)
    ids = {s.id for s in result.sessions}

    assert s1.id in ids
    assert s2.id in ids


@pytest.mark.asyncio
async def test_db_path_from_env(tmp_path, monkeypatch):
    """Session DB path is configurable via AEGIS_SESSION_DB env var."""
    db_file = str(tmp_path / "env_sessions.db")
    monkeypatch.setenv("AEGIS_SESSION_DB", db_file)

    from app.session_store import get_session_service

    svc = get_session_service()

    assert isinstance(svc, DatabaseSessionService)
    session = await svc.create_session(app_name=APP_NAME, user_id=USER_ID)
    assert session.id is not None
    assert os.path.exists(db_file), "SQLite file not created at AEGIS_SESSION_DB path"
