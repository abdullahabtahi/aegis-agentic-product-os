import math
from datetime import datetime, timezone
from typing import Optional
from models.schema import ConvictionScore, ConvictionDimension


def compute_conviction_score(bet: dict) -> ConvictionScore:
    """Compute a deterministic conviction score (0-100) based on bet state.

    Dimensions:
    1. Foundational (40 pts): Definition of problem, hypothesis, metrics.
    2. Monitoring (40 pts): Signal status from latest monitoring.
    3. Momentum (20 pts): Frequency of scans.
    """
    dimensions = []
    total = 0.0

    # ── 1. Foundational (40 pts) ───────────────────────────────────────────
    has_problem = bool(bet.get("problem_statement"))
    has_hypo = bool(bet.get("hypothesis"))
    metrics_count = len(bet.get("success_metrics") or [])

    # Problem (15)
    p_pts = 15 if has_problem else 0
    dimensions.append(
        ConvictionDimension(
            key="problem_defined",
            name="Problem Statement",
            met=has_problem,
            points_earned=p_pts,
            points_max=15,
        )
    )
    # Hypothesis (15)
    h_pts = 15 if has_hypo else 0
    dimensions.append(
        ConvictionDimension(
            key="hypothesis_set",
            name="Strategic Hypothesis",
            met=has_hypo,
            points_earned=h_pts,
            points_max=15,
        )
    )
    # Metrics (10)
    m_pts = 10 if metrics_count >= 2 else (5 if metrics_count == 1 else 0)
    dimensions.append(
        ConvictionDimension(
            key="metrics_set",
            name="Success Metrics (2+)",
            met=metrics_count >= 2,
            points_earned=m_pts,
            points_max=10,
        )
    )
    total += p_pts + h_pts + m_pts

    # ── 2. Monitoring (40 pts) ─────────────────────────────────────────────
    # Derived from last_monitored_at and status
    last_monitored = bet.get("last_monitored_at")
    status = bet.get("status")

    has_scanned = bool(last_monitored)
    is_active = status in ("active", "detecting")

    # Scan Presence (15)
    s_pts = 15 if has_scanned else 0
    dimensions.append(
        ConvictionDimension(
            key="pipeline_active",
            name="Pipeline Monitoring",
            met=has_scanned,
            points_earned=s_pts,
            points_max=15,
        )
    )

    # Health (25)
    # If unmonitored: 0. If monitored: 25 (baseline).
    # Future: deduct for open high-severity risks.
    health_pts = 25 if has_scanned and is_active else (10 if has_scanned else 0)
    dimensions.append(
        ConvictionDimension(
            key="risk_free",
            name="Health Stability",
            met=has_scanned and is_active,
            points_earned=health_pts,
            points_max=25,
        )
    )
    total += s_pts + health_pts

    # ── 3. Momentum (20 pts) ───────────────────────────────────────────────
    # Recency of scan
    momentum_pts = 0
    is_fresh = False
    if last_monitored:
        try:
            dt = datetime.fromisoformat(last_monitored)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            delta = datetime.now(timezone.utc) - dt
            if delta.days < 3:
                momentum_pts = 20
                is_fresh = True
            elif delta.days < 7:
                momentum_pts = 10
                is_fresh = True
        except (ValueError, TypeError):
            pass

    dimensions.append(
        ConvictionDimension(
            key="momentum",
            name="Scan Recency (<3d)",
            met=is_fresh,
            points_earned=momentum_pts,
            points_max=20,
        )
    )
    total += momentum_pts

    # ── Final level ────────────────────────────────────────────────────────
    level = "critical"
    if total >= 85:
        level = "strong"
    elif total >= 60:
        level = "developing"
    elif total >= 30:
        level = "nascent"

    return ConvictionScore(
        total=total,
        level=level,
        dimensions=dimensions,
    )
