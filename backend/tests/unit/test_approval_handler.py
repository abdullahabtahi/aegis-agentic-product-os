"""Tests for approval_handler.py — state transitions for founder accept/reject."""

import copy

import pytest

from app.approval_handler import approve_intervention, reject_intervention


@pytest.fixture
def awaiting_state() -> dict:
    """Session state after Governor approves — awaiting founder decision."""
    return {
        "pipeline_status": "awaiting_founder_approval",
        "pipeline_checkpoint": "awaiting_founder_approval",
        "bet": {"id": "bet-001", "name": "Test Bet"},
        "awaiting_approval_intervention": {
            "action_type": "add_hypothesis",
            "escalation_level": 1,
            "title": "Test Intervention",
            "risk_type": "strategy_unclear",
            "confidence": 0.85,
        },
        "rejection_history": [],
    }


class TestApproveIntervention:
    def test_transitions_status(self, awaiting_state: dict) -> None:
        result = approve_intervention(awaiting_state)
        assert result["pipeline_status"] == "founder_approved"
        assert result["pipeline_checkpoint"] == "founder_approved"

    def test_sets_decided_at(self, awaiting_state: dict) -> None:
        result = approve_intervention(awaiting_state)
        assert "founder_decided_at" in result

    def test_rejects_wrong_status(self) -> None:
        with pytest.raises(ValueError, match="Cannot approve"):
            approve_intervention({"pipeline_status": "executed"})

    def test_does_not_mutate_input(self, awaiting_state: dict) -> None:
        original = copy.deepcopy(awaiting_state)
        approve_intervention(awaiting_state)
        assert awaiting_state == original

    def test_preserves_existing_state(self, awaiting_state: dict) -> None:
        result = approve_intervention(awaiting_state)
        assert result["bet"] == awaiting_state["bet"]
        assert result["awaiting_approval_intervention"] == awaiting_state["awaiting_approval_intervention"]


class TestRejectIntervention:
    def test_transitions_status(self, awaiting_state: dict) -> None:
        result = reject_intervention(awaiting_state, "evidence_too_weak")
        assert result["pipeline_status"] == "founder_rejected"
        assert result["pipeline_checkpoint"] == "founder_rejected"

    def test_stores_rejection_reason(self, awaiting_state: dict) -> None:
        result = reject_intervention(awaiting_state, "evidence_too_weak", "Not convincing")
        intervention = result["awaiting_approval_intervention"]
        assert intervention["rejection_reason"] == "evidence_too_weak"
        assert intervention["founder_note"] == "Not convincing"
        assert intervention["status"] == "rejected"

    def test_appends_to_history(self, awaiting_state: dict) -> None:
        result = reject_intervention(awaiting_state, "already_handled")
        assert len(result["rejection_history"]) == 1
        entry = result["rejection_history"][0]
        assert entry["risk_type"] == "strategy_unclear"
        assert entry["action_type"] == "add_hypothesis"
        assert entry["rejection_reason"] == "already_handled"
        assert entry["bet_id"] == "bet-001"

    def test_does_not_mutate_input(self, awaiting_state: dict) -> None:
        original = copy.deepcopy(awaiting_state)
        reject_intervention(awaiting_state, "not_a_priority")
        assert awaiting_state == original

    def test_rejects_wrong_status(self) -> None:
        with pytest.raises(ValueError, match="Cannot reject"):
            reject_intervention({"pipeline_status": "executed"}, "other")

    def test_appends_to_existing_history(self, awaiting_state: dict) -> None:
        awaiting_state["rejection_history"] = [
            {"risk_type": "old", "action_type": "old", "rejection_reason": "other", "rejected_at": "2026-01-01"}
        ]
        result = reject_intervention(awaiting_state, "wrong_risk_type")
        assert len(result["rejection_history"]) == 2
        assert result["rejection_history"][0]["risk_type"] == "old"
        assert result["rejection_history"][1]["risk_type"] == "strategy_unclear"
