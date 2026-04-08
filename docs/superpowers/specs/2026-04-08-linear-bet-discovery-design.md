# Linear Bet Discovery — Design Spec

**Date:** 2026-04-08  
**Status:** Approved  
**Feature:** Auto-discover strategic directions from recent Linear issues  

---

## Problem

Founders manually declare strategic directions (Bets) in Aegis. But themes already exist in
Linear — clusters of issues around a problem area that should become a monitored direction.
There is no way today to surface these automatically.

---

## Goal

A "Scan Linear" button on the Strategic Directions page that scans recent issues, clusters them
into proposed directions using Gemini Flash, and adds them to the list as `detecting` cards for
the founder to review, promote, or kill.

---

## Non-Goals

- Scheduling / background auto-scan (manual trigger only)
- Writing back to Linear
- Modifying the 5-agent sequential pipeline
- Review modal / staging area — cards appear directly on the list

---

## Data Flow

```
User clicks "Scan Linear"
  → POST /bets/discover  { workspace_id }
      → get_linear_mcp().list_issues(days=14, first=50)   [whole workspace, no project filter]
      → Build prompt: issue titles + first 200 chars of description
      → Single Gemini Flash call
            response_mime_type="application/json", temperature=0.2
            output: array of { name, hypothesis, problem_statement }  (2–5 items)
      → Dedup: skip clusters whose name already exists in DB (case-insensitive)
      → Save remaining as Bets (status=detecting, source=agent_inferred)
      → Return { created: Bet[], skipped_duplicates: int }
  ← Frontend refetches list → detecting cards appear in the grid
```

---

## Limits

| Constraint | Value | Reason |
|---|---|---|
| Issues fetched | 50 max | Fast enough; enough signal for clustering |
| Time window | 14 days | Existing hard invariant (CLAUDE.md) |
| Proposed directions per scan | 5 max | Avoid overwhelming the founder |
| Dedup | Case-insensitive name match | No duplicate cards on repeated scans |

---

## Backend

### New file: `backend/app/services/bet_discovery.py`

Single async function:

```python
async def discover_bets_from_linear(
    workspace_id: str,
    existing_names: set[str],
) -> list[Bet]:
    """
    1. Fetch up to 50 issues via get_linear_mcp() — no project filter (full workspace)
    2. Build prompt: titles + first 200 chars of description
    3. Call Gemini Flash (response_mime_type="application/json", temp=0.2)
    4. Parse JSON → list of { name, hypothesis, problem_statement }
    5. Filter duplicates (case-insensitive name match against existing_names)
    6. Return up to 5 Bet objects (status=detecting, source=agent_inferred)
    """
```

**Gemini model:** `gemini-3-flash-preview` via `google-genai` SDK (same SDK already used in agents; Gemini 3 series is the project constraint per CLAUDE.md).  
Use Context7 MCP to fetch current `google-genai` SDK docs before implementing the Gemini call.  
Use `adk-cheatsheet` skill for ADK/Gemini SDK patterns.

**Prompt design (abridged):**
```
You are a product strategy assistant. Given a list of Linear issues, identify 2 to 5 
distinct strategic themes. For each theme return:
- name: short direction title (max 8 words)
- hypothesis: one sentence testable hypothesis
- problem_statement: one sentence problem description

Return ONLY a JSON array. No explanation.

Issues:
[{ "title": "...", "description": "..." }, ...]
```

### New endpoint: `POST /bets/discover`

In `backend/app/main.py`:

```python
class DiscoverBody(BaseModel):
    workspace_id: str

@app.post("/bets/discover")
async def discover_bets(body: DiscoverBody, db: AsyncSession = Depends(get_db)):
    existing = await repo.list_bets(body.workspace_id)
    existing_names = {b.name.lower() for b in existing}
    new_bets = await discover_bets_from_linear(body.workspace_id, existing_names)
    created = []
    for bet in new_bets:
        saved = await repo.create_bet(body.workspace_id, bet)
        created.append(saved)
    return {"created": created, "skipped_duplicates": len(new_bets) - len(created)}
```

**No changes to:** the ADK pipeline, existing agents, DB schema, or `data-schema.ts`.  
Uses existing `BetRepository.create_bet()` and `Bet` Pydantic model as-is.

---

## Frontend

### `frontend/lib/api.ts`

New helper:
```ts
export async function discoverBets(workspaceId: string): Promise<Bet[]>
```

### `frontend/app/workspace/directions/page.tsx`

- Add `isScanning` state
- Add `handleScanLinear()` → calls `discoverBets()` → calls `refetch()`
- New button next to "+ New direction":
  ```tsx
  <button onClick={handleScanLinear} disabled={isScanning}>
    {isScanning ? <Loader2 className="animate-spin" /> : <Search size={15} />}
    Scan Linear
  </button>
  ```
- On error: inline error string beneath the button (no modal)
- No new components needed — `detecting` cards use existing `BetCard` + `StatusBadge`

---

## Error Handling

| Scenario | Behavior |
|---|---|
| `LINEAR_API_KEY` missing | `get_linear_mcp()` returns `MockLinearMCP` → mock data clustered (demo-safe) |
| Gemini returns invalid JSON | Endpoint returns 200 with `created: []`, logs warning |
| Gemini call fails | Endpoint returns 500 with user-friendly message |
| All clusters are duplicates | Returns `{ created: [], skipped_duplicates: N }` — frontend shows "No new directions found" |
| DB write fails | Individual bet creation errors are caught; partial results returned |

---

## Testing

- **Unit:** `test_bet_discovery.py` — mock `get_linear_mcp()` + mock Gemini response → assert correct Bet objects returned, dedup works, limit enforced
- **Integration:** `POST /bets/discover` with `AEGIS_MOCK_LINEAR=true` → assert detecting bets in DB
- No new ADK eval needed (no pipeline involvement)

---

## Files Changed

| File | Change |
|---|---|
| `backend/app/services/bet_discovery.py` | **New** — `discover_bets_from_linear()` |
| `backend/app/main.py` | Add `POST /bets/discover` endpoint |
| `frontend/lib/api.ts` | Add `discoverBets()` helper |
| `frontend/app/workspace/directions/page.tsx` | Add "Scan Linear" button + handler |

---

## Skills & MCP to Use During Implementation

- **`adk-cheatsheet`** — Gemini SDK call patterns, `google-genai` usage
- **Context7 MCP** — fetch current `google-genai` Python SDK docs before implementing the Gemini call
- **`everything-claude-code:python-reviewer`** — after writing `bet_discovery.py`
- **`everything-claude-code:code-reviewer`** — after frontend changes
