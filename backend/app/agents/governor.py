"""Governor / Policy Engine — Component 4 of the Aegis pipeline.

Type: Deterministic ADK BaseAgent subclass — NOT an LLM agent.
8 policy checks, all must pass. No LLM calls. Hard rules, not vibes.

Policy checks (from CLAUDE.md — immutable, never tuned by AutoResearch):
  1. confidence_floor         → risk_signal.confidence >= 0.65
  2. duplicate_suppression    → no identical action_type on same bet in last 30 days
  3. rate_cap                 → max 1 intervention per bet per 7 days
  4. jules_gate               → Jules actions require GitHub connected
  5. reversibility_check      → kill_bet / draft_document at L3+ flagged high-visibility
  6. acknowledged_risk        → risk_type matches AcknowledgedRisk → auto-deny
  7. control_level            → workspace.control_level determines execution path
  8. escalation_ladder        → proposed escalation_level must not skip rungs

Coordinator RECOMMENDS, Governor ENFORCES. This is why escalation_ladder
is here and not in the Coordinator LLM.

Writes to session state:
  "governor_decision"       → GovernorDecision dict (approved/denied)
  "pipeline_checkpoint"     → "governor_complete"
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import AsyncGenerator

from google.adk.agents import BaseAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event
from google.genai import types

from app.override_teach import should_suppress
from models.responses import GovernorDecision, PolicyCheckResult
from models.schema import DEFAULT_HEURISTIC_VERSION, BlastRadiusPreview, PolicyDenialReason


# ─────────────────────────────────────────────
# POLICY CHECKS (deterministic functions — each returns PolicyCheckResult)
# ─────────────────────────────────────────────


def _is_within_window(iso_timestamp: str, cutoff: datetime) -> bool:
    """Check if an ISO 8601 timestamp is at or after the cutoff datetime.

    Returns False for missing/malformed timestamps (fail-open: don't block
    new interventions because of bad historical data).
    """
    if not iso_timestamp:
        return False
    try:
        dt = datetime.fromisoformat(iso_timestamp.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt >= cutoff
    except (ValueError, TypeError):
        return False

def check_confidence_floor(
    confidence: float,
    floor: float,
) -> PolicyCheckResult:
    passed = confidence >= floor
    return PolicyCheckResult(
        check_name="confidence_floor",
        passed=passed,
        denial_reason="confidence_below_floor" if not passed else None,
        details=f"confidence={confidence:.2f}, floor={floor:.2f}",
    )


def check_duplicate_suppression(
    action_type: str,
    _bet_id: str,
    prior_interventions: list[dict],
    window_days: int = 30,
) -> PolicyCheckResult:
    """No identical action_type on same bet in last window_days days."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)
    recent_same = [
        p for p in prior_interventions
        if p.get("action_type") == action_type
        and p.get("status") in ("accepted", "pending")
        and _is_within_window(p.get("created_at", ""), cutoff)
    ]
    passed = len(recent_same) == 0
    return PolicyCheckResult(
        check_name="duplicate_suppression",
        passed=passed,
        denial_reason="duplicate_suppression" if not passed else None,
        details=f"found {len(recent_same)} matching interventions in last {window_days}d",
    )


def check_rate_cap(
    _bet_id: str,
    prior_interventions: list[dict],
    rate_cap_days: int = 7,
) -> PolicyCheckResult:
    """Max 1 surfaced intervention per bet per rate_cap_days."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=rate_cap_days)
    recent = [
        p for p in prior_interventions
        if p.get("status") in ("pending", "accepted")
        and _is_within_window(p.get("created_at", ""), cutoff)
    ]
    passed = len(recent) == 0
    return PolicyCheckResult(
        check_name="rate_cap",
        passed=passed,
        denial_reason="rate_cap" if not passed else None,
        details=f"found {len(recent)} interventions in last {rate_cap_days}d",
    )


def check_jules_gate(
    action_type: str,
    workspace_has_github: bool,
) -> PolicyCheckResult:
    """Jules actions require GitHub repo connected."""
    is_jules = action_type.startswith("jules_")
    if is_jules and not workspace_has_github:
        return PolicyCheckResult(
            check_name="jules_gate",
            passed=False,
            denial_reason="jules_gate",
            details="Jules action requires GitHub repo connected (workspace.github_repo not set)",
        )
    return PolicyCheckResult(check_name="jules_gate", passed=True)


def check_reversibility(
    action_type: str,
    escalation_level: int,
    has_draft_document: bool,
) -> PolicyCheckResult:
    """Flag kill_bet and high-visibility draft_document actions for double-confirm.

    These are not denied — they pass but require double-confirm in UI.
    """
    needs_double_confirm = (
        action_type == "kill_bet"
        or (has_draft_document and escalation_level >= 3)
    )
    return PolicyCheckResult(
        check_name="reversibility_check",
        passed=True,  # never denied — but sets requires_double_confirm
        denial_reason=None,
        details="double_confirm_required" if needs_double_confirm else "ok",
    )


def check_acknowledged_risk(
    risk_type: str,
    acknowledged_risks: list[dict],
) -> PolicyCheckResult:
    """If risk_type matches AcknowledgedRisk on the bet → auto-deny."""
    matched = [ar for ar in acknowledged_risks if ar.get("risk_type") == risk_type]
    passed = len(matched) == 0
    return PolicyCheckResult(
        check_name="acknowledged_risk",
        passed=passed,
        denial_reason="acknowledged_risk" if not passed else None,
        details=f"matched {len(matched)} acknowledged risks",
    )


def check_control_level(
    action_type: str,
    control_level: str,
) -> PolicyCheckResult:
    """Workspace.control_level determines execution path.

    draft_only (L1): all actions surfaced as drafts, never auto-executed.
        Even after founder approval, actions are logged but not written to Linear.
    require_approval (L2, default): all actions require founder approval.
    autonomous_low_risk (L3): Level 1 actions can auto-execute without HITL.

    This check always passes — control_level affects execution path, not surfacing.
    The `details` field carries the control_level forward for the approved path logic.
    """
    return PolicyCheckResult(
        check_name="control_level",
        passed=True,
        details=f"control_level={control_level}, action_type={action_type}",
    )


def can_auto_execute(
    control_level: str,
    escalation_level: int,
    risk_severity: str,
) -> bool:
    """Determine if an intervention can skip HITL and auto-execute.

    Only autonomous_low_risk workspaces + Level 1 actions + low/medium severity
    qualify for auto-execution. Everything else requires founder approval.
    """
    if control_level != "autonomous_low_risk":
        return False
    if escalation_level > 1:
        return False
    if risk_severity in ("high", "critical"):
        return False
    return True


def check_escalation_ladder(
    proposed_level: int,
    prior_interventions: list[dict],
    risk_severity: str,
    chronic_rollover_count: int = 0,
) -> PolicyCheckResult:
    """Governor check #8 — hard escalation rule enforcement.

    Cannot skip escalation levels unless critical severity + chronic rollovers >= 3.
    Coordinator recommends; Governor enforces.
    """
    # Find max accepted escalation level for this bet
    accepted = [p for p in prior_interventions if p.get("status") == "accepted"]
    max_accepted_level = max((p.get("escalation_level", 0) for p in accepted), default=0)

    # Critical exception: skip to Level 3 allowed if severity critical + 3+ chronic rollovers
    critical_exception = (
        risk_severity == "critical" and chronic_rollover_count >= 3
    )

    if proposed_level > max_accepted_level + 1 and not critical_exception:
        return PolicyCheckResult(
            check_name="escalation_ladder",
            passed=False,
            denial_reason="escalation_ladder",
            details=(
                f"proposed_level={proposed_level}, max_accepted={max_accepted_level}. "
                f"Cannot skip rungs. Retry with level {max_accepted_level + 1} or lower."
            ),
        )
    return PolicyCheckResult(
        check_name="escalation_ladder",
        passed=True,
        details=f"ok — level {proposed_level} (max_accepted={max_accepted_level})",
    )


# ─────────────────────────────────────────────
# BLAST RADIUS PREVIEW (deterministic — uses already-computed BetSnapshot data)
# ─────────────────────────────────────────────

# Action types that warrant blast radius computation (Level 3-4 or destructive)
_BLAST_RADIUS_ACTION_TYPES = frozenset({
    "kill_bet", "rescope", "pre_mortem_session",
    "jules_refactor_blocker", "jules_add_guardrails",
    "jules_instrument_experiment", "jules_scaffold_experiment",
})


def compute_blast_radius(
    action_type: str,
    bet_snapshot: dict,
    bet: dict,
) -> BlastRadiusPreview | None:
    """Compute blast radius from already-computed BetSnapshot data.

    NO fresh Linear API call — Signal Engine already bounded reads to 14 days.
    Returns None for low-impact actions that don't need a blast radius warning.
    """
    if action_type not in _BLAST_RADIUS_ACTION_TYPES:
        return None

    linear_signals = bet_snapshot.get("linear_signals", {})
    total_issues = linear_signals.get("total_issues_analyzed", 0)
    project_ids = bet.get("linear_project_ids", [])

    return BlastRadiusPreview(
        affected_issue_count=total_issues,
        affected_assignee_ids=[],  # Phase 4: extract from BetSnapshot if needed
        affected_project_ids=project_ids,
        estimated_notification_count=total_issues,
        reversible=action_type != "kill_bet",
    )


# ─────────────────────────────────────────────
# GOVERNOR AGENT
# ─────────────────────────────────────────────

class GovernorAgent(BaseAgent):
    """Deterministic policy gate — all 8 checks must pass.

    Reads from session state, runs 8 checks, writes GovernorDecision.
    Writes PolicyDeniedEvent if denied (Phase 2: persist to AlloyDB).
    """

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        # Check pipeline checkpoint (crash recovery + re-invocation after approval)
        checkpoint = ctx.session.state.get("pipeline_checkpoint", "")
        if checkpoint in (
            "governor_complete",
            "awaiting_founder_approval",
            "founder_approved",
            "founder_rejected",
            "executor_complete",
        ):
            yield Event(
                invocation_id=ctx.invocation_id,
                author=self.name,
                content=types.Content(
                    role="model",
                    parts=[types.Part.from_text(text="[Governor] Skipped — checkpoint exists")],
                ),
            )
            return

        proposal = ctx.session.state.get("intervention_proposal", "")
        if not proposal:
            # No proposal (e.g., Product Brain found no signal) — auto-pass
            ctx.session.state["governor_decision"] = GovernorDecision(
                approved=False,
                denial_reason="confidence_below_floor",
            ).model_dump()
            ctx.session.state["pipeline_checkpoint"] = "governor_complete"
            yield Event(
                invocation_id=ctx.invocation_id,
                author=self.name,
                content=types.Content(
                    role="model",
                    parts=[types.Part.from_text(text="[Governor] No proposal — confidence below floor")],
                ),
            )
            return

        # Parse proposal from session state
        # intervention_proposal is the raw output from Coordinator's propose_intervention tool
        if isinstance(proposal, str):
            # Parse if it came back as a string representation
            import json
            try:
                proposal = json.loads(proposal) if proposal.startswith("{") else {}
            except Exception:
                proposal = {}

        action_type = proposal.get("action_type", "no_intervention")
        escalation_level = int(proposal.get("escalation_level", 1))
        confidence = float(proposal.get("confidence", 0.0))

        # Read context from session state
        bet = ctx.session.state.get("bet", {})
        workspace = ctx.session.state.get("workspace", {})
        prior_interventions = ctx.session.state.get("prior_interventions", [])
        risk_signal_draft = ctx.session.state.get("risk_signal_draft", "")
        if isinstance(risk_signal_draft, str):
            risk_signal_draft = {}
        risk_type = risk_signal_draft.get("risk_type", "")
        risk_severity = risk_signal_draft.get("severity", "low")

        acknowledged_risks = bet.get("acknowledged_risks", [])
        control_level = workspace.get("control_level", "draft_only")
        workspace_has_github = bool(workspace.get("github_repo"))
        thresholds = DEFAULT_HEURISTIC_VERSION.risk_thresholds
        chronic_rollover_count = ctx.session.state.get("linear_signals", {}).get("chronic_rollover_count", 0)
        has_draft_document = bool(proposal.get("proposed_issue_description"))

        # Override & Teach: check if this pattern was rejected enough to auto-suppress
        rejection_history = ctx.session.state.get("rejection_history", [])
        suppressed, suppression_reason = should_suppress(
            rejection_history, risk_type, action_type,
            threshold=2, window_days=thresholds.auto_suppress_days,
        )
        if suppressed:
            decision = GovernorDecision(
                approved=False,
                denial_reason="override_teach_suppression",
            )
            msg = (
                f"[Governor] DENIED — override_teach_suppression: "
                f"({risk_type}, {action_type}, {suppression_reason}) rejected 2+ times"
            )
            ctx.session.state["governor_decision"] = decision.model_dump()
            ctx.session.state["pipeline_checkpoint"] = "governor_complete"
            # Persist trace + denied event
            from app.app_utils.trace_logging import log_governor_trace
            from db.repository import save_policy_denied_event
            await log_governor_trace(ctx.session.state, approved=False, denial_reason="override_teach_suppression")
            await save_policy_denied_event(
                bet_id=bet.get("id", ""),
                intervention_id="",
                denial_reason="override_teach_suppression",
            )
            yield Event(
                invocation_id=ctx.invocation_id,
                author=self.name,
                content=types.Content(
                    role="model",
                    parts=[types.Part.from_text(text=msg)],
                ),
            )
            return

        # Run all 8 checks in order
        checks: list[PolicyCheckResult] = [
            check_confidence_floor(confidence, thresholds.min_confidence_to_surface),
            check_duplicate_suppression(action_type, bet.get("id", ""), prior_interventions),
            check_rate_cap(bet.get("id", ""), prior_interventions, thresholds.intervention_rate_cap_days),
            check_jules_gate(action_type, workspace_has_github),
            check_reversibility(action_type, escalation_level, has_draft_document),
            check_acknowledged_risk(risk_type, acknowledged_risks),
            check_control_level(action_type, control_level),
            check_escalation_ladder(escalation_level, prior_interventions, risk_severity, chronic_rollover_count),
        ]

        # Find first failing check
        failing = next((c for c in checks if not c.passed), None)
        reversibility_check = next((c for c in checks if c.check_name == "reversibility_check"), None)
        requires_double_confirm = (
            reversibility_check is not None
            and reversibility_check.details == "double_confirm_required"
        )

        if failing:
            denial_reason: PolicyDenialReason = failing.denial_reason  # type: ignore[assignment]
            decision = GovernorDecision(
                approved=False,
                denial_reason=denial_reason,
                requires_double_confirm=False,
                blast_radius_attached=False,
            )
            msg = f"[Governor] DENIED — {denial_reason}: {failing.details}"
            ctx.session.state["governor_decision"] = decision.model_dump()
            ctx.session.state["policy_checks"] = [c.model_dump() for c in checks]
            ctx.session.state["pipeline_checkpoint"] = "governor_complete"
            # Persist trace + denied event
            from app.app_utils.trace_logging import log_governor_trace
            from db.repository import save_policy_denied_event
            await log_governor_trace(ctx.session.state, approved=False, denial_reason=denial_reason)
            await save_policy_denied_event(
                bet_id=bet.get("id", ""),
                intervention_id=proposal.get("id", ""),
                denial_reason=denial_reason,
            )
        else:
            # Compute blast radius for high-impact actions (Level 3-4, destructive)
            bet_snapshot = ctx.session.state.get("bet_snapshot", {})
            blast_radius = compute_blast_radius(action_type, bet_snapshot, bet)
            blast_radius_dict = blast_radius.model_dump() if blast_radius else None

            decision = GovernorDecision(
                approved=True,
                denial_reason=None,
                requires_double_confirm=requires_double_confirm,
                blast_radius_attached=blast_radius is not None,
            )
            msg = (
                f"[Governor] APPROVED — AWAITING_FOUNDER_APPROVAL. "
                f"action_type={action_type}, level={escalation_level}"
            )
            if requires_double_confirm:
                msg += " (double-confirm required)"
            if blast_radius:
                msg += f" (blast_radius: {blast_radius.affected_issue_count} issues)"

            # Control level enforcement: determine execution path
            auto_exec = can_auto_execute(control_level, escalation_level, risk_severity)

            ctx.session.state["governor_decision"] = decision.model_dump()
            ctx.session.state["policy_checks"] = [c.model_dump() for c in checks]

            if auto_exec:
                # autonomous_low_risk + L1 + low severity → skip HITL, auto-approve
                ctx.session.state["pipeline_status"] = "founder_approved"
                ctx.session.state["pipeline_checkpoint"] = "founder_approved"
                msg = (
                    f"[Governor] AUTO-APPROVED (autonomous_low_risk). "
                    f"action_type={action_type}, level={escalation_level}"
                )
            else:
                # Standard path: halt and await founder approval via CopilotKit
                ctx.session.state["pipeline_status"] = "awaiting_founder_approval"
                ctx.session.state["pipeline_checkpoint"] = "awaiting_founder_approval"
                # Emit tool args so CopilotKit useRenderTool renders InlineApprovalCard
                ctx.session.state["request_founder_approval_args"] = {
                    "intervention_title": proposal.get("title", "Intervention requires your approval"),
                    "action_type": action_type,
                    "escalation_level": escalation_level,
                    "rationale": proposal.get("rationale", ""),
                    "confidence": confidence,
                    "risk_type": risk_type,
                }
            # Persist trace (approved)
            from app.app_utils.trace_logging import log_governor_trace
            await log_governor_trace(ctx.session.state, approved=True)
            # Full intervention payload — CopilotKit renders this in InterventionApprovalCard
            ctx.session.state["awaiting_approval_intervention"] = {
                **proposal,
                "requires_double_confirm": requires_double_confirm,
                "blast_radius": blast_radius_dict,
                "risk_type": risk_type,
                "risk_severity": risk_severity,
                "control_level": control_level,
            }

        yield Event(
            invocation_id=ctx.invocation_id,
            author=self.name,
            content=types.Content(
                role="model",
                parts=[types.Part.from_text(text=msg)],
            ),
        )


def create_governor_agent() -> GovernorAgent:
    """Factory — always returns a fresh instance with no pre-existing parent.

    See signal_engine.py factory comment for why singletons break ADK eval.
    """
    return GovernorAgent(
        name="governor",
        description="Deterministic policy gate — 8 checks before any intervention reaches HITL surface.",
    )
