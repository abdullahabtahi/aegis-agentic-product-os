# Feature 010: Pivot Diagnosis

## Overview
Implements Feature 010 (Spec 010). A structured 4Ps (Problem, Persona, Product, Positioning) diagnostic session triggered when a bet is at risk.

## Flow
1. **Trigger**: Agent detects `kill_criteria_triggered` or low conviction.
2. **Session**: Agent asks 4 questions (1-5 confidence) for each P.
3. **Synthesis**:
    - `stay_course`: Strong across all.
    - `small_pivot`: 1-2 weak Ps.
    - `large_pivot`: 3+ weak Ps.
    - `kill`: Weak problem score.
4. **UI**: `PivotDiagnosisCard` showing the 4-P radar.

## Status
- [x] `compute_pivot_recommendation` logic
- [x] `POST /interventions/{id}/pivot-diagnosis`
- [x] `PivotDiagnosisCard` UI
- [x] Agent tool integration
- [x] Test: Verify recommendation logic overrides
