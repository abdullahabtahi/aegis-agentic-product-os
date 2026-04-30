from datetime import datetime, timedelta, timezone
from typing import List, Optional
from models.schema import FounderBrief, BriefBetSummary


_TEMPLATE_KILL_CRITERIA = "Kill criteria triggered for '{condition}'. This bet was committed to archive by {deadline}."
_TEMPLATE_CRITICAL = "Low conviction detected on {bet_name} ({score}/100). Is the hypothesis still valid?"
_TEMPLATE_STALE = "No scans have run for {days} days. Is the workspace data current?"
_TEMPLATE_HEALTHY = "All directions are showing healthy progress this week."
_TEMPLATE_DEFAULT = "What is the biggest risk to your current product strategy?"


def build_founder_brief(
    workspace_id: str,
    bets: List[dict],
    interventions: List[dict],
    now: Optional[datetime] = None,
) -> FounderBrief:
    """Synthesize a Founder Brief artifact from workspace state."""
    if now is None:
        now = datetime.now(timezone.utc)

    week_label = f"Week of {now.strftime('%b %d')}"

    summaries = []
    improving = []
    at_risk = []
    conviction_totals = []

    # Map interventions by bet_id
    bet_ints = {}
    for i in interventions:
        bid = i.get("bet_id")
        if bid not in bet_ints:
            bet_ints[bid] = []
        bet_ints[bid].append(i)

    for bet in bets:
        bid = bet["id"]
        ints = bet_ints.get(bid, [])
        pending = [i for i in ints if i.status == "pending"]

        # Health/Conviction
        # For now, we use the conviction_score if present, or compute it
        from .conviction_scoring import compute_conviction_score
        score_obj = compute_conviction_score(bet)
        conviction_totals.append(score_obj.total)

        summary = BriefBetSummary(
            bet_id=bid,
            bet_name=bet["name"],
            conviction_total=score_obj.total,
            conviction_level=score_obj.level,
            risk_count=len(pending),
            kill_criteria_status=bet.get("kill_criteria", {}).get("status", "pending"),
            kill_criteria_condition=bet.get("kill_criteria", {}).get("condition"),
        )
        summaries.append(summary)

        if score_obj.level in ("strong", "developing") and not pending:
            improving.append(summary)
        else:
            at_risk.append(summary)

    # ── urgency ─────────────────────────────────────────────────────────────
    pending_all = [i for i in interventions if i.status == "pending"]
    pending_count = len(pending_all)
    most_urgent = None
    if pending_all:
        # Sort by severity
        sev_map = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        pending_all.sort(key=lambda x: sev_map.get(x.get("risk_signal", {}).get("severity"), 99))
        u = pending_all[0]
        most_urgent = f"{u.get('risk_signal', {}).get('risk_type', 'Strategy')} risk on {next((b['name'] for b in bets if b['id'] == u.get('bet_id')), 'Bet')}"

    # ── question ────────────────────────────────────────────────────────────
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
