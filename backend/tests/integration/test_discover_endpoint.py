"""Integration test for POST /bets/discover.

Run with: cd backend && uv run pytest tests/integration/test_discover_endpoint.py -v
"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from app.main import app
    return TestClient(app)


@pytest.fixture
def mock_discovery_returns_two_bets():
    """Patch discover_bets_from_linear to return 2 fake bets."""
    import uuid
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    bets = [
        {
            "id": str(uuid.uuid4()),
            "workspace_id": "ws-test",
            "name": "Voice-first workflows",
            "target_segment": "",
            "problem_statement": "Decisions are lost.",
            "hypothesis": "We believe voice input reduces documentation time.",
            "success_metrics": [],
            "time_horizon": "",
            "linear_project_ids": [],
            "declaration_source": {"type": "agent_inferred", "raw_artifact_refs": []},
            "declaration_confidence": 0.7,
            "status": "detecting",
            "health_baseline": {
                "expected_bet_coverage_pct": 0.5,
                "expected_weekly_velocity": 3,
                "hypothesis_required": True,
                "metric_linked_required": False,
            },
            "acknowledged_risks": [],
            "linear_issue_ids": [],
            "doc_refs": [],
            "created_at": now,
            "last_monitored_at": now,
        },
        {
            "id": str(uuid.uuid4()),
            "workspace_id": "ws-test",
            "name": "Async decision log",
            "target_segment": "",
            "problem_statement": "Context is scattered.",
            "hypothesis": "We believe async logging increases alignment.",
            "success_metrics": [],
            "time_horizon": "",
            "linear_project_ids": [],
            "declaration_source": {"type": "agent_inferred", "raw_artifact_refs": []},
            "declaration_confidence": 0.7,
            "status": "detecting",
            "health_baseline": {
                "expected_bet_coverage_pct": 0.5,
                "expected_weekly_velocity": 3,
                "hypothesis_required": True,
                "metric_linked_required": False,
            },
            "acknowledged_risks": [],
            "linear_issue_ids": [],
            "doc_refs": [],
            "created_at": now,
            "last_monitored_at": now,
        },
    ]
    return bets


def test_discover_bets_no_db(client, mock_discovery_returns_two_bets):
    """POST /bets/discover returns created bets and appends to inmemory store."""
    with patch(
        "app.main.discover_bets_from_linear",
        new=AsyncMock(return_value=mock_discovery_returns_two_bets),
    ):
        response = client.post(
            "/bets/discover",
            json={"workspace_id": "ws-test"},
        )

    assert response.status_code == 200
    data = response.json()
    assert "created" in data
    assert "skipped_duplicates" in data
    assert len(data["created"]) == 2
    assert data["skipped_duplicates"] == 0
    assert data["created"][0]["status"] == "detecting"
    assert data["created"][0]["workspace_id"] == "ws-test"


def test_discover_bets_returns_empty_when_no_new(client):
    """Returns created=[] and skipped_duplicates=0 when discovery finds nothing."""
    with patch(
        "app.main.discover_bets_from_linear",
        new=AsyncMock(return_value=[]),
    ):
        response = client.post(
            "/bets/discover",
            json={"workspace_id": "ws-test"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["created"] == []
    assert data["skipped_duplicates"] == 0
