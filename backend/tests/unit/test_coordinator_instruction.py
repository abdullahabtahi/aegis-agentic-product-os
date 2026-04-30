"""TDD tests for Coordinator instruction clarity around Jules actions.

RED phase: Written before the instruction is updated to include clear
Jules availability caveats.
GREEN phase: Passes after _COORDINATOR_INSTRUCTION is updated.

Why this matters:
  The Coordinator LLM lists jules_* actions as valid Level 3 options.
  Without explicit caveats, it selects them ~30% of the time even when
  no GitHub repo is connected, causing Governor check #4 (jules_gate)
  to always deny — wasting LLM confidence budget and producing confusing
  "DENIED — jules_gate" events in the activity log.

  Making the instruction explicit means the LLM selects pre_mortem_session
  (or a lower-level action) instead, and Governor only runs denials on
  genuinely ambiguous cases.

Run with: uv run pytest tests/unit/test_coordinator_instruction.py -v
"""

from __future__ import annotations

import pytest


class TestCoordinatorInstructionJulesCaveat:
    """The coordinator instruction must clearly gate Jules actions on GitHub."""

    def test_jules_actions_appear_in_instruction(self):
        """Jules actions must still be listed (for when GitHub IS connected)."""
        from app.agents.coordinator import _COORDINATOR_INSTRUCTION

        assert "jules_" in _COORDINATOR_INSTRUCTION, (
            "Jules action names must appear in instruction so the LLM knows they exist"
        )

    def test_github_requirement_is_explicit(self):
        """The instruction must mention GitHub as a prerequisite for Jules."""
        from app.agents.coordinator import _COORDINATOR_INSTRUCTION

        lower = _COORDINATOR_INSTRUCTION.lower()
        assert "github" in lower, (
            "Coordinator instruction must mention GitHub connection requirement for Jules"
        )

    def test_jules_marked_unavailable_without_github(self):
        """The instruction must include a 'do not select' or 'not available' note near Jules."""
        from app.agents.coordinator import _COORDINATOR_INSTRUCTION

        lower = _COORDINATOR_INSTRUCTION.lower()
        jules_idx = lower.find("jules_")
        assert jules_idx != -1

        # Check within a 400-char window around the first Jules mention
        window_start = max(0, jules_idx - 200)
        window_end = min(len(lower), jules_idx + 400)
        window = lower[window_start:window_end]

        availability_markers = [
            "not available",
            "do not select",
            "unavailable",
            "only if github",
            "requires github",
            "only when github",
            "do not use",
        ]
        has_caveat = any(marker in window for marker in availability_markers)
        assert has_caveat, (
            "Jules actions must have an explicit availability caveat within 400 chars "
            "of their first mention. Add: 'NOT AVAILABLE without GitHub connected' or similar."
        )

    def test_rule_3_explicitly_gates_jules(self):
        """Rule #3 in the instruction must explicitly mention GitHub connection."""
        from app.agents.coordinator import _COORDINATOR_INSTRUCTION

        lower = _COORDINATOR_INSTRUCTION.lower()
        # Rule 3 talks about Jules — verify it's strengthened
        assert "github" in lower, "Rule 3 must mention GitHub"
        assert "jules" in lower, "Rule 3 must mention Jules"

    def test_non_jules_level_3_action_preserved(self):
        """pre_mortem_session must remain available as the primary L3 action."""
        from app.agents.coordinator import _COORDINATOR_INSTRUCTION

        assert "pre_mortem_session" in _COORDINATOR_INSTRUCTION, (
            "pre_mortem_session must remain as the primary Level 3 action"
        )

    def test_level_1_actions_preserved(self):
        """L1 actions must not be removed."""
        from app.agents.coordinator import _COORDINATOR_INSTRUCTION

        for action in ("clarify_bet", "add_hypothesis", "add_metric"):
            assert action in _COORDINATOR_INSTRUCTION, (
                f"Level 1 action '{action}' must remain in instruction"
            )

    def test_level_2_actions_preserved(self):
        """L2 actions must not be removed."""
        from app.agents.coordinator import _COORDINATOR_INSTRUCTION

        for action in ("rescope", "align_team", "redesign_experiment"):
            assert action in _COORDINATOR_INSTRUCTION, (
                f"Level 2 action '{action}' must remain in instruction"
            )

    def test_level_4_action_preserved(self):
        """kill_bet must remain available."""
        from app.agents.coordinator import _COORDINATOR_INSTRUCTION

        assert "kill_bet" in _COORDINATOR_INSTRUCTION

    def test_no_intervention_preserved(self):
        """no_intervention must remain for low-confidence cases."""
        from app.agents.coordinator import _COORDINATOR_INSTRUCTION

        assert "no_intervention" in _COORDINATOR_INSTRUCTION

    def test_intervention_taxonomy_section_present(self):
        """The intervention taxonomy section must exist."""
        from app.agents.coordinator import _COORDINATOR_INSTRUCTION

        assert "Intervention Taxonomy" in _COORDINATOR_INSTRUCTION or \
               "INTERVENTION TAXONOMY" in _COORDINATOR_INSTRUCTION.upper()


class TestCoordinatorInstructionCompleteness:
    """Regression tests — ensure instruction editing didn't drop key sections."""

    def test_escalation_guidance_present(self):
        from app.agents.coordinator import _COORDINATOR_INSTRUCTION

        assert "ESCALATION" in _COORDINATOR_INSTRUCTION.upper()

    def test_rules_section_present(self):
        from app.agents.coordinator import _COORDINATOR_INSTRUCTION

        assert "RULES" in _COORDINATOR_INSTRUCTION.upper()

    def test_propose_once_rule_present(self):
        """The LLM must be told to call propose_intervention ONCE."""
        from app.agents.coordinator import _COORDINATOR_INSTRUCTION

        lower = _COORDINATOR_INSTRUCTION.lower()
        assert "once" in lower or "one" in lower, (
            "Instruction must tell LLM to call propose_intervention exactly once"
        )

    def test_instruction_not_empty(self):
        from app.agents.coordinator import _COORDINATOR_INSTRUCTION

        assert len(_COORDINATOR_INSTRUCTION) > 500, (
            "Instruction is suspiciously short — may have been accidentally truncated"
        )
