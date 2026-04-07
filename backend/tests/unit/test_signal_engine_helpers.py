"""Unit tests for Signal Engine helper functions.

These are pure Python functions with no I/O — no mocks, no GCP, no LLM.
They complement test_signal_engine.py (which tests the full compute_signals() flow).

Run with: uv run pytest tests/unit/test_signal_engine_helpers.py -v
"""

from __future__ import annotations

from app.agents.signal_engine import (
    _compute_bet_coverage,
    _compute_health_score,
    _compute_rollovers,
    _detect_risk_types,
    _hypothesis_present,
    _metric_linked,
    _misc_ticket_pct,
    _placebo_productivity_score,
)
from models.schema import (
    Bet,
    BetHealthBaseline,
    DeclarationSource,
    LinearSignals,
    Metric,
)

# ─────────────────────────────────────────────
# Fixtures / helpers
# ─────────────────────────────────────────────


class _FakeIssue:
    """Minimal issue stub — only the fields helper functions care about."""

    def __init__(
        self,
        *,
        id: str = "issue-1",
        title: str = "Fix bug",
        description: str = "",
        status: str = "in_progress",
        project_id: str = "proj-1",
        rolled_over: bool = False,
        roll_count: int = 0,
    ) -> None:
        self.id = id
        self.title = title
        self.description = description
        self.status = status
        self.project_id = project_id
        self.rolled_over = rolled_over
        self.roll_count = roll_count


def _make_baseline(
    *,
    hypothesis_required: bool = True,
    metric_linked_required: bool = True,
    expected_bet_coverage_pct: float = 0.6,
) -> BetHealthBaseline:
    return BetHealthBaseline(
        expected_bet_coverage_pct=expected_bet_coverage_pct,
        expected_weekly_velocity=10,
        hypothesis_required=hypothesis_required,
        metric_linked_required=metric_linked_required,
    )


def _make_signals(**overrides) -> LinearSignals:
    defaults = {
        "total_issues_analyzed": 10,
        "bet_mapped_issues": 8,
        "bet_coverage_pct": 0.8,
        "rollover_count": 0,
        "chronic_rollover_count": 0,
        "blocked_count": 0,
        "misc_ticket_pct": 0.0,
        "hypothesis_present": True,
        "metric_linked": True,
        "cross_team_thrash_signals": 0,
        "scope_change_count": 0,
        "read_window_days": 14,
    }
    defaults.update(overrides)
    return LinearSignals(**defaults)


# ─────────────────────────────────────────────
# _compute_bet_coverage
# ─────────────────────────────────────────────


class TestComputeBetCoverage:
    def test_empty_issues_returns_zero(self):
        total, mapped, pct = _compute_bet_coverage([], {"proj-1"})
        assert total == 0
        assert mapped == 0
        assert pct == 0.0

    def test_all_mapped(self):
        issues = [_FakeIssue(project_id="proj-1")] * 5
        total, mapped, pct = _compute_bet_coverage(issues, {"proj-1"})
        assert total == 5
        assert mapped == 5
        assert pct == 1.0

    def test_partial_mapping(self):
        issues = [
            _FakeIssue(project_id="proj-1"),
            _FakeIssue(project_id="proj-1"),
            _FakeIssue(project_id="other"),
            _FakeIssue(project_id="other"),
        ]
        total, mapped, pct = _compute_bet_coverage(issues, {"proj-1"})
        assert total == 4
        assert mapped == 2
        assert pct == 0.5

    def test_coverage_rounded_to_4_places(self):
        issues = [_FakeIssue(project_id="proj-1")] * 1 + [
            _FakeIssue(project_id="x")
        ] * 2
        _, _, pct = _compute_bet_coverage(issues, {"proj-1"})
        assert pct == round(1 / 3, 4)


# ─────────────────────────────────────────────
# _compute_rollovers
# ─────────────────────────────────────────────


class TestComputeRollovers:
    def test_no_rollovers(self):
        issues = [_FakeIssue(rolled_over=False, roll_count=0)] * 5
        rollover, chronic = _compute_rollovers(issues)
        assert rollover == 0
        assert chronic == 0

    def test_rollover_not_chronic(self):
        issues = [_FakeIssue(rolled_over=True, roll_count=1)]
        rollover, chronic = _compute_rollovers(issues)
        assert rollover == 1
        assert chronic == 0

    def test_chronic_rollover(self):
        issues = [
            _FakeIssue(rolled_over=True, roll_count=2),
            _FakeIssue(rolled_over=True, roll_count=3),
            _FakeIssue(rolled_over=False, roll_count=0),
        ]
        rollover, chronic = _compute_rollovers(issues)
        assert rollover == 2
        assert chronic == 2

    def test_chronic_threshold_is_2(self):
        """Chronic = roll_count >= 2. roll_count=1 is NOT chronic."""
        issues = [_FakeIssue(rolled_over=True, roll_count=1)] * 3
        _, chronic = _compute_rollovers(issues)
        assert chronic == 0


# ─────────────────────────────────────────────
# _hypothesis_present
# ─────────────────────────────────────────────


class TestHypothesisPresent:
    def _make_bet(self, hypothesis: str) -> Bet:
        return Bet(
            id="bet-1",
            workspace_id="ws-1",
            name="Test",
            target_segment="founders",
            problem_statement="Problem",
            hypothesis=hypothesis,
            success_metrics=[Metric(name="m", target_value=1.0, unit="ratio")],
            time_horizon="2026-12-01",
            declaration_source=DeclarationSource(type="linear_project"),
            declaration_confidence=0.8,
            status="active",
            health_baseline=_make_baseline(),
            linear_project_ids=["proj-1"],
            created_at="2026-01-01T00:00:00Z",
            last_monitored_at="2026-01-01T00:00:00Z",
        )

    def test_long_hypothesis_present(self):
        bet = self._make_bet("We believe X will result in Y for Z, measurably.")
        assert _hypothesis_present(bet) is True

    def test_empty_hypothesis_absent(self):
        bet = self._make_bet("")
        assert _hypothesis_present(bet) is False

    def test_short_hypothesis_absent(self):
        # < 20 chars is too short to count
        bet = self._make_bet("X causes Y")
        assert _hypothesis_present(bet) is False

    def test_none_hypothesis_absent(self):
        bet = self._make_bet("placeholder")
        bet = bet.model_copy(update={"hypothesis": None})
        assert _hypothesis_present(bet) is False


# ─────────────────────────────────────────────
# _metric_linked
# ─────────────────────────────────────────────


class TestMetricLinked:
    def test_percentage_target_matches(self):
        issues = [_FakeIssue(description="Improve conversion by 20%")]
        found, source = _metric_linked(issues)
        assert found is True
        assert source == "issue-1"

    def test_target_colon_pattern_matches(self):
        issues = [_FakeIssue(description="target: 50 signups per week")]
        found, _ = _metric_linked(issues)
        assert found is True

    def test_hypothesis_pattern_matches(self):
        issues = [_FakeIssue(description="We believe this will result in more users")]
        found, _ = _metric_linked(issues)
        assert found is True

    def test_no_pattern_returns_false(self):
        issues = [_FakeIssue(description="Fix the login button colour")]
        found, source = _metric_linked(issues)
        assert found is False
        assert source is None

    def test_empty_issues_returns_false(self):
        found, source = _metric_linked([])
        assert found is False
        assert source is None

    def test_empty_description_skipped(self):
        issues = [_FakeIssue(description="")]
        found, source = _metric_linked(issues)
        assert found is False
        assert source is None


# ─────────────────────────────────────────────
# _misc_ticket_pct
# ─────────────────────────────────────────────


class TestMiscTicketPct:
    def test_all_mapped_zero_misc(self):
        issues = [_FakeIssue(project_id="proj-1")] * 4
        pct = _misc_ticket_pct(issues, {"proj-1"})
        assert pct == 0.0

    def test_all_unmapped_full_misc(self):
        issues = [_FakeIssue(project_id="other")] * 4
        pct = _misc_ticket_pct(issues, {"proj-1"})
        assert pct == 1.0

    def test_empty_issues_zero(self):
        pct = _misc_ticket_pct([], {"proj-1"})
        assert pct == 0.0


# ─────────────────────────────────────────────
# _placebo_productivity_score
# ─────────────────────────────────────────────


class TestPlaceboProductivityScore:
    def test_no_done_issues_returns_none(self):
        issues = [_FakeIssue(status="in_progress")]
        result = _placebo_productivity_score(issues, {"proj-1"})
        assert result is None

    def test_all_done_and_mapped_zero(self):
        issues = [_FakeIssue(status="done", project_id="proj-1")] * 4
        result = _placebo_productivity_score(issues, {"proj-1"})
        assert result == 0.0

    def test_all_done_and_unmapped_full(self):
        issues = [_FakeIssue(status="done", project_id="other")] * 4
        result = _placebo_productivity_score(issues, {"proj-1"})
        assert result == 1.0

    def test_mixed_statuses_only_done_counted(self):
        issues = [
            _FakeIssue(status="done", project_id="other"),
            _FakeIssue(status="done", project_id="proj-1"),
            _FakeIssue(status="in_progress", project_id="other"),  # excluded
        ]
        result = _placebo_productivity_score(issues, {"proj-1"})
        # 1 done unmapped / 2 done total
        assert result == 0.5


# ─────────────────────────────────────────────
# _compute_health_score
# ─────────────────────────────────────────────


class TestComputeHealthScore:
    def test_perfect_signals_is_100(self):
        signals = _make_signals(
            bet_coverage_pct=1.0,
            chronic_rollover_count=0,
            hypothesis_present=True,
            metric_linked=True,
            cross_team_thrash_signals=0,
            misc_ticket_pct=0.0,
        )
        baseline = _make_baseline(
            expected_bet_coverage_pct=0.6,
            hypothesis_required=True,
            metric_linked_required=True,
        )
        score = _compute_health_score(signals, baseline)
        assert score == 100.0

    def test_score_never_below_zero(self):
        """Pathological case — many signals firing simultaneously."""
        signals = _make_signals(
            bet_coverage_pct=0.0,
            chronic_rollover_count=20,
            hypothesis_present=False,
            metric_linked=False,
            cross_team_thrash_signals=10,
            misc_ticket_pct=1.0,
        )
        baseline = _make_baseline()
        score = _compute_health_score(signals, baseline)
        assert score == 0.0

    def test_low_coverage_penalises(self):
        signals_low = _make_signals(bet_coverage_pct=0.0)
        signals_high = _make_signals(bet_coverage_pct=1.0)
        baseline = _make_baseline(expected_bet_coverage_pct=0.6)
        assert _compute_health_score(signals_low, baseline) < _compute_health_score(
            signals_high, baseline
        )

    def test_chronic_rollovers_penalise(self):
        signals_clean = _make_signals(chronic_rollover_count=0)
        signals_bad = _make_signals(chronic_rollover_count=5)
        baseline = _make_baseline()
        assert _compute_health_score(signals_bad, baseline) < _compute_health_score(
            signals_clean, baseline
        )

    def test_missing_hypothesis_penalises_when_required(self):
        signals_with = _make_signals(hypothesis_present=True)
        signals_without = _make_signals(hypothesis_present=False)
        baseline = _make_baseline(hypothesis_required=True)
        assert _compute_health_score(signals_without, baseline) < _compute_health_score(
            signals_with, baseline
        )

    def test_missing_hypothesis_no_penalty_when_not_required(self):
        signals = _make_signals(hypothesis_present=False)
        baseline = _make_baseline(hypothesis_required=False)
        # Only other source of penalty is coverage gap; we have 0.8 coverage vs 0.6 baseline
        score = _compute_health_score(signals, baseline)
        assert score == 100.0  # no hypothesis penalty, coverage is fine

    def test_score_bounded_0_to_100(self):
        for rollover_count in range(0, 30, 5):
            signals = _make_signals(chronic_rollover_count=rollover_count)
            score = _compute_health_score(signals, _make_baseline())
            assert 0.0 <= score <= 100.0


# ─────────────────────────────────────────────
# _detect_risk_types
# ─────────────────────────────────────────────


class TestDetectRiskTypes:
    def test_clean_signals_no_risks(self):
        signals = _make_signals()
        baseline = _make_baseline()
        risks = _detect_risk_types(signals, baseline)
        assert risks == []

    def test_missing_hypothesis_triggers_strategy_unclear(self):
        signals = _make_signals(hypothesis_present=False)
        baseline = _make_baseline(hypothesis_required=True)
        risks = _detect_risk_types(signals, baseline)
        assert "strategy_unclear" in risks

    def test_missing_metric_triggers_strategy_unclear(self):
        signals = _make_signals(metric_linked=False)
        baseline = _make_baseline(metric_linked_required=True)
        risks = _detect_risk_types(signals, baseline)
        assert "strategy_unclear" in risks

    def test_cross_team_thrash_triggers_alignment_issue(self):
        # DEFAULT_HEURISTIC_VERSION threshold is 3
        signals = _make_signals(cross_team_thrash_signals=3)
        baseline = _make_baseline()
        risks = _detect_risk_types(signals, baseline)
        assert "alignment_issue" in risks

    def test_below_cross_team_threshold_no_alignment_issue(self):
        signals = _make_signals(cross_team_thrash_signals=2)
        baseline = _make_baseline()
        risks = _detect_risk_types(signals, baseline)
        assert "alignment_issue" not in risks

    def test_chronic_rollovers_triggers_execution_issue(self):
        # DEFAULT_HEURISTIC_VERSION threshold is 4
        signals = _make_signals(chronic_rollover_count=4)
        baseline = _make_baseline()
        risks = _detect_risk_types(signals, baseline)
        assert "execution_issue" in risks

    def test_low_coverage_triggers_execution_issue(self):
        # DEFAULT_HEURISTIC_VERSION low_bet_coverage_threshold is 0.3
        signals = _make_signals(bet_coverage_pct=0.1)
        baseline = _make_baseline()
        risks = _detect_risk_types(signals, baseline)
        assert "execution_issue" in risks

    def test_placebo_productivity_triggers_risk(self):
        # DEFAULT_HEURISTIC_VERSION placebo_productivity_threshold is 0.7
        signals = _make_signals(placebo_productivity_score=0.8)
        baseline = _make_baseline()
        risks = _detect_risk_types(signals, baseline)
        assert "placebo_productivity" in risks

    def test_multiple_risks_detected_simultaneously(self):
        signals = _make_signals(
            hypothesis_present=False,
            chronic_rollover_count=5,
            cross_team_thrash_signals=4,
        )
        baseline = _make_baseline(hypothesis_required=True)
        risks = _detect_risk_types(signals, baseline)
        assert "strategy_unclear" in risks
        assert "execution_issue" in risks
        assert "alignment_issue" in risks
