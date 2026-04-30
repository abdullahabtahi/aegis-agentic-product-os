"""Conviction Score computation — Feature 008.

Pure function: no DB calls, no LLM calls.
Source: Sean Ellis PMF framework applied to bets (not customers).
Six named dimensions, each transparent and actionable.

Dimensions and max points:
  kill_criteria_defined    20   bet.kill_criteria is set and not waived
  hypothesis_present       15   hypothesis is a non-trivial string (>20 chars)
  success_metric_defined   15   success_metrics non-empty AND metric_linked from signals
  bet_coverage_gte_40      20   linear_signals.bet_coverage_pct >= 0.40 (partial credit)
  no_chronic_rollovers     15   chronic_rollover_count == 0 (partial credit)
  scanned_recently         15   last_monitored_at within 7d (partial credit for 7-14d)

Level thresholds:
  strong     80-100  (emerald)
  developing 55-79   (indigo)
  nascent    30-54   (amber)
  critical   0-29    (red)
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING

from models.schema import ConvictionDimension, ConvictionLevel, ConvictionScore

if TYPE_CHECKING:
    from models.schema import Bet, BetSnapshot, LinearSignals


def _level_for_score(total: float) -> ConvictionLevel:
    if total >= 80:
        return "strong"
    if total >= 55:
        return "developing"
    if total >= 30:
        return "nascent"
    return "critical"


def compute_conviction_score(
    bet: "Bet",
    snapshot: "BetSnapshot",
) -> ConvictionScore:
    """Compute ConvictionScore from Bet + BetSnapshot. Pure, deterministic.

    Args:
        bet: The bet being scored.
        snapshot: The latest BetSnapshot with LinearSignals.

    Returns:
        ConvictionScore with total, level, and 6 dimensions.
    """
    now = datetime.now(timezone.utc)
    signals: LinearSignals = snapshot.linear_signals
    dimensions: list[ConvictionDimension] = []

    # 1. Kill criteria defined (20 pts)
    kc = bet.kill_criteria
    kc_defined = kc is not None and kc.status not in ("waived",)
    dimensions.append(ConvictionDimension(
        name="Kill criteria defined",
        key="kill_criteria_defined",
        points_earned=20.0 if kc_defined else 0.0,
        points_max=20.0,
        met=kc_defined,
    ))

    # 2. Hypothesis present (15 pts)
    hypothesis_ok = bool(bet.hypothesis and len(bet.hypothesis.strip()) > 20)
    dimensions.append(ConvictionDimension(
        name="Hypothesis present",
        key="hypothesis_present",
        points_earned=15.0 if hypothesis_ok else 0.0,
        points_max=15.0,
        met=hypothesis_ok,
    ))

    # 3. Success metric defined (15 pts)
    metric_ok = (
        len(bet.success_metrics) > 0 and signals.metric_linked
    )
    dimensions.append(ConvictionDimension(
        name="Success metric defined",
        key="success_metric_defined",
        points_earned=15.0 if metric_ok else 0.0,
        points_max=15.0,
        met=metric_ok,
    ))

    # 4. Bet coverage ≥ 40% (20 pts — partial credit)
    coverage = signals.bet_coverage_pct  # 0.0–1.0
    if coverage >= 0.40:
        cov_pts = 20.0
    elif coverage > 0:
        # Partial: linear between 0 and 40%
        cov_pts = round((coverage / 0.40) * 20.0, 1)
    else:
        cov_pts = 0.0
    dimensions.append(ConvictionDimension(
        name="Bet coverage ≥ 40%",
        key="bet_coverage_gte_40",
        points_earned=cov_pts,
        points_max=20.0,
        met=coverage >= 0.40,
    ))

    # 5. No chronic rollovers (15 pts — partial credit)
    chronic = signals.chronic_rollover_count
    if chronic == 0:
        rollover_pts = 15.0
    elif chronic == 1:
        rollover_pts = 8.0
    else:
        rollover_pts = 0.0
    dimensions.append(ConvictionDimension(
        name="No chronic rollovers",
        key="no_chronic_rollovers",
        points_earned=rollover_pts,
        points_max=15.0,
        met=chronic == 0,
    ))

    # 6. Scanned within 7 days (15 pts — partial credit)
    last_monitored = bet.last_monitored_at
    if last_monitored:
        try:
            lm_dt = datetime.fromisoformat(last_monitored)
            if lm_dt.tzinfo is None:
                lm_dt = lm_dt.replace(tzinfo=timezone.utc)
            days_since = (now - lm_dt).days
            if days_since <= 7:
                scan_pts = 15.0
            elif days_since <= 14:
                scan_pts = 8.0
            else:
                scan_pts = 0.0
        except (ValueError, TypeError):
            scan_pts = 0.0
    else:
        scan_pts = 0.0
    dimensions.append(ConvictionDimension(
        name="Scanned within 7 days",
        key="scanned_recently",
        points_earned=scan_pts,
        points_max=15.0,
        met=scan_pts == 15.0,
    ))

    total = round(sum(d.points_earned for d in dimensions), 1)
    total = max(0.0, min(100.0, total))

    return ConvictionScore(
        total=total,
        level=_level_for_score(total),
        dimensions=dimensions,
        computed_at=now.isoformat(),
    )
