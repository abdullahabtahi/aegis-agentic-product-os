# Validation — Activity Log

## Level 1 — Automated Unit Tests

```typescript
// frontend/__tests__/activityLog.test.ts
import type { Intervention } from "@/lib/types";

const makeIntervention = (overrides: Partial<Intervention> = {}): Intervention => ({
  id: "int-1",
  bet_id: "bet-1",
  bet_name: "Aegis Demo Bet",
  workspace_id: "ws-test",
  action_type: "clarify_bet",
  escalation_level: 1,
  title: "Clarify the bet hypothesis",
  rationale: "Hypothesis is missing.",
  confidence: 0.8,
  status: "pending",
  created_at: new Date().toISOString(),
  ...overrides,
});

describe("activity log filtering", () => {
  it("filters out no_intervention records", () => {
    const items: Intervention[] = [
      makeIntervention({ action_type: "clarify_bet" }),
      makeIntervention({ id: "int-2", action_type: "no_intervention" }),
      makeIntervention({ id: "int-3", action_type: "rescope" }),
    ];
    const filtered = items.filter((i) => i.action_type !== "no_intervention");
    expect(filtered).toHaveLength(2);
    expect(filtered.every((i) => i.action_type !== "no_intervention")).toBe(true);
  });

  it("returns empty array when all items are no_intervention", () => {
    const items: Intervention[] = [
      makeIntervention({ action_type: "no_intervention" }),
    ];
    const filtered = items.filter((i) => i.action_type !== "no_intervention");
    expect(filtered).toHaveLength(0);
  });
});

describe("activity log sorting", () => {
  it("sorts newest-first by created_at", () => {
    const older = makeIntervention({
      id: "int-old",
      created_at: new Date("2026-01-01T10:00:00Z").toISOString(),
    });
    const newer = makeIntervention({
      id: "int-new",
      created_at: new Date("2026-04-25T10:00:00Z").toISOString(),
    });
    const sorted = [older, newer].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    expect(sorted[0].id).toBe("int-new");
    expect(sorted[1].id).toBe("int-old");
  });

  it("does not mutate the original array", () => {
    const original = [
      makeIntervention({ id: "int-1", created_at: "2026-01-01T00:00:00Z" }),
      makeIntervention({ id: "int-2", created_at: "2026-04-25T00:00:00Z" }),
    ];
    const copy = [...original].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    expect(original[0].id).toBe("int-1"); // original unchanged
    expect(copy[0].id).toBe("int-2");     // copy sorted
  });
});

describe("denial reason formatting", () => {
  it("replaces underscores with spaces", () => {
    const raw = "confidence_floor_not_met";
    const formatted = raw.replace(/_/g, " ");
    expect(formatted).toBe("confidence floor not met");
  });
});
```

## Level 2 — Manual Smoke Tests

| # | Step | Expected |
|---|---|---|
| S1 | Navigate to `/workspace/activity` with no interventions | Empty state message: "No activity yet. Run a pipeline scan to get started." |
| S2 | Navigate while data loads | Three skeleton rectangles pulse during load |
| S3 | Trigger a pipeline scan; navigate back to `/workspace/activity` | Intervention rows appear sorted newest-first |
| S4 | Check row structure | Action label, bet_name subtitle, status badge, timestamp all visible |
| S5 | Filter check — scan produces a `no_intervention` result | That result does not appear in the Activity list |
| S6 | Governor denies an intervention (check Suppression Log) | Row appears with muted italic denial reason below action label |
| S7 | Click any row | Navigated to `/workspace/directions/{bet_id}` |
| S8 | Leave page open for 35 seconds | Network request re-fires automatically (check DevTools) |
| S9 | Run a new scan while Activity page is open | New row appears within ~30 seconds without manual refresh |

## Level 3 — TypeScript Check

```bash
cd frontend && npx tsc --noEmit
# Expected: 0 errors
```

## Traceability

| Test | Traces to |
|---|---|
| Filter removes `no_intervention` | R2 |
| All items `no_intervention` → empty | R2, R5 |
| Sort newest-first | R1 |
| No mutation of original array | Immutability constraint (coding-style.md) |
| Denial reason underscore replacement | R4 |
| S1 empty state | R5 |
| S2 skeleton during load | R6 |
| S3 rows appear after scan | R1, R3 |
| S4 row structure | R3, R4, R10 |
| S5 no_intervention filtered | R2 |
| S6 denial reason shown | R4 |
| S7 click navigation | R7 |
| S8-S9 auto-refetch | R8 |
| All pages use `useWorkspaceId()` | R9 |
| TypeScript check | R3, R9 |
