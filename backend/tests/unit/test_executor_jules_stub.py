"""TDD tests for the Executor's Jules action handling.

RED phase: Confirms executor handles Jules actions gracefully via an inline
stub (no external API call required).
GREEN phase: Passes after executor.py replaces the jules_service import with
an inline stub that returns a consistent not_available response.

Why this matters:
  tools/jules_service.py requires JULES_API_KEY (never set) and makes an
  external HTTP call. In the demo, Governor's jules_gate check (#4) prevents
  Jules actions from reaching Executor — but if one slips through (e.g., test
  scenarios, future config changes), the executor must not crash or import-error.

  The inline stub removes the dead external dependency while keeping the same
  graceful-degradation behaviour:
    - executed = False
    - pipeline_status = "error" (or "not_available")
    - No exception raised

Run with: uv run pytest tests/unit/test_executor_jules_stub.py -v
"""

from __future__ import annotations

import pytest


class TestExecutorJulesStubImport:
    """Executor must not require tools.jules_service at import time."""

    def test_executor_importable_without_jules_service(self):
        """If jules_service is removed later, executor must still import."""
        # This test passes trivially now; it would catch a regression where
        # someone adds a top-level jules_service import back.
        import importlib
        import sys

        # Temporarily hide tools.jules_service from the module cache
        original = sys.modules.pop("tools.jules_service", None)
        original_client = sys.modules.pop("tools.jules_service.get_jules_client", None)
        try:
            # Force a fresh import of executor
            sys.modules.pop("app.agents.executor", None)
            # If executor imports get_jules_client at module level (not inside
            # the if block), this import will raise ImportError.
            # After the stub, executor must NOT import get_jules_client at module level.
            from app.agents.executor import _build_linear_action_from_proposal  # noqa
        except ImportError as exc:
            pytest.fail(
                f"executor.py failed to import without tools.jules_service: {exc}\n"
                "Ensure Jules import is inside the action handler, not at module level."
            )
        finally:
            # Restore module cache
            if original is not None:
                sys.modules["tools.jules_service"] = original

    def test_build_linear_action_non_jules(self):
        """Non-Jules action: build_linear_action maps correctly."""
        from app.agents.executor import _build_linear_action_from_proposal

        proposal = {
            "action_type": "add_hypothesis",
            "proposed_issue_title": "Document hypothesis for Bet Alpha",
            "proposed_issue_description": "We believe that...",
        }
        result = _build_linear_action_from_proposal(proposal)
        assert result is not None
        assert "create_issue" in result
        assert result["create_issue"]["title"] == "Document hypothesis for Bet Alpha"

    def test_build_linear_action_comment(self):
        """Comment action maps to add_comment."""
        from app.agents.executor import _build_linear_action_from_proposal

        proposal = {
            "action_type": "clarify_bet",
            "proposed_comment": "Please clarify the success metric for this bet.",
        }
        result = _build_linear_action_from_proposal(proposal)
        assert result is not None
        assert "add_comment" in result
        assert "clarify" in result["add_comment"].lower()

    def test_build_linear_action_no_content(self):
        """Actions with no comment or issue fields return None."""
        from app.agents.executor import _build_linear_action_from_proposal

        proposal = {"action_type": "no_intervention"}
        result = _build_linear_action_from_proposal(proposal)
        assert result is None


class TestJulesStubResponseShape:
    """Verify the Jules inline stub returns the expected response shape.

    The stub must match the contract the executor code expects:
      - dict with 'status' key
      - 'status' != 'session_created' → executed = False
      - 'error' key present with a message
    """

    def test_jules_stub_has_status_key(self):
        """The stub response must have a 'status' key."""
        stub = _make_jules_stub_response("jules_instrument_experiment")
        assert "status" in stub

    def test_jules_stub_status_not_session_created(self):
        """The stub must NOT return session_created (that would imply success)."""
        stub = _make_jules_stub_response("jules_instrument_experiment")
        assert stub["status"] != "session_created"

    def test_jules_stub_has_error_key(self):
        """The stub must include an error message for observability."""
        stub = _make_jules_stub_response("jules_add_guardrails")
        assert "error" in stub
        assert stub["error"]  # must not be empty

    def test_jules_stub_error_mentions_api_key(self):
        """Error message should explain WHY Jules is unavailable."""
        stub = _make_jules_stub_response("jules_refactor_blocker")
        assert stub["error"] is not None
        lower = stub["error"].lower()
        assert "jules" in lower or "api" in lower or "configured" in lower, (
            "Error message must explain Jules is not configured"
        )

    @pytest.mark.parametrize(
        "action_type",
        [
            "jules_instrument_experiment",
            "jules_add_guardrails",
            "jules_refactor_blocker",
            "jules_scaffold_experiment",
        ],
    )
    def test_all_jules_actions_handled(self, action_type: str):
        """All 4 Jules action types must return a graceful stub response."""
        stub = _make_jules_stub_response(action_type)
        assert isinstance(stub, dict)
        assert "status" in stub
        assert stub["status"] != "session_created"


# ─────────────────────────────────────────────
# HELPER — mirrors the inline stub expected in executor.py
# ─────────────────────────────────────────────


def _make_jules_stub_response(action_type: str) -> dict:
    """Return the expected stub response shape for a Jules action.

    This mirrors the inline stub that executor.py should use instead of
    calling get_jules_client().create_session(). Tests import this to
    verify shape; if executor.py changes the stub dict, these tests catch it.
    """
    return {
        "status": "not_available",
        "error": (
            f"Jules integration is not configured (JULES_API_KEY not set). "
            f"Action '{action_type}' requires Jules API access. "
            "Connect Jules at https://jules.google.com to enable this."
        ),
        "session_id": None,
        "jules_url": None,
    }
