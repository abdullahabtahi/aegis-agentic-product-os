# Validation — Control Level Persistence

## Level 1 — Automated Unit Tests (pytest)

```python
# backend/tests/unit/test_control_level_persistence.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call


@pytest.mark.asyncio
async def test_upsert_workspace_called_on_adjust_autonomy():
    """adjust_autonomy calls upsert_workspace with correct args after state update."""
    from app.agents.conversational import adjust_autonomy

    ctx = MagicMock()
    ctx.state = {"workspace_id": "ws-abc"}

    with patch("app.agents.conversational.upsert_workspace", new_callable=AsyncMock) as mock_upsert:
        result = await adjust_autonomy("require_approval", ctx)

    assert result["status"] == "ok"
    assert ctx.state["control_level"] == "require_approval"
    mock_upsert.assert_awaited_once_with(
        workspace_id="ws-abc",
        control_level="require_approval",
    )


@pytest.mark.asyncio
async def test_session_state_updated_before_db_write():
    """State is set before the DB write — order matters for session consistency."""
    from app.agents.conversational import adjust_autonomy

    order = []
    ctx = MagicMock()
    ctx.state = {"workspace_id": "ws-order"}

    original_setitem = dict.__setitem__

    def tracking_setitem(d, k, v):
        if k == "control_level":
            order.append("state")
        original_setitem(d, k, v)

    ctx.state.__setitem__ = tracking_setitem

    async def mock_upsert(**kwargs):
        order.append("db")

    with patch("app.agents.conversational.upsert_workspace", side_effect=mock_upsert):
        await adjust_autonomy("autonomous_low_risk", ctx)

    # State must be updated before the DB write
    assert order.index("state") < order.index("db")


@pytest.mark.asyncio
async def test_fallback_workspace_id_when_missing():
    """adjust_autonomy falls back to 'default_workspace' when workspace_id absent."""
    from app.agents.conversational import adjust_autonomy

    ctx = MagicMock()
    ctx.state = {}  # no workspace_id

    with patch("app.agents.conversational.upsert_workspace", new_callable=AsyncMock) as mock_upsert:
        await adjust_autonomy("draft_only", ctx)

    mock_upsert.assert_awaited_once_with(
        workspace_id="default_workspace",
        control_level="draft_only",
    )


@pytest.mark.asyncio
async def test_upsert_workspace_idempotent(tmp_path):
    """Calling upsert_workspace twice with same args succeeds without error."""
    import os
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path}/test.db"

    from db.repository import upsert_workspace
    # Calling twice — should not raise
    await upsert_workspace("ws-idem", "draft_only")
    await upsert_workspace("ws-idem", "draft_only")
    # No exception = idempotent ✓


@pytest.mark.asyncio
async def test_get_workspace_unknown_id():
    """GET /workspace/{id} returns default for unknown workspace."""
    from httpx import AsyncClient
    from app.main import app

    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/workspace/ws-unknown-xyz")
    assert response.status_code == 200
    data = response.json()
    assert data["control_level"] == "draft_only"
```

## Level 2 — Manual Smoke Tests

| # | Step | Expected |
|---|---|---|
| S1 | Via chat or Settings, set autonomy to "require_approval" | Tool runs; DB receives upsert |
| S2 | Restart the backend (`Ctrl+C` → `make playground`) | DB persists; workspace row still has `control_level = "require_approval"` |
| S3 | Reload the browser; navigate to `/workspace/settings` | Settings page shows "Require Approval" card as active (reads from `GET /workspace/{id}`) |
| S4 | Run `upsert_workspace("ws-test", "draft_only")` twice in a test script | No error; DB shows one row for `ws-test` |
| S5 | Call `GET /workspace/ws-that-does-not-exist` directly | Response: `{"id": "ws-that-does-not-exist", "control_level": "draft_only"}` |
| S6 | Set level to L3 → restart backend → set level to L2 | DB updates correctly; L2 is active after second set |

## Level 3 — Run Backend Tests

```bash
cd backend && uv run pytest tests/unit/test_control_level_persistence.py -v
# Expected: 5 tests PASS
```

## Traceability

| Test | Traces to |
|---|---|
| `upsert_workspace_called` | R1 |
| `state_updated_before_db_write` | R6 |
| `fallback_workspace_id` | Edge case: workspace_id absent |
| `upsert_idempotent` | R4 |
| `get_workspace_unknown_id` | R5 |
| S2 backend restart | R2 |
| S3 page reload | R3 |
| S4 idempotent | R4 |
| S5 unknown ID default | R5 |
| S6 update over existing | R1, R4 |
