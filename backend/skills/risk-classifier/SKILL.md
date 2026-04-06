---
name: risk-classifier
description: >
  Use when classifying startup execution risk from Linear signals.
  Covers the 4 Aegis risk types: strategy_unclear, alignment_issue,
  execution_issue, placebo_productivity. Load this skill before any
  risk classification step.
version: 1.0.0
---

# Risk Classifier Skill

## The 4 Risk Types

### strategy_unclear
Evidence required (any 2):
- `hypothesis_present = false` — no hypothesis in bet
- `metric_linked = false` — no numeric target in any linked issue
- `hypothesis_staleness_days > 30` — hypothesis not updated in 30+ days
- `bet.time_horizon` has passed — bet may be expired

Minimum confidence to surface: 0.65
Typical severity: medium → high if staleness + no metric

### alignment_issue
Evidence required:
- `cross_team_thrash_signals >= 3` — 3+ blocked_by relations crossing team boundaries
- Pattern: same issues repeatedly blocked by another team's work

Minimum confidence to surface: 0.65
Typical severity: medium → high for 5+ thrash signals

### execution_issue
Evidence required (any 1):
- `chronic_rollover_count >= 2` — issues carried across 2+ cycles
- `bet_coverage_pct < 0.40` — less than 40% of issues mapped to bet
- Both: scope_change_count high + coverage low = strong signal

Minimum confidence to surface: 0.65
Typical severity: medium (2 rollovers) → critical (4+ rollovers)

### placebo_productivity
Evidence required:
- High closed-issue count (done/completed) BUT low `bet_coverage_pct`
- Team is "busy" but not on bet work
- `placebo_productivity_score > 0.5` — majority of closed issues not bet-mapped

Minimum confidence to surface: 0.70 (harder to distinguish from healthy sprint cleanup)

## Confidence Calibration

| Signal strength | Confidence |
|---|---|
| 1 weak signal | 0.40–0.55 → do NOT surface |
| 1 strong signal | 0.55–0.65 → borderline |
| 2 corroborating signals | 0.65–0.80 → surface |
| 3+ signals + staleness | 0.80–0.95 → high confidence |

## Staleness Penalty Rule (Jules feedback)
If `hypothesis_staleness_days > 30` OR `bet.time_horizon` has passed:
- Add +0.10 confidence to `strategy_unclear` classification
- Mention staleness explicitly in `explanation`

## References
- `references/classification-examples.md` — few-shot examples per risk type (load on demand)
