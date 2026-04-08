"""Tests for override_teach.py — suppression logic for rejected interventions."""

from datetime import datetime, timedelta, timezone

from app.override_teach import build_suppression_key, record_rejection, should_suppress


class TestBuildSuppressionKey:
    def test_deterministic(self) -> None:
        key1 = build_suppression_key(
            "strategy_unclear", "add_hypothesis", "evidence_too_weak"
        )
        key2 = build_suppression_key(
            "strategy_unclear", "add_hypothesis", "evidence_too_weak"
        )
        assert key1 == key2
        assert key1 == "strategy_unclear:add_hypothesis:evidence_too_weak"


class TestShouldSuppress:
    def _make_rejection(
        self, risk_type: str, action_type: str, reason: str, days_ago: int = 0
    ) -> dict:
        ts = (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()
        return {
            "risk_type": risk_type,
            "action_type": action_type,
            "rejection_reason": reason,
            "rejected_at": ts,
        }

    def test_no_suppression_on_empty_history(self) -> None:
        suppressed, reason = should_suppress([], "strategy_unclear", "add_hypothesis")
        assert suppressed is False
        assert reason is None

    def test_no_suppression_on_first_rejection(self) -> None:
        history = [
            self._make_rejection(
                "strategy_unclear", "add_hypothesis", "evidence_too_weak"
            )
        ]
        suppressed, _reason = should_suppress(
            history, "strategy_unclear", "add_hypothesis"
        )
        assert suppressed is False

    def test_suppression_on_second_rejection(self) -> None:
        history = [
            self._make_rejection(
                "strategy_unclear", "add_hypothesis", "evidence_too_weak", days_ago=5
            ),
            self._make_rejection(
                "strategy_unclear", "add_hypothesis", "evidence_too_weak", days_ago=1
            ),
        ]
        suppressed, reason = should_suppress(
            history, "strategy_unclear", "add_hypothesis"
        )
        assert suppressed is True
        assert reason == "evidence_too_weak"

    def test_no_suppression_different_risk_type(self) -> None:
        history = [
            self._make_rejection(
                "alignment_issue", "add_hypothesis", "evidence_too_weak", days_ago=5
            ),
            self._make_rejection(
                "alignment_issue", "add_hypothesis", "evidence_too_weak", days_ago=1
            ),
        ]
        suppressed, _ = should_suppress(history, "strategy_unclear", "add_hypothesis")
        assert suppressed is False

    def test_no_suppression_different_action_type(self) -> None:
        history = [
            self._make_rejection(
                "strategy_unclear", "clarify_bet", "evidence_too_weak", days_ago=5
            ),
            self._make_rejection(
                "strategy_unclear", "clarify_bet", "evidence_too_weak", days_ago=1
            ),
        ]
        suppressed, _ = should_suppress(history, "strategy_unclear", "add_hypothesis")
        assert suppressed is False

    def test_no_suppression_outside_window(self) -> None:
        history = [
            self._make_rejection(
                "strategy_unclear", "add_hypothesis", "evidence_too_weak", days_ago=35
            ),
            self._make_rejection(
                "strategy_unclear", "add_hypothesis", "evidence_too_weak", days_ago=32
            ),
        ]
        suppressed, _ = should_suppress(history, "strategy_unclear", "add_hypothesis")
        assert suppressed is False

    def test_mixed_reasons_no_suppression(self) -> None:
        history = [
            self._make_rejection(
                "strategy_unclear", "add_hypothesis", "evidence_too_weak", days_ago=5
            ),
            self._make_rejection(
                "strategy_unclear", "add_hypothesis", "not_a_priority", days_ago=1
            ),
        ]
        suppressed, _ = should_suppress(history, "strategy_unclear", "add_hypothesis")
        assert suppressed is False

    def test_custom_threshold(self) -> None:
        history = [
            self._make_rejection(
                "strategy_unclear", "add_hypothesis", "evidence_too_weak", days_ago=3
            ),
            self._make_rejection(
                "strategy_unclear", "add_hypothesis", "evidence_too_weak", days_ago=2
            ),
            self._make_rejection(
                "strategy_unclear", "add_hypothesis", "evidence_too_weak", days_ago=1
            ),
        ]
        suppressed, _ = should_suppress(
            history, "strategy_unclear", "add_hypothesis", threshold=3
        )
        assert suppressed is True


class TestRecordRejection:
    def test_returns_new_list(self) -> None:
        original: list[dict] = []
        result = record_rejection(
            original,
            "strategy_unclear",
            "add_hypothesis",
            "evidence_too_weak",
            "2026-01-01",
        )
        assert len(result) == 1
        assert len(original) == 0  # not mutated

    def test_appends_entry(self) -> None:
        existing = [{"risk_type": "old"}]
        result = record_rejection(
            existing, "strategy_unclear", "add_hypothesis", "other", "2026-01-01"
        )
        assert len(result) == 2
        assert result[1]["risk_type"] == "strategy_unclear"
        assert result[1]["rejection_reason"] == "other"
