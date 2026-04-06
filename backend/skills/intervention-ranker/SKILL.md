---
name: intervention-ranker
description: >
  Use when selecting an intervention from the taxonomy for a detected
  risk signal. Contains ranking rules, escalation ladder guidance,
  and workspace acceptance pattern heuristics. Load before calling
  propose_intervention.
version: 1.0.0
---

# Intervention Ranker Skill

## Escalation Ladder (Governor enforces — Coordinator recommends)

```
Level 1 (Clarify):  clarify_bet · add_hypothesis · add_metric
Level 2 (Adjust):   rescope · align_team · redesign_experiment
Level 3 (Escalate): pre_mortem_session · jules_* actions
Level 4 (Terminal): kill_bet
```

**Default rule**: Start at the lowest eligible level for the risk type.
**Governor enforces**: Cannot skip rungs unless severity=critical AND chronic_rollover_count >= 3.

## Risk Type → Intervention Mapping

| Risk Type | Level 1 default | Level 2 if L1 accepted+failed |
|---|---|---|
| strategy_unclear | clarify_bet (if vague) OR add_hypothesis (if missing) | redesign_experiment |
| alignment_issue | clarify_bet | align_team |
| execution_issue | add_metric (if no metric) OR clarify_bet | rescope |
| placebo_productivity | clarify_bet | rescope |

## Ranking Priority Rules (hard rules applied before weights)

1. If same `action_type` rejected in last 30 days → skip, try next eligible
2. If Jules action AND no GitHub in workspace → skip all `jules_*`
3. If severity == "low" → only Level 1 eligible
4. If severity == "critical" AND chronic_rollover_count >= 3 → Level 3 eligible immediately
5. If confidence < 0.7 → only `no_intervention` eligible

## Workspace Acceptance Pattern Heuristics

- If workspace has 0 prior accepted interventions: prefer `clarify_bet` or `add_hypothesis` (low friction)
- If workspace consistently rejects "add_metric": deprioritise in favour of `clarify_bet`
- If workspace has high acceptance rate: escalate one level sooner

## no_intervention Criteria

Use `no_intervention` when:
- Product Brain confidence < 0.6 (already handled — synthesis won't call emit_risk_signal)
- risk_type matches `bet.acknowledged_risks` (Governor check #6 catches this)
- Rate cap already hit (Governor check #3 catches this)
- As Coordinator: if risk signal draft is empty or null

## References
- `references/ranking-weights.md` — HeuristicVersion v1.0.0 intervention_ranking_weights (load on demand)
