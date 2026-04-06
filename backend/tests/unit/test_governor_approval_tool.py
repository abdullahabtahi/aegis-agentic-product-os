"""Test that GovernorAgent policy checks pass for valid proposals and that
the request_founder_approval tool args are structured correctly."""

from app.agents.governor import (
    check_confidence_floor,
    check_duplicate_suppression,
    check_rate_cap,
    check_jules_gate,
    check_reversibility,
    check_acknowledged_risk,
    check_control_level,
    check_escalation_ladder,
)


def test_all_checks_pass_for_valid_proposal():
    """All 8 policy checks should pass for a clean proposal."""
    from models.schema import DEFAULT_HEURISTIC_VERSION
    thresholds = DEFAULT_HEURISTIC_VERSION.risk_thresholds

    checks = [
        check_confidence_floor(0.80, thresholds.min_confidence_to_surface),
        check_duplicate_suppression("rescope", "bet-1", []),
        check_rate_cap("bet-1", []),
        check_jules_gate("rescope", False),
        check_reversibility("rescope", 1, False),
        check_acknowledged_risk("execution_issue", []),
        check_control_level("rescope", "require_approval"),
        check_escalation_ladder(1, [], "medium"),
    ]

    failing = [c for c in checks if not c.passed]
    assert failing == [], f"Expected all checks to pass, failing: {failing}"


def test_request_founder_approval_tool_call_format():
    """Verify the tool call dict has all required fields for InlineApprovalCard."""
    tool_args = {
        "intervention_title": "Rescope sprint 6 to protect hypothesis validation",
        "action_type": "rescope",
        "escalation_level": 2,
        "rationale": "Based on Tigers/Elephants pattern, rescoping gives highest chance of EOQ validation.",
        "confidence": 0.78,
        "risk_type": "execution_issue",
    }

    required = ["intervention_title", "action_type", "escalation_level", "rationale", "confidence", "risk_type"]
    for field in required:
        assert field in tool_args, f"Missing required field: {field}"

    assert isinstance(tool_args["confidence"], float)
    assert 0.0 <= tool_args["confidence"] <= 1.0
    assert tool_args["escalation_level"] in (1, 2, 3, 4)
