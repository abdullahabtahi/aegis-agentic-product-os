"""Signal Engine — Component 1 of the Aegis pipeline.

Type: Deterministic ADK BaseAgent subclass — NOT an LLM agent.
Participates in ADK event loop (emits events, session state propagation, eval compatibility).
No LLM calls. All logic is pure Python + Linear GraphQL API reads.

Contract (from CLAUDE.md):
- Always bounded to 14-day read window — hard invariant
- Reads: Linear issues/projects, relations graph, AlloyDB snapshots (Phase 2)
- Produces: LinearSignals + BetSnapshot persisted to session state
- Does NOT: interpret signals, infer risk type, write to Linear, make LLM calls
- Writes to session state: "linear_signals", "bet_snapshot"
- Future: integrated with McpToolset for agent-led interventions.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timezone

from google.adk.agents import BaseAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event
from google.genai import types

from models.schema import (
    Bet,
    BetHealthBaseline,
    BetSnapshot,
    EvidenceIssue,
    LinearSignals,
    RiskType,
    ScanErrorCode,
)
from tools.linear_tools import MockLinearMCP, RealLinearMCP, get_linear_mcp

# Union type alias — Signal Engine accepts both Mock and Real
LinearMCPClient = MockLinearMCP | RealLinearMCP


# ─────────────────────────────────────────────
# DETERMINISTIC COMPUTATION FUNCTIONS
# ─────────────────────────────────────────────

_MONITORING_PERIOD_DAYS = 14  # hard constant — never change without CLAUDE.md update


def _compute_bet_coverage(
    issues: list,
    project_ids: set[str],
) -> tuple[int, int, float]:
    """Returns (total, mapped, coverage_pct)."""
    total = len(issues)
    if total == 0:
        return 0, 0, 0.0
    mapped = sum(1 for i in issues if i.project_id in project_ids)
    return total, mapped, round(mapped / total, 4)


def _compute_rollovers(issues: list) -> tuple[int, int]:
    """Returns (rollover_count, chronic_rollover_count). Chronic = roll_count >= 2."""
    rollover_count = sum(1 for i in issues if i.rolled_over)
    chronic_rollover_count = sum(1 for i in issues if i.roll_count >= 2)
    return rollover_count, chronic_rollover_count


def _hypothesis_present(bet: Bet) -> bool:
    return bool(bet.hypothesis and len(bet.hypothesis.strip()) > 20)


def _metric_linked(issues: list) -> tuple[bool, str | None]:
    """Detect metric pattern in any issue description. Returns (found, source_issue_id)."""
    import re

    # Look for numeric targets or hypothesis patterns
    patterns = [
        r"\d+%",  # percentage targets
        r"target\s*[:=]\s*\d",  # target: N
        r"goal\s*[:=]\s*\d",  # goal: N
        r"we believe .+ will result in",  # hypothesis pattern
        r"success\s*[:=]",  # success: ...
        r">= \d",  # >= N
        r"increase .+ by \d+",  # increase X by N
    ]
    combined = re.compile("|".join(patterns), re.IGNORECASE)
    for issue in issues:
        if issue.description and combined.search(issue.description):
            return True, issue.id
    return False, None


def _misc_ticket_pct(issues: list, project_ids: set[str]) -> float:
    """Pct of issues not mapped to any active project (misc/chore work)."""
    total = len(issues)
    if total == 0:
        return 0.0
    unmapped = sum(1 for i in issues if i.project_id not in project_ids)
    return round(unmapped / total, 4)


def _placebo_productivity_score(issues: list, project_ids: set[str]) -> float | None:
    """Pct of closed (done) issues that are NOT bet-mapped. L/N/O signal."""
    done = [i for i in issues if i.status.lower() in ("done", "completed", "closed")]
    if not done:
        return None
    unmapped_done = sum(1 for i in done if i.project_id not in project_ids)
    return round(unmapped_done / len(done), 4)


def _compute_health_score(
    signals: LinearSignals,
    baseline: BetHealthBaseline,
) -> float:
    """Health score 0–100. Higher = healthier bet execution.

    Weights are from HeuristicVersion v1.0.0 defaults.
    AutoResearch (Phase 4) will tune these per workspace.
    """
    score = 100.0

    # Coverage penalty
    if signals.bet_coverage_pct < baseline.expected_bet_coverage_pct:
        gap = baseline.expected_bet_coverage_pct - signals.bet_coverage_pct
        score -= gap * 40  # up to -40 pts for zero coverage

    # Chronic rollover penalty
    score -= signals.chronic_rollover_count * 8  # -8 per chronic rollover

    # Hypothesis penalty
    if baseline.hypothesis_required and not signals.hypothesis_present:
        score -= 15

    # Metric penalty
    if baseline.metric_linked_required and not signals.metric_linked:
        score -= 10

    # Cross-team thrash penalty
    if signals.cross_team_thrash_signals >= 3:
        score -= 12

    # Misc ticket penalty
    if signals.misc_ticket_pct > 0.5:
        score -= (signals.misc_ticket_pct - 0.5) * 20

    return round(max(0.0, min(100.0, score)), 1)


def _detect_risk_types(
    signals: LinearSignals,
    baseline: BetHealthBaseline,
) -> list[RiskType]:
    """Deterministic risk type detection from LinearSignals.

    NOTE: This is Signal Engine's pre-filter, not Product Brain's classification.
    Signal Engine detects which risk categories have evidence; Product Brain reasons
    about severity, confidence, and generates founder-facing copy.
    """
    from models.schema import DEFAULT_HEURISTIC_VERSION

    thresholds = DEFAULT_HEURISTIC_VERSION.risk_thresholds
    detected: list[RiskType] = []

    # strategy_unclear: missing hypothesis OR missing metric
    if (baseline.hypothesis_required and not signals.hypothesis_present) or (
        baseline.metric_linked_required and not signals.metric_linked
    ):
        detected.append("strategy_unclear")

    # alignment_issue: cross-team thrash above threshold
    if signals.cross_team_thrash_signals >= thresholds.cross_team_thrash_threshold:
        detected.append("alignment_issue")

    # execution_issue: chronic rollovers above threshold OR low coverage
    if (
        signals.chronic_rollover_count >= thresholds.chronic_rollover_threshold
        or signals.bet_coverage_pct < thresholds.low_bet_coverage_threshold
    ):
        detected.append("execution_issue")

    # placebo_productivity: high closed rate but low bet-mapped
    if (
        signals.placebo_productivity_score is not None
        and signals.placebo_productivity_score
        >= thresholds.placebo_productivity_threshold
    ):
        detected.append("placebo_productivity")

    return detected


async def compute_signals(
    workspace_id: str,  # Phase 2+: used for AlloyDB bet history scoping
    bet: Bet,
    linear_mcp: LinearMCPClient,
    monitoring_period_days: int = _MONITORING_PERIOD_DAYS,
) -> BetSnapshot:
    """Compute LinearSignals + BetSnapshot for a bet. Deterministic, no LLM.

    This is the testable core function (TDD target). SignalEngineAgent wraps this.

    Args:
        workspace_id: Workspace ID (Phase 2+: AlloyDB scoping).
        bet: The bet being monitored.
        linear_mcp: RealLinearMCP live client.
        monitoring_period_days: Always 14. Parameter exists for Replay Mode only.

    Returns:
        BetSnapshot with LinearSignals, health_score, risk_types_present.
        status="error" with error_code if Linear API fails (never raises).
    """
    if monitoring_period_days > 14:
        raise ValueError(
            f"Signal Engine is bounded to 14 days max. Got {monitoring_period_days}. "
            "This is a hard architectural invariant."
        )

    now = datetime.now(timezone.utc)
    period_start = now.isoformat()
    period_end = now.isoformat()

    try:
        project_ids = set(bet.linear_project_ids)

        # Fetching active issues from live Linear workspace
        issues = await linear_mcp.list_issues(
            project_ids=list(project_ids),
            days=monitoring_period_days,
        )

        # Read relations (for cross-team thrash signal)
        issue_ids = [i.id for i in issues]
        relations = await linear_mcp.list_issue_relations(issue_ids=issue_ids)

        # Compute all signals
        total, mapped, coverage_pct = _compute_bet_coverage(issues, project_ids)
        rollover_count, chronic_rollover_count = _compute_rollovers(issues)
        hypothesis_present = _hypothesis_present(bet)
        metric_found, metric_source = _metric_linked(issues)
        blocked_count = sum(1 for r in relations if r.type == "blocked_by")
        cross_team_count = sum(1 for r in relations if r.to_team is not None)
        misc_pct = _misc_ticket_pct(issues, project_ids)
        placebo_score = _placebo_productivity_score(issues, project_ids)
        scope_change_count = sum(
            1
            for i in issues
            if "refactor" in i.title.lower() or "migrate" in i.title.lower()
        )

        # Build evidence issues (top 10 based on rollovers)
        sorted_issues = sorted(
            issues,
            key=lambda i: (not i.rolled_over, getattr(i, "roll_count", 0)),
            reverse=False,
        )
        evidence_issues = [
            EvidenceIssue(
                id=i.id,
                title=i.title,
                status=i.status,
                url=f"https://linear.app/issue/{i.id}",
            )
            for i in sorted_issues[:10]
        ]

        signals = LinearSignals(
            total_issues_analyzed=total,
            bet_mapped_issues=mapped,
            bet_coverage_pct=coverage_pct,
            rollover_count=rollover_count,
            chronic_rollover_count=chronic_rollover_count,
            blocked_count=blocked_count,
            misc_ticket_pct=misc_pct,
            hypothesis_present=hypothesis_present,
            metric_linked=metric_found,
            metric_linked_source=metric_source,
            cross_team_thrash_signals=cross_team_count,
            scope_change_count=scope_change_count,
            read_window_days=_MONITORING_PERIOD_DAYS,  # always 14
            placebo_productivity_score=placebo_score,
            evidence_issues=evidence_issues,
        )

        health_score = _compute_health_score(signals, bet.health_baseline)
        risk_types_present = _detect_risk_types(signals, bet.health_baseline)

        return BetSnapshot(
            id=str(uuid.uuid4()),
            bet_id=bet.id,
            captured_at=now.isoformat(),
            period_start=period_start,
            period_end=period_end,
            linear_signals=signals,
            health_score=health_score,
            risk_types_present=risk_types_present,
            status="ok",
            # Phase 2: hypothesis_staleness_days computed from HypothesisExperiment table
            hypothesis_staleness_days=None,  # None = not computed (never default to 0)
            hypothesis_experiment_count=0,
            last_experiment_outcome=None,
            similar_bet_outcome_pct=None,
            outcome_pattern_source_count=0,
        )

    except ValueError:
        # Re-raise invariant violations (e.g., days > 14) — these are programming errors
        raise
    except Exception as exc:
        # All other errors → BetSnapshot with status="error"
        # UI shows "Scan failed — last checked [date]". Never surfaces stale "healthy" data.
        error_code: ScanErrorCode = "api_timeout"
        err_str = str(exc).lower()
        if "rate" in err_str or "quota" in err_str:
            error_code = "rate_limit"
        elif "auth" in err_str or "token" in err_str or "credential" in err_str:
            error_code = "auth_expired"
        elif "empty" in err_str or "no issue" in err_str:
            error_code = "empty_workspace"

        return BetSnapshot(
            id=str(uuid.uuid4()),
            bet_id=bet.id,
            captured_at=now.isoformat(),
            period_start=period_start,
            period_end=period_end,
            linear_signals=LinearSignals(
                total_issues_analyzed=0,
                bet_mapped_issues=0,
                bet_coverage_pct=0.0,
                rollover_count=0,
                chronic_rollover_count=0,
                blocked_count=0,
                misc_ticket_pct=0.0,
                hypothesis_present=False,
                metric_linked=False,
                cross_team_thrash_signals=0,
                scope_change_count=0,
                read_window_days=_MONITORING_PERIOD_DAYS,
            ),
            health_score=0.0,
            risk_types_present=[],
            status="error",
            error_code=error_code,
            hypothesis_staleness_days=None,
        )


# ─────────────────────────────────────────────
# ADK AGENT WRAPPER
# ─────────────────────────────────────────────


class SignalEngineAgent(BaseAgent):
    """ADK BaseAgent wrapper around compute_signals().

    Reads context from session state, runs deterministic computation,
    writes results back to session state for downstream agents.

    Session state keys read:
      "bet"          → Bet dict (injected before pipeline run)
      "workspace_id" → str

    Session state keys written:
      "linear_signals"  → LinearSignals dict (for Product Brain)
      "bet_snapshot"    → BetSnapshot dict (for Governor + persistence)
      "pipeline_checkpoint" → "signal_engine_complete" (crash recovery)
    """

    def _parse_bet_from_user_message(
        self, ctx: InvocationContext
    ) -> tuple[dict | None, str]:
        """Extract bet and workspace_id from user message JSON.

        ADK web playground sends the initial payload as a user message text,
        not as pre-loaded session state. This parses that JSON and populates
        session state so downstream agents can read it normally.
        """
        for event in reversed(ctx.session.events or []):
            if not event.content or event.content.role != "user":
                continue
            for part in event.content.parts or []:
                if not part.text:
                    continue
                try:
                    payload = json.loads(part.text)
                except (json.JSONDecodeError, TypeError):
                    continue
                if isinstance(payload, dict) and "bet" in payload:
                    bet_dict = payload["bet"]
                    workspace_id = payload.get("workspace_id", "")
                    workspace = payload.get("workspace", {})
                    # Populate session state for downstream agents
                    ctx.session.state["bet"] = bet_dict
                    ctx.session.state["workspace_id"] = workspace_id
                    if workspace:
                        ctx.session.state["workspace"] = workspace
                    return bet_dict, workspace_id
        return None, ""

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        # Check pipeline checkpoint — skip if already completed (crash recovery + re-invocation)
        checkpoint = ctx.session.state.get("pipeline_checkpoint", "")
        if checkpoint and checkpoint != "":
            yield Event(
                invocation_id=ctx.invocation_id,
                author=self.name,
                content=types.Content(
                    role="model",
                    parts=[
                        types.Part.from_text(
                            text="[SignalEngine] Skipped — checkpoint exists"
                        )
                    ],
                ),
            )
            return

        bet_dict = ctx.session.state.get("bet")
        workspace_id = ctx.session.state.get("workspace_id", "")

        # ADK web sends JSON as a user message, not pre-loaded session state.
        # Parse bet/workspace from the latest user message if not in state.
        if not bet_dict:
            bet_dict, workspace_id = self._parse_bet_from_user_message(ctx)

        if not bet_dict:
            yield Event(
                invocation_id=ctx.invocation_id,
                author=self.name,
                content=types.Content(
                    role="model",
                    parts=[
                        types.Part.from_text(
                            text="[SignalEngine] ERROR: 'bet' missing from session state"
                        )
                    ],
                ),
            )
            return

        bet = Bet.model_validate(bet_dict)

        # Emit progress event before fetching data
        yield Event(
            invocation_id=ctx.invocation_id,
            author=self.name,
            content=types.Content(
                role="model",
                parts=[
                    types.Part.from_text(
                        text="[SignalEngine] Scanning Linear workspace..."
                    )
                ],
            ),
        )

        # Initialize Linear MCP dynamically to pick up environment variable changes (Real vs Mock)
        linear_mcp = get_linear_mcp()

        try:
            snapshot = await compute_signals(
                workspace_id=workspace_id,
                bet=bet,
                linear_mcp=linear_mcp,
            )

            # Write to session state — downstream agents read from here
            ctx.session.state["linear_signals"] = snapshot.linear_signals.model_dump()
            ctx.session.state["bet_snapshot"] = snapshot.model_dump()
            ctx.session.state["pipeline_checkpoint"] = "signal_engine_complete"

            status_msg = (
                f"[SignalEngine] OK — health={snapshot.health_score}, "
                f"coverage={snapshot.linear_signals.bet_coverage_pct:.0%}, "
                f"risks={snapshot.risk_types_present}"
            )
            if snapshot.status == "error":
                status_msg = f"[SignalEngine] {snapshot.error_code.replace('_', ' ').capitalize()}"

        except Exception as e:
            status_msg = f"[SignalEngine] CRITICAL ERROR — {e!s}"
            # Ensure we don't crash the whole pipeline, but report the error
            ctx.session.state["pipeline_checkpoint"] = "signal_engine_failed"

        yield Event(
            invocation_id=ctx.invocation_id,
            author=self.name,
            content=types.Content(
                role="model",
                parts=[types.Part.from_text(text=status_msg)],
            ),
        )


def create_signal_engine_agent() -> SignalEngineAgent:
    """Factory — always returns a fresh instance with no pre-existing parent.

    ADK eval re-validates Pydantic models per test case; module-level singletons
    cause 'already has a parent' errors when the validator runs twice on the same
    object. Always use this factory in pipeline construction.
    """
    return SignalEngineAgent(
        name="signal_engine",
        description="Deterministic Signal Engine — reads Linear, computes LinearSignals and BetSnapshot.",
    )
