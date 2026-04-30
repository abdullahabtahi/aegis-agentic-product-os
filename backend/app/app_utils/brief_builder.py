"""Weekly Founder Brief builder — Feature 009.

Pure function: no DB calls, no LLM calls.
Source: Ben Williams "weekly Impact and Learnings reviews".
Called by GET /brief endpoint, must complete in <300ms.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from models.schema import (
    BriefBetSummary,
    BriefMostUrgentIntervention,
    FounderBrief,
)

logger = logging.getLogger(__name__)

# Weekly question templates — ordered by priority
_TEMPLATE_KILL_CRITERIA = (
    "You committed to \"{condition}\" by {deadline}. What's your next move?"
)
_TEMPLATE_CRITICAL = (
    "\"{bet_name}\" has low conviction (score: {score}). "
    "Have you exhausted the possibilities, or just gotten tired?"
)
_TEMPLATE_STALE = (
    "It's been {days} days since your last scan. "
    "What changed since then that you haven't checked on?"
)
_TEMPLATE_HEALTHY = (
    "Your bets all look healthy. What assumption are you most confident about right now? "
    "Which one scares you most?"
)
_TEMPLATE_DEFAULT = (
    "If you could only move one bet forward meaningfully this week, which would it be and why?"
)
_TEMPLATE_EMPTY = "Declare your first strategic direction to get started."


def _monday_label(now: datetime) -> str:
    """Return 'Week of April 28, 2026' for the current ISO week's Monday."""
    days_since_monday = now.weekday()  # Monday=0, Sunday=6
    monday = now - timedelta(days=days_since_monday)
    return f"Week of {monday.strftime('%B %-d, %Y')}"


def build_founder_brief(
    workspace_id: str,
    bets: list[dict],
    snapshots_by_bet: dict[str, list[dict]],  # bet_id → [snapshot dicts], sorted newest first
    interventions: list[dict],
) -> FounderBrief:
    """Build a FounderBrief from pre-loaded workspace data.

    Args:
        workspace_id: The workspace to build for.
        bets: All active bets for the workspace (list of dicts).
        snapshots_by_bet: Dict mapping bet_id to a list of snapshot dicts,
            sorted newest-first. May be empty.
        interventions: All interventions for the workspace (list of dicts).

    Returns:
        FounderBrief value object (immutable).
    """
    now = datetime.now(timezone.utc)
    week_label = _monday_label(now)

    if not bets:
        return FounderBrief(
            workspace_id=workspace_id,
            generated_at=now.isoformat(),
            week_label=week_label,
            bets_improving=[],
            bets_at_risk=[],
            pending_intervention_count=0,
            most_urgent_intervention=None,
            weekly_question=_TEMPLATE_EMPTY,
            total_bets=0,
            avg_conviction=None,
            scans_this_week=0,
        )

    # ── Build BriefBetSummary for each bet ──────────────────────────────────
    summaries: list[BriefBetSummary] = []
    conviction_totals: list[float] = []

    one_week_ago = now - timedelta(days=7)

    for bet in bets:
        bet_id = bet["id"]
        bet_name = bet.get("name", "Unnamed bet")
        snaps = snapshots_by_bet.get(bet_id, [])

        # Latest snapshot
        latest = snaps[0] if snaps else None
        latest_cs_total: float | None = None
        latest_level = "nascent"

        if latest:
            cs = latest.get("conviction_score") or {}
            if cs:
                latest_cs_total = cs.get("total")
                latest_level = cs.get("level", "nascent")
                if latest_cs_total is not None:
                    conviction_totals.append(latest_cs_total)

        # Prior-week snapshot for delta
        prior_cs_total: float | None = None
        for snap in snaps[1:]:
            try:
                cap = datetime.fromisoformat(snap.get("captured_at", ""))
                if cap.tzinfo is None:
                    cap = cap.replace(tzinfo=timezone.utc)
                if cap <= one_week_ago:
                    prior_cs = snap.get("conviction_score") or {}
                    prior_cs_total = prior_cs.get("total") if prior_cs else None
                    break
            except (ValueError, TypeError):
                continue

        conviction_delta: float | None = None
        if latest_cs_total is not None and prior_cs_total is not None:
            conviction_delta = round(latest_cs_total - prior_cs_total, 1)

        # Kill criteria status
        kc = bet.get("kill_criteria") or {}
        kc_status: str | None = kc.get("status") if kc else None
        kc_condition: str | None = kc.get("condition") if kc else None

        summaries.append(BriefBetSummary(
            bet_id=bet_id,
            bet_name=bet_name,
            conviction_delta=conviction_delta,
            conviction_level=latest_level,  # type: ignore[arg-type]
            conviction_total=latest_cs_total or 0.0,
            kill_criteria_status=kc_status,  # type: ignore[arg-type]
            kill_criteria_condition=kc_condition,
        ))

    # ── bets_improving ──────────────────────────────────────────────────────
    improving = sorted(
        [s for s in summaries if s.conviction_delta is not None and s.conviction_delta > 0],
        key=lambda s: s.conviction_delta or 0,
        reverse=True,
    )[:3]

    # ── bets_at_risk ────────────────────────────────────────────────────────
    at_risk_raw = [
        s for s in summaries
        if s.conviction_level == "critical" or s.kill_criteria_status == "triggered"
    ]
    # Sort: triggered kill criteria first, then by conviction ascending
    at_risk = sorted(
        at_risk_raw,
        key=lambda s: (
            0 if s.kill_criteria_status == "triggered" else 1,
            s.conviction_total,
        ),
    )[:3]

    # ── pending interventions ───────────────────────────────────────────────
    pending = [i for i in interventions if i.get("status") == "pending"]
    pending_count = len(pending)

    most_urgent: BriefMostUrgentIntervention | None = None
    if pending:
        _sev_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        sorted_pending = sorted(
            pending,
            key=lambda i: _sev_order.get(i.get("severity", "low"), 3),
        )
        top = sorted_pending[0]
        risk_signal = top.get("risk_signal") or {}
        most_urgent = BriefMostUrgentIntervention(
            id=top["id"],
            bet_name=top.get("bet_name", "Unknown bet"),
            action_type=top.get("action_type", "clarify_bet"),  # type: ignore[arg-type]
            severity=risk_signal.get("severity", "medium"),  # type: ignore[arg-type]
            headline=risk_signal.get("headline", top.get("title", "")),
        )

    # ── weekly question selection ────────────────────────────────────────────
    weekly_question = _select_weekly_question(bets, summaries, now)

    # ── avg conviction ──────────────────────────────────────────────────────
    avg_conviction = (
        round(sum(conviction_totals) / len(conviction_totals), 1)
        if conviction_totals
        else None
    )

    # ── scans this week ─────────────────────────────────────────────────────
    scans_this_week = 0
    week_start = now - timedelta(days=now.weekday())  # Monday 00:00
    for bet in bets:
        lm = bet.get("last_monitored_at")
        if lm:
            try:
                lm_dt = datetime.fromisoformat(lm)
                if lm_dt.tzinfo is None:
                    lm_dt = lm_dt.replace(tzinfo=timezone.utc)
                if lm_dt >= week_start:
                    scans_this_week += 1
            except (ValueError, TypeError):
                pass

    return FounderBrief(
        workspace_id=workspace_id,
        generated_at=now.isoformat(),
        week_label=week_label,
        bets_improving=improving,
        bets_at_risk=at_risk,
        pending_intervention_count=pending_count,
        most_urgent_intervention=most_urgent,
        weekly_question=weekly_question,
        total_bets=len(bets),
        avg_conviction=avg_conviction,
        scans_this_week=scans_this_week,
    )


def _select_weekly_question(
    bets: list[dict],
    summaries: list[BriefBetSummary],
    now: datetime,
) -> str:
    """Select the weekly question template based on data state.

    Priority order:
    1. Kill criteria triggered
    2. Critical conviction bet
    3. No scan in 14+ days
    4. All bets healthy (developing+)
    5. Default
    """
    # 1. Kill criteria triggered
    for s in summaries:
        if s.kill_criteria_status == "triggered" and s.kill_criteria_condition:
            bet = next((b for b in bets if b["id"] == s.bet_id), {})
            kc = bet.get("kill_criteria") or {}
            return _TEMPLATE_KILL_CRITERIA.format(
                condition=s.kill_criteria_condition,
                deadline=kc.get("deadline", "the deadline"),
            )

    # 2. Critical conviction
    for s in summaries:
        if s.conviction_level == "critical" and s.conviction_total > 0:
            return _TEMPLATE_CRITICAL.format(
                bet_name=s.bet_name,
                score=int(s.conviction_total),
            )

    # 3. Stale scan (all bets not scanned in 14d)
    two_weeks_ago = now - timedelta(days=14)
    any_fresh = False
    max_days_stale = 0
    for bet in bets:
        lm = bet.get("last_monitored_at")
        if lm:
            try:
                lm_dt = datetime.fromisoformat(lm)
                if lm_dt.tzinfo is None:
                    lm_dt = lm_dt.replace(tzinfo=timezone.utc)
                if lm_dt > two_weeks_ago:
                    any_fresh = True
                    break
                days_stale = (now - lm_dt).days
                max_days_stale = max(max_days_stale, days_stale)
            except (ValueError, TypeError):
                pass

    if not any_fresh and max_days_stale > 0:
        return _TEMPLATE_STALE.format(days=max_days_stale)

    # 4. All developing+
    all_healthy = all(
        s.conviction_level in ("developing", "strong") for s in summaries
    )
    if all_healthy and summaries:
        return _TEMPLATE_HEALTHY

    # 5. Default
    return _TEMPLATE_DEFAULT
