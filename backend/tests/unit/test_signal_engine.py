"""TDD tests for Signal Engine — deterministic computation.

Run with: uv run pytest tests/unit/test_signal_engine.py -v

These tests define the contract for compute_signals(). They run FIRST (RED phase),
then the implementation is written to make them pass (GREEN phase).

Coverage requirements (CLAUDE.md Phase 1):
  - Healthy workspace → health_score high, no risk types present
  - Messy workspace → execution_issue and strategy_unclear detected
  - Cross-team workspace → alignment_issue detected
  - Bounded reads → days > 14 raises ValueError (hard invariant)
  - Error handling → Linear API failure → BetSnapshot with status "error"
"""

from __future__ import annotations

import pytest

from models.schema import BetHealthBaseline, BetStatus, DeclarationSource, Bet, Metric
from tools.linear_tools import MockLinearMCP


# ─────────────────────────────────────────────
# FIXTURES
# ─────────────────────────────────────────────

def make_bet(
    bet_id: str,
    workspace_id: str,
    linear_project_ids: list[str],
    hypothesis: str = "We believe X will result in Y for Z.",
    success_metrics: list[Metric] | None = None,
) -> Bet:
    return Bet(
        id=bet_id,
        workspace_id=workspace_id,
        name="Test Bet",
        target_segment="founders",
        problem_statement="Problem",
        hypothesis=hypothesis,
        success_metrics=success_metrics or [Metric(name="metric", target_value=0.5, unit="ratio")],
        time_horizon="2026-12-01",
        declaration_source=DeclarationSource(type="linear_project"),
        declaration_confidence=0.8,
        status="active",
        health_baseline=BetHealthBaseline(
            expected_bet_coverage_pct=0.6,
            expected_weekly_velocity=10,
            hypothesis_required=True,
            metric_linked_required=True,
        ),
        linear_project_ids=linear_project_ids,
        created_at="2026-01-01T00:00:00Z",
        last_monitored_at="2026-01-01T00:00:00Z",
    )


# ─────────────────────────────────────────────
# MOCK TESTS (no signal engine yet — tests MockLinearMCP fixture loading)
# ─────────────────────────────────────────────

class TestMockLinearMCP:
    @pytest.mark.asyncio
    async def test_loads_healthy_fixture(self):
        mock = MockLinearMCP()
        issues = await mock.list_issues(project_ids=["proj-healthy-001"], days=14)
        assert len(issues) > 0
        assert all(i.project_id == "proj-healthy-001" or i.project_id is None for i in issues)

    @pytest.mark.asyncio
    async def test_loads_messy_fixture(self):
        mock = MockLinearMCP()
        issues = await mock.list_issues(project_ids=["proj-messy-001"], days=14)
        # Messy workspace has chronic rollovers
        rolled = [i for i in issues if i.rolled_over]
        assert len(rolled) >= 2, f"Expected ≥2 rolled-over issues, got {len(rolled)}"

    @pytest.mark.asyncio
    async def test_loads_cross_team_fixture(self):
        mock = MockLinearMCP()
        relations = await mock.list_issue_relations(issue_ids=["API-02", "API-03"])
        cross_team = [r for r in relations if r.to_team is not None]
        assert len(cross_team) >= 2, f"Expected ≥2 cross-team relations, got {len(cross_team)}"

    @pytest.mark.asyncio
    async def test_enforces_14_day_bound(self):
        """Signal Engine invariant: never read more than 14 days. Hard constraint."""
        mock = MockLinearMCP()
        with pytest.raises(ValueError, match="14 days"):
            await mock.list_issues(project_ids=["proj-healthy-001"], days=15)

    @pytest.mark.asyncio
    async def test_unknown_project_raises(self):
        mock = MockLinearMCP()
        with pytest.raises(ValueError, match="No fixture matched"):
            await mock.list_issues(project_ids=["proj-unknown-xyz"], days=14)

    @pytest.mark.asyncio
    async def test_empty_project_ids_returns_empty(self):
        mock = MockLinearMCP()
        issues = await mock.list_issues(project_ids=[], days=14)
        assert issues == []


# ─────────────────────────────────────────────
# SIGNAL ENGINE TESTS (import compute_signals — RED until implementation exists)
# ─────────────────────────────────────────────

class TestComputeSignals:
    """Contract tests for compute_signals(workspace_id, bet, linear_mcp, days=14) → BetSnapshot."""

    @pytest.mark.asyncio
    async def test_healthy_workspace_high_coverage(self):
        """Healthy fixture → bet_coverage_pct > 0.7, no chronic rollovers."""
        from app.agents.signal_engine import compute_signals

        mock = MockLinearMCP()
        bet = make_bet("bet-healthy-001", "ws-healthy-001", ["proj-healthy-001"])
        snapshot = await compute_signals("ws-healthy-001", bet, mock)

        assert snapshot.status == "ok"
        assert snapshot.linear_signals.bet_coverage_pct > 0.7
        assert snapshot.linear_signals.chronic_rollover_count == 0
        assert snapshot.linear_signals.hypothesis_present is True
        assert snapshot.linear_signals.metric_linked is True
        # Healthy workspace: risk_types_present should be empty
        assert snapshot.risk_types_present == []

    @pytest.mark.asyncio
    async def test_messy_workspace_execution_issue(self):
        """Messy fixture → chronic_rollover_count >= 4, low coverage → execution_issue detected."""
        from app.agents.signal_engine import compute_signals

        mock = MockLinearMCP()
        bet = make_bet(
            "bet-messy-001",
            "ws-messy-001",
            ["proj-messy-001"],
            hypothesis="",  # missing hypothesis
            success_metrics=[],  # no metrics
        )
        snapshot = await compute_signals("ws-messy-001", bet, mock)

        assert snapshot.status == "ok"
        assert snapshot.linear_signals.chronic_rollover_count >= 4
        assert snapshot.linear_signals.bet_coverage_pct < 0.5
        assert snapshot.linear_signals.hypothesis_present is False
        assert "execution_issue" in snapshot.risk_types_present
        assert "strategy_unclear" in snapshot.risk_types_present

    @pytest.mark.asyncio
    async def test_cross_team_workspace_alignment_issue(self):
        """Cross-team fixture → cross_team_thrash_signals >= 3 → alignment_issue detected."""
        from app.agents.signal_engine import compute_signals

        mock = MockLinearMCP()
        bet = make_bet("bet-crossteam-001", "ws-crossteam-001", ["proj-api-001"])
        snapshot = await compute_signals("ws-crossteam-001", bet, mock)

        assert snapshot.status == "ok"
        assert snapshot.linear_signals.cross_team_thrash_signals >= 3
        assert "alignment_issue" in snapshot.risk_types_present

    @pytest.mark.asyncio
    async def test_snapshot_has_correct_bet_id(self):
        from app.agents.signal_engine import compute_signals

        mock = MockLinearMCP()
        bet = make_bet("bet-healthy-001", "ws-healthy-001", ["proj-healthy-001"])
        snapshot = await compute_signals("ws-healthy-001", bet, mock)

        assert snapshot.bet_id == "bet-healthy-001"

    @pytest.mark.asyncio
    async def test_snapshot_read_window_always_14(self):
        """Signal Engine invariant: read_window_days is always 14."""
        from app.agents.signal_engine import compute_signals

        mock = MockLinearMCP()
        bet = make_bet("bet-healthy-001", "ws-healthy-001", ["proj-healthy-001"])
        snapshot = await compute_signals("ws-healthy-001", bet, mock)

        assert snapshot.linear_signals.read_window_days == 14

    @pytest.mark.asyncio
    async def test_health_score_healthy_is_high(self):
        """Healthy workspace → health_score > 70."""
        from app.agents.signal_engine import compute_signals

        mock = MockLinearMCP()
        bet = make_bet("bet-healthy-001", "ws-healthy-001", ["proj-healthy-001"])
        snapshot = await compute_signals("ws-healthy-001", bet, mock)

        assert snapshot.health_score > 70, f"Expected health_score > 70, got {snapshot.health_score}"

    @pytest.mark.asyncio
    async def test_health_score_messy_is_low(self):
        """Messy workspace → health_score < 40."""
        from app.agents.signal_engine import compute_signals

        mock = MockLinearMCP()
        bet = make_bet("bet-messy-001", "ws-messy-001", ["proj-messy-001"], hypothesis="", success_metrics=[])
        snapshot = await compute_signals("ws-messy-001", bet, mock)

        assert snapshot.health_score < 40, f"Expected health_score < 40, got {snapshot.health_score}"

    @pytest.mark.asyncio
    async def test_hypothesis_staleness_is_none_phase1(self):
        """Phase 1: hypothesis_staleness_days is None (Phase 2 feature not active).

        Never returns 0 as default — that would mean 'just tested'.
        """
        from app.agents.signal_engine import compute_signals

        mock = MockLinearMCP()
        bet = make_bet("bet-healthy-001", "ws-healthy-001", ["proj-healthy-001"])
        snapshot = await compute_signals("ws-healthy-001", bet, mock)

        assert snapshot.hypothesis_staleness_days is None, (
            f"Expected None (Phase 2 not active), got {snapshot.hypothesis_staleness_days}"
        )

    @pytest.mark.asyncio
    async def test_immutability(self):
        """BetSnapshot is frozen — cannot be mutated (CLAUDE.md invariant)."""
        from app.agents.signal_engine import compute_signals

        mock = MockLinearMCP()
        bet = make_bet("bet-healthy-001", "ws-healthy-001", ["proj-healthy-001"])
        snapshot = await compute_signals("ws-healthy-001", bet, mock)

        with pytest.raises((TypeError, Exception)):
            snapshot.health_score = 99  # type: ignore[misc]
