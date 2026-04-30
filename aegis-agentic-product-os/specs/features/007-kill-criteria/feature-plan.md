# Feature 007: Kill Criteria Enforcement

## Overview
Implements Feature 007 (Spec 007). Automated enforcement of "Kill Criteria" defined during bet declaration.

## Core Logic
1. **Definition**: User defines `condition`, `deadline`, and `committed_action` (Kill / Pivot / Review).
2. **Monitoring**: Signal Engine checks if `condition` is met (via Linear data) or if `deadline` has passed.
3. **Trigger**: If triggered, Governor skips standard policies and forces a `kill_bet` or `pivot` intervention.
4. **Execution**: Executor archives the bet and posts the "Post-Mortem" results to Linear.

## Status
- [x] Schema update (Bet.kill_criteria)
- [x] Signal Engine detection (Deadline check)
- [x] Governor policy override
- [x] UI: KillCriteriaStatusBadge
- [x] UI: KillCriteriaStep in Declaration Modal
- [x] Test: Smoke test for triggered state display
