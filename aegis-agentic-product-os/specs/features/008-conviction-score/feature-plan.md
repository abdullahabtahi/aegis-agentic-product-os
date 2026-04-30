# Feature 008: Conviction Scoring (Sean Ellis PMF)

## Overview
Implements Feature 008 (Spec 008). Calculates a deterministic "Conviction Score" (0–100) based on the Sean Ellis / Hacking Growth framework.

## Dimensions
1. **Foundational (40pts)**: Problem + Hypothesis + Metrics.
2. **Signal (40pts)**: Recent monitoring + Low risk.
3. **Momentum (20pts)**: Weekly scan frequency.

## Levels
- `strong`: 85+
- `developing`: 60-84
- `nascent`: 30-59
- `critical`: <30

## UI
- `ConvictionScoreGauge`: Semicircle arc with dimension breakdown.
- `ConvictionLabel`: Colored badge (Strong / Developing etc).

## Status
- [x] Pure function `compute_conviction_score`
- [x] UI Gauge component
- [x] Integration with Bet Snapshot
- [x] Test: Unit test for score levels
