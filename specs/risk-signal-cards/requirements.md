# Requirements — Risk Signal Cards

## Behavioral Requirements

### R1 — Card Appears After Completed Scan
After `pipeline_status` transitions to `"complete"` and `risk_signal_draft` is present in AG-UI state, a `RiskSignalCard` is rendered in the chat view.

### R2 — Displays Four Fields Minimum
The card must show: risk type badge, severity badge, confidence bar (numeric + visual), and evidence summary. Headline and explanation are shown when present.

### R3 — Valid Risk Types Only
The card only renders for these four `risk_type` values: `strategy_unclear`, `alignment_issue`, `execution_issue`, `placebo_productivity`. Any other value → card does not render (Markdown fallback only).

### R4 — Graceful Fallback on Parse Failure
If `risk_signal_draft` is absent, not valid JSON, missing `risk_type`, or has a non-numeric `confidence`, the card is silently skipped. The chat shows only the conversational agent's Markdown reply. No error boundary needed; no console error thrown.

### R5 — Only After Complete Status
The card must NOT appear while `pipeline_status` is `"scanning"`, `"analyzing"`, `"awaiting_approval"`, `"executing"`, or `"error"`. It only renders when status is `"complete"`.

### R6 — Confidence Bar is Proportional
The confidence bar fill width equals `Math.round(signal.confidence * 100)` percent of the container width. A confidence of `0.72` renders as a 72% fill.

### R7 — Severity Badge Color-Coded
Each severity has a distinct color: `low` → emerald, `medium` → amber, `high` → orange, `critical` → red. Color is applied to both text and background (low opacity for background).

### R8 — No Backend Change
`risk_signal_draft` is already emitted into session state by Product Brain. This feature requires no new backend code, API endpoints, or database changes.

### R9 — Matches Glassmorphic Design System
The card uses `glass-panel` CSS class and CSS custom properties from `linear-theme.css`. No inline hex colors. Inter font, 8px grid, 12px corner radius.

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| `risk_signal_draft` is `null` | Card not rendered; Markdown reply shown normally |
| `risk_signal_draft` contains `"no_intervention"` as risk_type | `parseRiskSignal` returns null; card not rendered |
| `confidence` is `0.0` | Bar renders at 0% width; "0%" label shown |
| `confidence` is `1.0` | Bar renders at 100% width; "100%" label shown |
| `headline` is null | Headline section skipped; card still valid |
| `explanation` is null | Explanation section skipped; card still valid |
| Pipeline errors out (status `"error"`) | Card never renders; error state handled by PipelineProgressCard |
| User sends another message after scan | `pipeline_status` transitions back; card disappears until next completed scan |
