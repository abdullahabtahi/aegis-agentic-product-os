# Validation — Risk Signal Cards

## Level 1 — Automated Unit Tests (Jest / Vitest)

```typescript
// frontend/__tests__/parseRiskSignal.test.ts
import { parseRiskSignal } from "@/lib/parseRiskSignal";

const validSignal = {
  risk_type: "strategy_unclear",
  severity: "high",
  confidence: 0.72,
  headline: "Bet lacks testable hypothesis",
  explanation: "The bet has no measurable success criteria.",
  evidence_summary: "0 of 3 Linear issues have acceptance criteria.",
  linear_evidence: {},
  product_principle_refs: [],
};

describe("parseRiskSignal", () => {
  it("parses a valid JSON signal string", () => {
    const result = parseRiskSignal(JSON.stringify(validSignal));
    expect(result).not.toBeNull();
    expect(result?.risk_type).toBe("strategy_unclear");
    expect(result?.confidence).toBe(0.72);
  });

  it("returns null for undefined input", () => {
    expect(parseRiskSignal(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseRiskSignal("")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseRiskSignal("{not valid json")).toBeNull();
  });

  it("returns null for unknown risk_type", () => {
    const bad = { ...validSignal, risk_type: "no_intervention" };
    expect(parseRiskSignal(JSON.stringify(bad))).toBeNull();
  });

  it("returns null for missing risk_type", () => {
    const bad = { ...validSignal };
    delete (bad as Partial<typeof bad>).risk_type;
    expect(parseRiskSignal(JSON.stringify(bad))).toBeNull();
  });

  it("returns null when confidence is not a number", () => {
    const bad = { ...validSignal, confidence: "high" };
    expect(parseRiskSignal(JSON.stringify(bad))).toBeNull();
  });

  it("accepts all four valid risk types", () => {
    const types = ["strategy_unclear", "alignment_issue", "execution_issue", "placebo_productivity"];
    for (const t of types) {
      const result = parseRiskSignal(JSON.stringify({ ...validSignal, risk_type: t }));
      expect(result?.risk_type).toBe(t);
    }
  });

  it("accepts confidence of 0.0", () => {
    const result = parseRiskSignal(JSON.stringify({ ...validSignal, confidence: 0.0 }));
    expect(result?.confidence).toBe(0.0);
  });

  it("accepts confidence of 1.0", () => {
    const result = parseRiskSignal(JSON.stringify({ ...validSignal, confidence: 1.0 }));
    expect(result?.confidence).toBe(1.0);
  });

  it("returns signal when headline is null", () => {
    const result = parseRiskSignal(JSON.stringify({ ...validSignal, headline: null }));
    expect(result).not.toBeNull();
  });
});
```

## Level 2 — Manual Smoke Tests

| # | Step | Expected |
|---|---|---|
| S1 | Declare a bet in chat; ask Aegis to run a risk scan | Pipeline progress card appears, stages animate |
| S2 | Wait for scan to complete (status → "complete") | `RiskSignalCard` appears below the chat messages |
| S3 | Inspect the card | Risk type badge, severity badge, confidence bar (labeled %), headline, evidence summary all visible |
| S4 | Open DevTools → Network → check `/bets` or session state | `risk_signal_draft` is a JSON string with `risk_type` matching one of the four canonical values |
| S5 | Send another chat message after the scan | Card disappears (pipeline_status leaves "complete"); reappears on next completed scan |
| S6 | Trigger a scan that produces `no_intervention` | Card does not render; chat shows Markdown only |
| S7 | Force-set `risk_signal_draft = "{bad json}"` in DevTools (via CopilotKit state) | Card does not render; no error thrown; Markdown reply still visible |
| S8 | Inspect card on a narrow screen (< 400px) | Card does not overflow; evidence text wraps; confidence bar stays within bounds |

## Level 3 — TypeScript Check

```bash
cd frontend && npx tsc --noEmit
# Expected: 0 errors
```

## Traceability

| Test | Traces to |
|---|---|
| `parseRiskSignal` valid signal | R1, R3 |
| `parseRiskSignal` returns null for undefined | R4 |
| `parseRiskSignal` returns null for bad JSON | R4 |
| `parseRiskSignal` returns null for unknown risk_type | R3, R4 |
| `parseRiskSignal` returns null for non-numeric confidence | R4 |
| All four valid types accepted | R3 |
| Confidence 0.0 and 1.0 accepted | R6 |
| S1-S2 card appears after complete | R1, R5 |
| S3 card fields | R2 |
| S3 confidence bar | R6 |
| S3 severity badge color | R7 |
| S5 card disappears when status changes | R5 |
| S6 no_intervention → no card | R3, R4 |
| S7 bad JSON → no crash | R4 |
| TypeScript check | R8, R9 |
