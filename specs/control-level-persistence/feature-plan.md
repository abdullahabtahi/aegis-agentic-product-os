# Feature Plan — Control Level Persistence

## Roadmap Item
Satisfies roadmap item **5. Control Level Persistence** (`/control-level-persistence/`)

## Overview

`adjust_autonomy()` in `conversational.py` updates `tool_context.state["control_level"]` but has a TODO at line 559 — it never writes to the database. After a backend restart or page reload, `control_level` resets to `"draft_only"`. This feature wires the one-line database write.

## Dependencies

- `db/repository.py` — needs `upsert_workspace` function (may not exist yet; add if absent)
- `WorkspaceModel` SQLAlchemy model — must exist in `backend/models/` (check before adding)
- Settings Page (feature 3) is the primary consumer of this fix — both can be done together

## Implementation Steps

### Task Group 1 — Add upsert_workspace to repository

Check if `upsert_workspace` exists in `backend/db/repository.py`. If not, add:

```python
# backend/db/repository.py
from sqlalchemy.dialects.postgresql import insert as pg_insert

async def upsert_workspace(workspace_id: str, control_level: str) -> None:
    """Insert or update workspace control_level. Idempotent."""
    async with get_session() as session:
        stmt = (
            pg_insert(WorkspaceModel)
            .values(id=workspace_id, control_level=control_level)
            .on_conflict_do_update(
                index_elements=["id"],
                set_={"control_level": control_level},
            )
        )
        await session.execute(stmt)
        await session.commit()
```

For SQLite (local dev), use `sqlite_insert` from `sqlalchemy.dialects.sqlite`:
```python
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
```
Use a helper that picks the right dialect based on `DATABASE_URL`.

### Task Group 2 — Patch adjust_autonomy in conversational.py

Replace the TODO block at line 559:

```python
# BEFORE
# TODO: Update workspace.control_level in AlloyDB
tool_context.state["control_level"] = control_level

# AFTER
tool_context.state["control_level"] = control_level
from db.repository import upsert_workspace  # local import to avoid circular dep
await upsert_workspace(
    workspace_id=tool_context.state.get("workspace_id", "default_workspace"),
    control_level=control_level,
)
```

### Task Group 3 — Expose control_level on workspace read endpoint

Add `control_level` to the workspace response so the Settings page can hydrate it on load independently of AG-UI state:

```python
# backend/app/main.py — new endpoint (or extend existing /bets response)
@app.get("/workspace/{workspace_id}")
async def get_workspace(workspace_id: str):
    workspace = await get_workspace_by_id(workspace_id)
    if not workspace:
        return {"id": workspace_id, "control_level": "draft_only"}
    return {"id": workspace.id, "control_level": workspace.control_level}
```

Add `get_workspace_by_id` to `db/repository.py`:
```python
async def get_workspace_by_id(workspace_id: str) -> WorkspaceModel | None:
    async with get_session() as session:
        result = await session.execute(
            select(WorkspaceModel).where(WorkspaceModel.id == workspace_id)
        )
        return result.scalar_one_or_none()
```

## Design Decisions

- **Local import to avoid circular dependency**: `conversational.py` already uses local imports for ADK components. `upsert_workspace` follows the same pattern.
- **Upsert not insert**: `control_level` changes frequently. Upsert ensures idempotency — no duplicate rows, no errors on re-runs.
- **Dialect-aware for local dev**: Production uses PostgreSQL (`on_conflict_do_update`); local dev uses SQLite. A helper or conditional keeps both working without duplicating code.
- **REST endpoint for Settings hydration**: Without this, the Settings page can only read `control_level` from AG-UI state (which requires an active chat session). The REST endpoint lets the page hydrate independently on load.
