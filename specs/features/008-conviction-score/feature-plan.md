# Feature Plan: 008 — Conviction Score

**Created:** April 2026  
**Priority:** HIGH — Hackathon Wow Factor  
**Source:** Lenny Skills — `measuring-product-market-fit` (Sean Ellis, Todd Jackson), `prioritizing-roadmap` (Gibson Biddle, Dan Hockenmaier)  
**Status:** Open

> **Insight driving this feature:**
> Sean Ellis: *"If 40% say 'very disappointed' you're on the right track."*  
> Todd Jackson: *"There are four levels of PMF: nascent, developing, strong, extreme."*
>
> `health_score` is an opaque number between 0–100. Nobody knows what it means. **Conviction Score** applies the same logic as the Sean Ellis PMF framework — not to product, but to **bets**. A bet with a 28/100 Conviction Score is in the same position as a product where only 28% of users would be disappointed if it vanished. That framing is instantly legible to any PM or investor.

---

## Summary

Replace (or augment) the opaque `health_score` with a **Conviction Score** — a 0–100 number computed from 6 named sub-dimensions, each grounded in a recognized PM practice. Every dimension is visible to the founder. The score is color-graded and labeled (`Conviction: Strong / Developing / Nascent / Critical`).

The key difference from `health_score`:
- **Transparent** — each sub-dimension is shown, not hidden
- **Actionable** — each dimension has a clear owner and a clear fix
- **Legible to judges** — the PMF parallel lands in under 5 seconds

---

## Scope

- `ConvictionScore` value object in `context/data-schema.ts`
- `BetSnapshot.conviction_score` field (replaces/parallels `health_score`)
- `ConvictionScoreGauge` component — arc gauge with sub-dimension breakdown
- `ConvictionLabel` component — categorical label (`Strong / Developing / Nascent / Critical`)
- Updated `BetCard` — replaces raw health_score display with `ConvictionLabel + score`
- Updated `BetDetailPage` — `ConvictionScoreGauge` as primary health indicator
- Backend: `compute_conviction_score()` function in signal engine; used in `BetSnapshot`
- Updated `KpiStatsBar` on Mission Control — avg Conviction Score across all bets

## Out of Scope

- Changing the underlying `health_score` DB column (additive — `conviction_score` is a new derived field, not a DB migration)
- Historical score tracking / trend line (Phase 2)
- Per-dimension drill-down history (Phase 2)
- User-adjustable sub-dimension weights

---

## Conviction Score Formula

| Dimension | Max Points | Signal Source |
|---|---|---|
| **Kill Criteria defined** | 20 | `bet.kill_criteria` present and not waived |
| **Hypothesis present** | 15 | `linear_signals.hypothesis_present === true` |
| **Success metric defined** | 15 | `bet.success_metrics.length > 0` AND `linear_signals.metric_linked === true` |
| **Bet coverage ≥ 40%** | 20 | `linear_signals.bet_coverage_pct >= 40` |
| **No chronic rollovers** | 15 | `linear_signals.chronic_rollover_count === 0` |
| **Scanned within 7 days** | 15 | `bet.last_monitored_at` within last 7 days |
| **Total** | **100** | |

Conviction level thresholds:

| Score | Level | Color |
|---|---|---|
| 80–100 | Strong | Emerald |
| 55–79 | Developing | Indigo |
| 30–54 | Nascent | Amber |
| 0–29 | Critical | Red |

---

## Component Inventory

### Frontend Components

| Component | File | Purpose |
|---|---|---|
| `ConvictionScoreGauge` | `components/bets/ConvictionScoreGauge.tsx` | SVG arc gauge (180° semicircle), score number centered, dimension checklist below |
| `ConvictionLabel` | `components/bets/ConvictionLabel.tsx` | Compact colored pill: `"Strong 83"` / `"Nascent 31"` etc. |
| `ConvictionDimensionRow` | `components/bets/ConvictionDimensionRow.tsx` | Single dimension row: icon + name + points earned / max points |
| Updated `BetCard` | `components/bets/BetCard.tsx` | Swap raw `health_score` number for `<ConvictionLabel>` |
| Updated `BetDetailPage` | `app/workspace/directions/[id]/page.tsx` | Add `<ConvictionScoreGauge>` panel; keep existing signals section |
| Updated `KpiStatsBar` | `components/mission-control/KpiStatsBar.tsx` | Add "Avg Conviction" KPI; show level label if all bets Nascent/Critical |

### Backend

| File | Change |
|---|---|
| `context/data-schema.ts` | Add `ConvictionScore` + `ConvictionLevel` + `ConvictionDimension` types |
| `backend/models/schema.py` | Mirror types as Pydantic |
| `backend/app/agents/signal_engine.py` (or service) | Add `compute_conviction_score(bet, snapshot) → ConvictionScore` pure function |
| `backend/models/responses.py` | Include `conviction_score: ConvictionScore \| None` in `BetSnapshotResponse` |
| `backend/app/main.py` | `GET /bets` populates `conviction_score` from latest snapshot |

---

## UI Layout

### ConvictionScoreGauge (Bet Detail Page)

```
         ╭──────────────────────────────────────╮
         │                                      │
         │           ╭─────────────╮            │
         │          ╱               ╲           │
         │         │       63        │          │
         │         │   Developing    │          │
         │          ╲               ╱           │
         │           ╰─────────────╯            │
         │                                      │
         │  ● Kill Criteria defined   20/20     │
         │  ● Hypothesis present      15/15     │
         │  ○ Success metric          0/15      │
         │  ● Bet coverage ≥ 40%      20/20     │
         │  ○ No chronic rollovers    0/15      │
         │  ● Scanned within 7 days   8/15      │
         ╰──────────────────────────────────────╯
```

### ConvictionLabel (BetCard, inline)

```
[Developing  63]     ← indigo pill
[Critical    22]     ← red pill
[Strong      88]     ← emerald pill
```

---

## Design Principles

- **Sean Ellis parallel** — score is explicitly framed as "conviction level" not "health" in all copy
- **Arc gauge** — not a bar chart. Arc gauges are associated with quality/confidence in product dashboards; bar charts feel like task completion
- **Dimension checklist** — always shows all 6 dimensions; earned/max points visible; missed dimensions show `○` (not ✗ — avoidance framing, not failure framing)
- **Color consistency** — emerald/indigo/amber/red match existing Severity color system (`SEVERITY_BG` in `lib/constants.ts`)
- **No animation on gauge** — pure display; animation reserved for scanning states
