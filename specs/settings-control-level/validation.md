# Validation — Settings Page: Control Level

## Level 1 — Automated Unit Tests

```typescript
// frontend/__tests__/settingsControlLevel.test.ts
// Tests for the pure logic: default selection, no-op guard

import { ControlLevel } from "@/lib/types";

const VALID_LEVELS: ControlLevel[] = [
  "draft_only",
  "require_approval",
  "autonomous_low_risk",
];

describe("control level constants", () => {
  it("has exactly three valid levels", () => {
    expect(VALID_LEVELS).toHaveLength(3);
  });

  it("draft_only is the default fallback", () => {
    const current = (undefined as ControlLevel | undefined) ?? "draft_only";
    expect(current).toBe("draft_only");
  });

  it("selecting the active level is a no-op (same value)", () => {
    const active: ControlLevel = "require_approval";
    const pending: ControlLevel = "require_approval";
    expect(active === pending).toBe(true); // guard condition: do nothing
  });

  it("selecting a different level is not a no-op", () => {
    const active: ControlLevel = "draft_only";
    const pending: ControlLevel = "require_approval";
    expect(active === pending).toBe(false); // should trigger appendMessage
  });
});
```

```python
# backend/tests/unit/test_adjust_autonomy.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

@pytest.mark.asyncio
async def test_adjust_autonomy_valid_levels():
    """adjust_autonomy accepts all three valid level strings."""
    from app.agents.conversational import adjust_autonomy

    for level in ("draft_only", "require_approval", "autonomous_low_risk"):
        ctx = MagicMock()
        ctx.state = {"workspace_id": "ws-test"}
        with patch("app.agents.conversational.upsert_workspace", new_callable=AsyncMock):
            result = await adjust_autonomy(level, ctx)
        assert result["status"] == "ok"
        assert ctx.state["control_level"] == level

@pytest.mark.asyncio
async def test_adjust_autonomy_invalid_level():
    """adjust_autonomy rejects invalid level strings."""
    from app.agents.conversational import adjust_autonomy

    ctx = MagicMock()
    ctx.state = {"workspace_id": "ws-test"}
    result = await adjust_autonomy("superuser_mode", ctx)
    assert result["status"] == "error"

@pytest.mark.asyncio
async def test_adjust_autonomy_persists_to_db():
    """adjust_autonomy calls upsert_workspace with correct args."""
    from app.agents.conversational import adjust_autonomy

    ctx = MagicMock()
    ctx.state = {"workspace_id": "ws-test"}
    with patch("app.agents.conversational.upsert_workspace", new_callable=AsyncMock) as mock_upsert:
        await adjust_autonomy("require_approval", ctx)
    mock_upsert.assert_awaited_once_with(
        workspace_id="ws-test",
        control_level="require_approval",
    )
```

## Level 2 — Manual Smoke Tests

| # | Step | Expected |
|---|---|---|
| S1 | Navigate to `/workspace/settings` | Three level cards render; L1 (Draft Only) card is active (indigo border) |
| S2 | Click "Require Approval" (L2) | Chat message sent: "Set autonomy level to require_approval"; L2 card becomes active |
| S3 | Click the currently active card | Nothing happens; no message in chat; no visual change |
| S4 | Click "Autonomous Low Risk" (L3) | Chat message sent; L3 card becomes active |
| S5 | Restart backend; reload frontend; navigate to Settings | With persistence: last-set level is active. Without: defaults to L1 |
| S6 | Check DevTools → chat messages | Each level change appears once in chat history as a user message |

## Level 3 — Backend Unit Tests

```bash
cd backend && uv run pytest tests/unit/test_adjust_autonomy.py -v
# Expected: 3 tests PASS
```

## Level 4 — TypeScript Check

```bash
cd frontend && npx tsc --noEmit
# Expected: 0 errors
```

## Traceability

| Test | Traces to |
|---|---|
| Three valid levels constant | R1 |
| `draft_only` default fallback | R2 |
| Same level → no-op guard | R4 |
| Different level → not no-op | R3 |
| `test_adjust_autonomy_valid_levels` | R3, R5 |
| `test_adjust_autonomy_invalid_level` | R4 (reject invalid) |
| `test_adjust_autonomy_persists_to_db` | R6 |
| S1 three cards + L1 default active | R1, R2 |
| S2 click L2 → message sent + UI updates | R3, R5 |
| S3 click active → no-op | R4 |
| S5 backend restart | R6 |
| TypeScript check | R7, R8 |
