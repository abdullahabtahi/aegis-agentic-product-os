"""Unit tests for discover_bets_from_linear().

Run with: cd backend && uv run pytest tests/unit/test_bet_discovery.py -v
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.fixture
def mock_issues():
    """Five fake LinearIssue-like objects."""
    from tools.linear_tools import LinearIssue
    return [
        LinearIssue(id=f"i-{i}", title=f"Issue {i}", status="Todo",
                    project_id=None, description=f"Description for issue {i}")
        for i in range(5)
    ]


@pytest.fixture
def gemini_json_response():
    """Fake Gemini response with 3 clusters."""
    return (
        '[{"name": "Voice-first workflows", '
        '"hypothesis": "We believe voice input reduces documentation time.", '
        '"problem_statement": "Decisions are lost in hallway conversations."}, '
        '{"name": "Async decision log", '
        '"hypothesis": "We believe async logging increases team alignment.", '
        '"problem_statement": "Context is scattered across tools."}, '
        '{"name": "Auto-capture integrations", '
        '"hypothesis": "We believe integrations reduce manual overhead.", '
        '"problem_statement": "Teams spend time on manual data entry."}]'
    )


@pytest.mark.asyncio
async def test_discover_returns_bet_dicts(mock_issues, gemini_json_response):
    """Happy path: 5 issues → Gemini → 3 new bets returned."""
    mock_linear = AsyncMock()
    mock_linear.list_issues.return_value = mock_issues

    mock_response = MagicMock()
    mock_response.text = gemini_json_response

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

    with patch("app.services.bet_discovery.get_linear_mcp", return_value=mock_linear), \
         patch("app.services.bet_discovery._make_genai_client", return_value=mock_client):
        from app.services.bet_discovery import discover_bets_from_linear
        result = await discover_bets_from_linear(
            workspace_id="ws-1",
            existing_names=set(),
        )

    assert len(result) == 3
    assert result[0]["status"] == "detecting"
    assert result[0]["declaration_source"]["type"] == "agent_inferred"
    assert result[0]["workspace_id"] == "ws-1"
    assert result[0]["name"] == "Voice-first workflows"
    assert "id" in result[0]
    assert "created_at" in result[0]


@pytest.mark.asyncio
async def test_discover_deduplicates_existing_names(mock_issues, gemini_json_response):
    """Clusters whose name matches an existing bet are skipped (case-insensitive)."""
    mock_linear = AsyncMock()
    mock_linear.list_issues.return_value = mock_issues

    mock_response = MagicMock()
    mock_response.text = gemini_json_response

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

    with patch("app.services.bet_discovery.get_linear_mcp", return_value=mock_linear), \
         patch("app.services.bet_discovery._make_genai_client", return_value=mock_client):
        from app.services.bet_discovery import discover_bets_from_linear
        result = await discover_bets_from_linear(
            workspace_id="ws-1",
            existing_names={"voice-first workflows"},  # already exists
        )

    assert len(result) == 2
    names = [b["name"] for b in result]
    assert "Voice-first workflows" not in names


@pytest.mark.asyncio
async def test_discover_caps_at_five_directions(mock_issues):
    """Never returns more than 5 bets regardless of Gemini output."""
    big_response = "[" + ",".join(
        f'{{"name": "Direction {i}", "hypothesis": "h{i}", "problem_statement": "p{i}"}}'
        for i in range(10)
    ) + "]"

    mock_linear = AsyncMock()
    mock_linear.list_issues.return_value = mock_issues

    mock_response = MagicMock()
    mock_response.text = big_response

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

    with patch("app.services.bet_discovery.get_linear_mcp", return_value=mock_linear), \
         patch("app.services.bet_discovery._make_genai_client", return_value=mock_client):
        from app.services.bet_discovery import discover_bets_from_linear
        result = await discover_bets_from_linear(
            workspace_id="ws-1",
            existing_names=set(),
        )

    assert len(result) <= 5


@pytest.mark.asyncio
async def test_discover_returns_empty_on_no_issues():
    """Returns empty list when Linear returns no issues."""
    mock_linear = AsyncMock()
    mock_linear.list_issues.return_value = []

    with patch("app.services.bet_discovery.get_linear_mcp", return_value=mock_linear):
        from app.services.bet_discovery import discover_bets_from_linear
        result = await discover_bets_from_linear(
            workspace_id="ws-1",
            existing_names=set(),
        )

    assert result == []


@pytest.mark.asyncio
async def test_discover_returns_empty_on_invalid_gemini_json(mock_issues):
    """Returns empty list (no crash) when Gemini returns malformed JSON."""
    mock_linear = AsyncMock()
    mock_linear.list_issues.return_value = mock_issues

    mock_response = MagicMock()
    mock_response.text = "This is not JSON at all."

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

    with patch("app.services.bet_discovery.get_linear_mcp", return_value=mock_linear), \
         patch("app.services.bet_discovery._make_genai_client", return_value=mock_client):
        from app.services.bet_discovery import discover_bets_from_linear
        result = await discover_bets_from_linear(
            workspace_id="ws-1",
            existing_names=set(),
        )

    assert result == []
