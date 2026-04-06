"""TDD tests for Governor — 8 deterministic policy checks.

Run with: uv run pytest tests/unit/test_governor.py -v

Each check is a pure function returning PolicyCheckResult.
Governor is deterministic — no LLM, no mocking needed.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.agents.governor import (
    can_auto_execute,
    check_acknowledged_risk,
    check_confidence_floor,
    check_control_level,
    check_duplicate_suppression,
    check_escalation_ladder,
    check_jules_gate,
    check_rate_cap,
    check_reversibility,
    compute_blast_radius,
)


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def _recent_intervention(action_type: str = "clarify_bet", status: str = "accepted", days_ago: int = 5, escalation_level: int = 1) -> dict:
    ts = (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()
    return {"action_type": action_type, "status": status, "created_at": ts, "escalation_level": escalation_level}


def _old_intervention(action_type: str = "clarify_bet", status: str = "accepted") -> dict:
    ts = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
    return {"action_type": action_type, "status": status, "created_at": ts, "escalation_level": 1}


# ─────────────────────────────────────────────
# CHECK 1: confidence_floor
# ─────────────────────────────────────────────

class TestConfidenceFloor:
    def test_above_floor_passes(self):
        result = check_confidence_floor(0.75, 0.65)
        assert result.passed is True
        assert result.denial_reason is None

    def test_at_floor_passes(self):
        result = check_confidence_floor(0.65, 0.65)
        assert result.passed is True

    def test_below_floor_fails(self):
        result = check_confidence_floor(0.50, 0.65)
        assert result.passed is False
        assert result.denial_reason == "confidence_below_floor"


# ─────────────────────────────────────────────
# CHECK 2: duplicate_suppression
# ─────────────────────────────────────────────

class TestDuplicateSuppression:
    def test_no_prior_passes(self):
        result = check_duplicate_suppression("clarify_bet", "bet-1", [])
        assert result.passed is True

    def test_same_action_recent_fails(self):
        prior = [_recent_intervention("clarify_bet", "accepted", days_ago=5)]
        result = check_duplicate_suppression("clarify_bet", "bet-1", prior)
        assert result.passed is False
        assert result.denial_reason == "duplicate_suppression"

    def test_same_action_old_passes(self):
        prior = [_old_intervention("clarify_bet")]
        result = check_duplicate_suppression("clarify_bet", "bet-1", prior)
        assert result.passed is True

    def test_different_action_passes(self):
        prior = [_recent_intervention("add_metric", "accepted", days_ago=5)]
        result = check_duplicate_suppression("clarify_bet", "bet-1", prior)
        assert result.passed is True

    def test_rejected_prior_passes(self):
        prior = [_recent_intervention("clarify_bet", "rejected", days_ago=5)]
        result = check_duplicate_suppression("clarify_bet", "bet-1", prior)
        assert result.passed is True


# ─────────────────────────────────────────────
# CHECK 3: rate_cap
# ─────────────────────────────────────────────

class TestRateCap:
    def test_no_recent_passes(self):
        result = check_rate_cap("bet-1", [])
        assert result.passed is True

    def test_recent_intervention_fails(self):
        prior = [_recent_intervention("add_metric", "pending", days_ago=3)]
        result = check_rate_cap("bet-1", prior)
        assert result.passed is False
        assert result.denial_reason == "rate_cap"

    def test_old_intervention_passes(self):
        prior = [_old_intervention()]
        result = check_rate_cap("bet-1", prior)
        assert result.passed is True


# ─────────────────────────────────────────────
# CHECK 4: jules_gate
# ─────────────────────────────────────────────

class TestJulesGate:
    def test_non_jules_passes(self):
        result = check_jules_gate("clarify_bet", workspace_has_github=False)
        assert result.passed is True

    def test_jules_with_github_passes(self):
        result = check_jules_gate("jules_refactor_blocker", workspace_has_github=True)
        assert result.passed is True

    def test_jules_without_github_fails(self):
        result = check_jules_gate("jules_instrument_experiment", workspace_has_github=False)
        assert result.passed is False
        assert result.denial_reason == "jules_gate"


# ─────────────────────────────────────────────
# CHECK 5: reversibility
# ─────────────────────────────────────────────

class TestReversibility:
    def test_normal_action_no_double_confirm(self):
        result = check_reversibility("clarify_bet", escalation_level=1, has_draft_document=False)
        assert result.passed is True
        assert result.details == "ok"

    def test_kill_bet_requires_double_confirm(self):
        result = check_reversibility("kill_bet", escalation_level=4, has_draft_document=False)
        assert result.passed is True  # never denied
        assert result.details == "double_confirm_required"

    def test_l3_draft_document_requires_double_confirm(self):
        result = check_reversibility("pre_mortem_session", escalation_level=3, has_draft_document=True)
        assert result.passed is True
        assert result.details == "double_confirm_required"

    def test_l2_draft_document_no_double_confirm(self):
        result = check_reversibility("rescope", escalation_level=2, has_draft_document=True)
        assert result.passed is True
        assert result.details == "ok"


# ─────────────────────────────────────────────
# CHECK 6: acknowledged_risk
# ─────────────────────────────────────────────

class TestAcknowledgedRisk:
    def test_no_acknowledged_passes(self):
        result = check_acknowledged_risk("strategy_unclear", [])
        assert result.passed is True

    def test_matching_acknowledged_fails(self):
        ack = [{"risk_type": "strategy_unclear", "acknowledged_at": "2026-01-01T00:00:00Z"}]
        result = check_acknowledged_risk("strategy_unclear", ack)
        assert result.passed is False
        assert result.denial_reason == "acknowledged_risk"

    def test_different_risk_type_passes(self):
        ack = [{"risk_type": "execution_issue", "acknowledged_at": "2026-01-01T00:00:00Z"}]
        result = check_acknowledged_risk("strategy_unclear", ack)
        assert result.passed is True


# ─────────────────────────────────────────────
# CHECK 7: control_level
# ─────────────────────────────────────────────

class TestControlLevel:
    def test_always_passes(self):
        for level in ("draft_only", "require_approval", "autonomous_low_risk"):
            result = check_control_level("clarify_bet", level)
            assert result.passed is True

    def test_details_carry_level(self):
        result = check_control_level("kill_bet", "draft_only")
        assert "draft_only" in result.details


# ─────────────────────────────────────────────
# CHECK 8: escalation_ladder
# ─────────────────────────────────────────────

class TestEscalationLadder:
    def test_first_intervention_l1_passes(self):
        result = check_escalation_ladder(1, [], "medium")
        assert result.passed is True

    def test_skip_to_l3_without_l2_fails(self):
        prior = [_recent_intervention("clarify_bet", "accepted", escalation_level=1)]
        result = check_escalation_ladder(3, prior, "high")
        assert result.passed is False
        assert result.denial_reason == "escalation_ladder"

    def test_l2_after_l1_passes(self):
        prior = [_recent_intervention("clarify_bet", "accepted", escalation_level=1)]
        result = check_escalation_ladder(2, prior, "medium")
        assert result.passed is True

    def test_critical_exception_allows_skip(self):
        """severity=critical + chronic_rollover_count >= 3 → can skip to L3."""
        result = check_escalation_ladder(3, [], "critical", chronic_rollover_count=3)
        assert result.passed is True

    def test_critical_without_rollovers_cannot_skip(self):
        result = check_escalation_ladder(3, [], "critical", chronic_rollover_count=1)
        assert result.passed is False


# ─────────────────────────────────────────────
# can_auto_execute
# ─────────────────────────────────────────────

class TestCanAutoExecute:
    def test_autonomous_l1_low_auto_executes(self):
        assert can_auto_execute("autonomous_low_risk", 1, "low") is True

    def test_autonomous_l1_medium_auto_executes(self):
        assert can_auto_execute("autonomous_low_risk", 1, "medium") is True

    def test_autonomous_l1_high_blocked(self):
        assert can_auto_execute("autonomous_low_risk", 1, "high") is False

    def test_autonomous_l2_blocked(self):
        assert can_auto_execute("autonomous_low_risk", 2, "low") is False

    def test_require_approval_never_auto(self):
        assert can_auto_execute("require_approval", 1, "low") is False

    def test_draft_only_never_auto(self):
        assert can_auto_execute("draft_only", 1, "low") is False


# ─────────────────────────────────────────────
# blast_radius
# ─────────────────────────────────────────────

class TestBlastRadius:
    def test_low_impact_returns_none(self):
        assert compute_blast_radius("clarify_bet", {}, {}) is None

    def test_kill_bet_returns_preview(self):
        snapshot = {"linear_signals": {"total_issues_analyzed": 25}}
        bet = {"linear_project_ids": ["proj-1"]}
        result = compute_blast_radius("kill_bet", snapshot, bet)
        assert result is not None
        assert result.affected_issue_count == 25
        assert result.reversible is False

    def test_jules_action_returns_preview(self):
        snapshot = {"linear_signals": {"total_issues_analyzed": 10}}
        bet = {"linear_project_ids": ["proj-1", "proj-2"]}
        result = compute_blast_radius("jules_refactor_blocker", snapshot, bet)
        assert result is not None
        assert result.reversible is True
