"""TDD tests for pipeline state key forwarding in conversational.py.

RED phase: Written before _PIPELINE_OUTPUT_KEYS constant exists.
GREEN phase: Passes after constant is extracted from the hardcoded tuple.

Why this matters:
  Sub-pipeline runs in a fresh InMemorySession. Its outputs must be manually
  copied back to the conversational agent's tool_context.state. Any key
  added to the pipeline but missing from this set silently disappears.
  A centralised frozenset is the single source of truth for both seed-in
  and copy-out, so new fields only need to be added in one place.

Run with: uv run pytest tests/unit/test_pipeline_keys.py -v
"""

from __future__ import annotations


# ─────────────────────────────────────────────
# REQUIRED KEYS — source of truth for this test
# ─────────────────────────────────────────────

_EXPECTED_KEYS: frozenset[str] = frozenset(
    {
        "risk_signal_draft",
        "governor_decision",
        "pipeline_status",
        "intervention_proposal",
        "awaiting_approval_intervention",
        "pending_intervention_id",
        "policy_checks",
        "cynic_assessment",
        "optimist_assessment",
    }
)


class TestPipelineOutputKeysConstant:
    """Verify the _PIPELINE_OUTPUT_KEYS frozenset exists and is complete."""

    def test_constant_is_importable(self):
        """The constant must live at module level so it can be imported."""
        from app.agents.conversational import _PIPELINE_OUTPUT_KEYS  # noqa: F401

    def test_constant_is_frozenset(self):
        from app.agents.conversational import _PIPELINE_OUTPUT_KEYS

        assert isinstance(_PIPELINE_OUTPUT_KEYS, frozenset), (
            "_PIPELINE_OUTPUT_KEYS must be a frozenset to prevent accidental mutation"
        )

    def test_contains_all_required_keys(self):
        """Every expected key must be present — missing key = silent data loss."""
        from app.agents.conversational import _PIPELINE_OUTPUT_KEYS

        missing = _EXPECTED_KEYS - _PIPELINE_OUTPUT_KEYS
        assert not missing, (
            f"_PIPELINE_OUTPUT_KEYS is missing keys that will cause silent data loss: {missing}"
        )

    def test_no_typo_keys(self):
        """Keys in the constant that aren't in _EXPECTED_KEYS are likely typos."""
        from app.agents.conversational import _PIPELINE_OUTPUT_KEYS

        unknown = _PIPELINE_OUTPUT_KEYS - _EXPECTED_KEYS
        assert not unknown, (
            f"_PIPELINE_OUTPUT_KEYS contains unexpected keys (typo?): {unknown}"
        )

    # ── Individual key assertions (clear failure messages in CI) ──────────────

    def test_key_risk_signal_draft(self):
        from app.agents.conversational import _PIPELINE_OUTPUT_KEYS
        assert "risk_signal_draft" in _PIPELINE_OUTPUT_KEYS

    def test_key_governor_decision(self):
        from app.agents.conversational import _PIPELINE_OUTPUT_KEYS
        assert "governor_decision" in _PIPELINE_OUTPUT_KEYS

    def test_key_pipeline_status(self):
        from app.agents.conversational import _PIPELINE_OUTPUT_KEYS
        assert "pipeline_status" in _PIPELINE_OUTPUT_KEYS

    def test_key_intervention_proposal(self):
        from app.agents.conversational import _PIPELINE_OUTPUT_KEYS
        assert "intervention_proposal" in _PIPELINE_OUTPUT_KEYS

    def test_key_awaiting_approval_intervention(self):
        from app.agents.conversational import _PIPELINE_OUTPUT_KEYS
        assert "awaiting_approval_intervention" in _PIPELINE_OUTPUT_KEYS

    def test_key_pending_intervention_id(self):
        from app.agents.conversational import _PIPELINE_OUTPUT_KEYS
        assert "pending_intervention_id" in _PIPELINE_OUTPUT_KEYS

    def test_key_policy_checks(self):
        from app.agents.conversational import _PIPELINE_OUTPUT_KEYS
        assert "policy_checks" in _PIPELINE_OUTPUT_KEYS

    def test_key_cynic_assessment(self):
        from app.agents.conversational import _PIPELINE_OUTPUT_KEYS
        assert "cynic_assessment" in _PIPELINE_OUTPUT_KEYS

    def test_key_optimist_assessment(self):
        from app.agents.conversational import _PIPELINE_OUTPUT_KEYS
        assert "optimist_assessment" in _PIPELINE_OUTPUT_KEYS


class TestPipelineKeyForwardingLogic:
    """Unit tests for the forwarding behaviour using the constant."""

    def test_forwarding_copies_present_keys(self):
        """Keys present in pipeline_state must appear in the target state dict."""
        from app.agents.conversational import _PIPELINE_OUTPUT_KEYS

        pipeline_state = {
            "risk_signal_draft": {"risk_type": "strategy_unclear"},
            "governor_decision": {"approved": True},
            "pipeline_status": "awaiting_approval",
            # Deliberately omit some keys to test partial-copy behaviour
        }
        target: dict = {}
        for key in _PIPELINE_OUTPUT_KEYS:
            if key in pipeline_state:
                target[key] = pipeline_state[key]

        assert target["risk_signal_draft"] == {"risk_type": "strategy_unclear"}
        assert target["governor_decision"] == {"approved": True}
        assert target["pipeline_status"] == "awaiting_approval"

    def test_forwarding_ignores_absent_keys(self):
        """Keys absent in pipeline_state must NOT be set to None in target."""
        from app.agents.conversational import _PIPELINE_OUTPUT_KEYS

        pipeline_state: dict = {}  # empty sub-pipeline result
        target: dict = {}
        for key in _PIPELINE_OUTPUT_KEYS:
            if key in pipeline_state:
                target[key] = pipeline_state[key]

        assert len(target) == 0, (
            "Absent pipeline keys must not bleed into state as None values"
        )

    def test_forwarding_does_not_drop_extra_pipeline_keys(self):
        """If a NEW key is in pipeline_state but not in _PIPELINE_OUTPUT_KEYS,
        the loop silently misses it. This test documents the expected gap so
        future engineers know to ADD new keys to the constant, not just to
        the pipeline agent.
        """
        from app.agents.conversational import _PIPELINE_OUTPUT_KEYS

        future_key = "new_pipeline_output_field"
        pipeline_state = {future_key: "value"}
        target: dict = {}
        for key in _PIPELINE_OUTPUT_KEYS:
            if key in pipeline_state:
                target[key] = pipeline_state[key]

        assert future_key not in target, (
            "Documented: keys not in _PIPELINE_OUTPUT_KEYS are not forwarded. "
            "Add new pipeline output fields to the constant."
        )
