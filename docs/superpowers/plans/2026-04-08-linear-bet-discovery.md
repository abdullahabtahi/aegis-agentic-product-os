# Linear Bet Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Scan Linear" button to the Strategic Directions page that auto-discovers new strategic bets from recent Linear issues using Gemini Flash and adds them as `detecting` cards.

**Architecture:** A new `bet_discovery.py` service fetches up to 50 recent Linear issues via the existing `get_linear_mcp()` factory, sends them to Gemini Flash in a single structured JSON prompt, parses 2–5 thematic clusters into `Bet` dicts, and saves them via the existing `save_bet` / `_inmemory_bets` pattern. A new `POST /bets/discover` endpoint in `main.py` calls this service. The frontend adds a "Scan Linear" button to `DirectionsPage` that calls the endpoint and refetches.

**Tech Stack:** Python 3.10+, `google-genai` SDK (Vertex AI), FastAPI, `get_linear_mcp()` (existing), Next.js 16 / TypeScript / React Query

---

## Pre-flight: Fetch google-genai SDK Docs

Before implementing Task 1, use **Context7 MCP** to fetch the current `google-genai` Python SDK documentation:

```
mcp__plugin_context7_context7__resolve-library-id({ libraryName: "google-genai" })
→ then mcp__plugin_context7_context7__query-docs({ topic: "async generate content vertexai" })
```

Verify the async generate content API signature. The expected pattern (confirm against docs):

```python
from google import genai
from google.genai import types as genai_types

client = genai.Client(vertexai=True, project="my-project", location="global")
response = await client.aio.models.generate_content(
    model="gemini-3-flash-preview",
    contents="your prompt",
    config=genai_types.GenerateContentConfig(
        response_mime_type="application/json",
        temperature=0.2,
    ),
)
result_text = response.text
```

If the API differs, adjust Task 1 accordingly before implementing.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `backend/app/services/bet_discovery.py` | **Create** | Fetch issues → call Gemini → return bet dicts |
| `backend/app/main.py` | **Modify** | Add `POST /bets/discover` endpoint |
| `backend/tests/unit/test_bet_discovery.py` | **Create** | Unit tests for `discover_bets_from_linear()` |
| `backend/tests/integration/test_discover_endpoint.py` | **Create** | Integration test for `POST /bets/discover` |
| `frontend/lib/api.ts` | **Modify** | Add `discoverBets()` helper |
| `frontend/app/workspace/directions/page.tsx` | **Modify** | Add "Scan Linear" button + handler |

---

## Task 1: `bet_discovery.py` — service function (TDD)

**Files:**
- Create: `backend/app/services/__init__.py` (empty)
- Create: `backend/app/services/bet_discovery.py`
- Create: `backend/tests/unit/test_bet_discovery.py`

### Step 1.1 — Write failing tests

Create `backend/tests/unit/test_bet_discovery.py`:

```python
"""Unit tests for discover_bets_from_linear().

Run with: cd backend && uv run pytest tests/unit/test_bet_discovery.py -v
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.fixture
def mock_issues():
    """Five fake LinearIssue-like objects."""
    from tools.linear_tools import LinearIssue
    return [
        LinearIssue(id=f"i-{i}", title=f"Issue {i}", status="Todo",
                    project_id=None, description=f"Description for issue {i}")
        for i in range(5)
    ]


@pytest.fixture
def gemini_json_response():
    """Fake Gemini response with 3 clusters."""
    return (
        '[{"name": "Voice-first workflows", '
        '"hypothesis": "We believe voice input reduces documentation time.", '
        '"problem_statement": "Decisions are lost in hallway conversations."}, '
        '{"name": "Async decision log", '
        '"hypothesis": "We believe async logging increases team alignment.", '
        '"problem_statement": "Context is scattered across tools."}, '
        '{"name": "Auto-capture integrations", '
        '"hypothesis": "We believe integrations reduce manual overhead.", '
        '"problem_statement": "Teams spend time on manual data entry."}]'
    )


@pytest.mark.asyncio
async def test_discover_returns_bet_dicts(mock_issues, gemini_json_response):
    """Happy path: 5 issues → Gemini → 3 new bets returned."""
    mock_linear = AsyncMock()
    mock_linear.list_issues.return_value = mock_issues

    mock_response = MagicMock()
    mock_response.text = gemini_json_response

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

    with patch("app.services.bet_discovery.get_linear_mcp", return_value=mock_linear), \
         patch("app.services.bet_discovery._make_genai_client", return_value=mock_client):
        from app.services.bet_discovery import discover_bets_from_linear
        result = await discover_bets_from_linear(
            workspace_id="ws-1",
            existing_names=set(),
        )

    assert len(result) == 3
    assert result[0]["status"] == "detecting"
    assert result[0]["declaration_source"]["type"] == "agent_inferred"
    assert result[0]["workspace_id"] == "ws-1"
    assert result[0]["name"] == "Voice-first workflows"
    assert "id" in result[0]
    assert "created_at" in result[0]


@pytest.mark.asyncio
async def test_discover_deduplicates_existing_names(mock_issues, gemini_json_response):
    """Clusters whose name matches an existing bet are skipped (case-insensitive)."""
    mock_linear = AsyncMock()
    mock_linear.list_issues.return_value = mock_issues

    mock_response = MagicMock()
    mock_response.text = gemini_json_response

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

    with patch("app.services.bet_discovery.get_linear_mcp", return_value=mock_linear), \
         patch("app.services.bet_discovery._make_genai_client", return_value=mock_client):
        from app.services.bet_discovery import discover_bets_from_linear
        result = await discover_bets_from_linear(
            workspace_id="ws-1",
            existing_names={"voice-first workflows"},  # already exists
        )

    assert len(result) == 2
    names = [b["name"] for b in result]
    assert "Voice-first workflows" not in names


@pytest.mark.asyncio
async def test_discover_caps_at_five_directions(mock_issues):
    """Never returns more than 5 bets regardless of Gemini output."""
    big_response = "[" + ",".join(
        f'{{"name": "Direction {i}", "hypothesis": "h{i}", "problem_statement": "p{i}"}}'
        for i in range(10)
    ) + "]"

    mock_linear = AsyncMock()
    mock_linear.list_issues.return_value = mock_issues

    mock_response = MagicMock()
    mock_response.text = big_response

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

    with patch("app.services.bet_discovery.get_linear_mcp", return_value=mock_linear), \
         patch("app.services.bet_discovery._make_genai_client", return_value=mock_client):
        from app.services.bet_discovery import discover_bets_from_linear
        result = await discover_bets_from_linear(
            workspace_id="ws-1",
            existing_names=set(),
        )

    assert len(result) <= 5


@pytest.mark.asyncio
async def test_discover_returns_empty_on_no_issues():
    """Returns empty list when Linear returns no issues."""
    mock_linear = AsyncMock()
    mock_linear.list_issues.return_value = []

    with patch("app.services.bet_discovery.get_linear_mcp", return_value=mock_linear):
        from app.services.bet_discovery import discover_bets_from_linear
        result = await discover_bets_from_linear(
            workspace_id="ws-1",
            existing_names=set(),
        )

    assert result == []


@pytest.mark.asyncio
async def test_discover_returns_empty_on_invalid_gemini_json(mock_issues):
    """Returns empty list (no crash) when Gemini returns malformed JSON."""
    mock_linear = AsyncMock()
    mock_linear.list_issues.return_value = mock_issues

    mock_response = MagicMock()
    mock_response.text = "This is not JSON at all."

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

    with patch("app.services.bet_discovery.get_linear_mcp", return_value=mock_linear), \
         patch("app.services.bet_discovery._make_genai_client", return_value=mock_client):
        from app.services.bet_discovery import discover_bets_from_linear
        result = await discover_bets_from_linear(
            workspace_id="ws-1",
            existing_names=set(),
        )

    assert result == []
```

- [ ] **Step 1.2 — Run tests to confirm FAIL**

```bash
cd backend && uv run pytest tests/unit/test_bet_discovery.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.services.bet_discovery'`

- [ ] **Step 1.3 — Create services package**

```bash
touch backend/app/services/__init__.py
```

- [ ] **Step 1.4 — Implement `bet_discovery.py`**

> Before writing: use Context7 MCP to confirm the `google-genai` async API. See Pre-flight section.

Create `backend/app/services/bet_discovery.py`:

```python
"""Bet Discovery Service — clusters Linear issues into proposed strategic directions.

Called by POST /bets/discover. No ADK pipeline involvement.
Bounded to 14-day read window (existing Signal Engine invariant).
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone

from google import genai
from google.genai import types as genai_types

from tools.linear_tools import get_linear_mcp

logger = logging.getLogger(__name__)

_MAX_ISSUES = 50
_MAX_DIRECTIONS = 5

_PROMPT_TEMPLATE = """\
You are a product strategy assistant. Given the following Linear issues, identify \
between 2 and 5 distinct strategic themes or product directions.

For each theme return a JSON object with exactly these fields:
- name: short direction title (max 8 words)
- hypothesis: one sentence testable hypothesis (start with "We believe...")
- problem_statement: one sentence describing the problem being solved

Return ONLY a valid JSON array of objects. No markdown fences, no explanation.

Issues (title | description excerpt):
{issues_text}"""


def _make_genai_client() -> genai.Client:
    """Create a Vertex AI Gemini client from environment config."""
    project = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
    location = os.environ.get("GOOGLE_CLOUD_LOCATION", "global")
    return genai.Client(vertexai=True, project=project, location=location)


def _build_issues_text(issues: list) -> str:
    lines = []
    for issue in issues:
        desc = (issue.description or "")[:200].replace("\n", " ")
        lines.append(f"- {issue.title} | {desc if desc else '(no description)'}")
    return "\n".join(lines)


def _build_bet_dict(cluster: dict, workspace_id: str, now: str) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "workspace_id": workspace_id,
        "name": cluster["name"].strip(),
        "target_segment": "",
        "problem_statement": cluster.get("problem_statement", ""),
        "hypothesis": cluster.get("hypothesis", ""),
        "success_metrics": [],
        "time_horizon": "",
        "linear_project_ids": [],
        "declaration_source": {"type": "agent_inferred", "raw_artifact_refs": []},
        "declaration_confidence": 0.7,
        "status": "detecting",
        "health_baseline": {
            "expected_bet_coverage_pct": 0.5,
            "expected_weekly_velocity": 3,
            "hypothesis_required": True,
            "metric_linked_required": False,
        },
        "acknowledged_risks": [],
        "linear_issue_ids": [],
        "doc_refs": [],
        "created_at": now,
        "last_monitored_at": now,
    }


async def discover_bets_from_linear(
    workspace_id: str,
    existing_names: set[str],
) -> list[dict]:
    """Fetch up to 50 recent Linear issues, cluster into 2-5 strategic directions.

    Returns a list of unsaved bet dicts. Caller is responsible for persistence.
    Never raises — returns [] on any failure.

    Args:
        workspace_id: Target workspace for the new bets.
        existing_names: Lowercased names of bets already in DB — used for dedup.
    """
    # 1. Fetch issues (no project filter — full workspace, 14-day window)
    linear_mcp = get_linear_mcp()
    try:
        issues = await linear_mcp.list_issues(project_ids=[], days=14)
    except Exception as exc:
        logger.warning("Linear fetch failed in bet discovery: %s", exc)
        return []

    issues = issues[:_MAX_ISSUES]
    if not issues:
        logger.info("No issues found for bet discovery in workspace %s", workspace_id)
        return []

    # 2. Build prompt
    issues_text = _build_issues_text(issues)
    prompt = _PROMPT_TEMPLATE.format(issues_text=issues_text)

    # 3. Call Gemini Flash
    try:
        client = _make_genai_client()
        response = await client.aio.models.generate_content(
            model="gemini-3-flash-preview",
            contents=prompt,
            config=genai_types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2,
            ),
        )
        raw_text = response.text
    except Exception as exc:
        logger.warning("Gemini call failed in bet discovery: %s", exc)
        return []

    # 4. Parse JSON
    try:
        clusters = json.loads(raw_text)
        if not isinstance(clusters, list):
            logger.warning("Gemini returned non-list JSON: %.200s", raw_text)
            return []
    except json.JSONDecodeError:
        logger.warning("Gemini returned invalid JSON: %.200s", raw_text)
        return []

    # 5. Build bet dicts (dedup + cap)
    now = datetime.now(timezone.utc).isoformat()
    bets: list[dict] = []
    for cluster in clusters:
        if len(bets) >= _MAX_DIRECTIONS:
            break
        name = cluster.get("name", "").strip()
        if not name:
            continue
        if name.lower() in existing_names:
            logger.info("Skipping duplicate direction: %s", name)
            continue
        bets.append(_build_bet_dict(cluster, workspace_id, now))

    return bets
```

- [ ] **Step 1.5 — Run tests to confirm PASS**

```bash
cd backend && uv run pytest tests/unit/test_bet_discovery.py -v
```

Expected: all 5 tests PASS.

- [ ] **Step 1.6 — Run python-reviewer agent**

Invoke `everything-claude-code:python-reviewer` on `backend/app/services/bet_discovery.py`. Address any HIGH or CRITICAL findings before continuing.

- [ ] **Step 1.7 — Commit**

```bash
cd backend
git add app/services/__init__.py app/services/bet_discovery.py tests/unit/test_bet_discovery.py
git commit -m "feat: add bet_discovery service — clusters Linear issues into proposed directions"
```

---

## Task 2: `POST /bets/discover` endpoint

**Files:**
- Modify: `backend/app/main.py` (add endpoint after `GET /bets/{bet_id}`)
- Create: `backend/tests/integration/test_discover_endpoint.py`

- [ ] **Step 2.1 — Write failing integration test**

Create `backend/tests/integration/test_discover_endpoint.py`:

```python
"""Integration test for POST /bets/discover.

Run with: cd backend && uv run pytest tests/integration/test_discover_endpoint.py -v
"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from app.main import app
    return TestClient(app)


@pytest.fixture
def mock_discovery_returns_two_bets():
    """Patch discover_bets_from_linear to return 2 fake bets."""
    import uuid
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    bets = [
        {
            "id": str(uuid.uuid4()),
            "workspace_id": "ws-test",
            "name": "Voice-first workflows",
            "target_segment": "",
            "problem_statement": "Decisions are lost.",
            "hypothesis": "We believe voice input reduces documentation time.",
            "success_metrics": [],
            "time_horizon": "",
            "linear_project_ids": [],
            "declaration_source": {"type": "agent_inferred", "raw_artifact_refs": []},
            "declaration_confidence": 0.7,
            "status": "detecting",
            "health_baseline": {
                "expected_bet_coverage_pct": 0.5,
                "expected_weekly_velocity": 3,
                "hypothesis_required": True,
                "metric_linked_required": False,
            },
            "acknowledged_risks": [],
            "linear_issue_ids": [],
            "doc_refs": [],
            "created_at": now,
            "last_monitored_at": now,
        },
        {
            "id": str(uuid.uuid4()),
            "workspace_id": "ws-test",
            "name": "Async decision log",
            "target_segment": "",
            "problem_statement": "Context is scattered.",
            "hypothesis": "We believe async logging increases alignment.",
            "success_metrics": [],
            "time_horizon": "",
            "linear_project_ids": [],
            "declaration_source": {"type": "agent_inferred", "raw_artifact_refs": []},
            "declaration_confidence": 0.7,
            "status": "detecting",
            "health_baseline": {
                "expected_bet_coverage_pct": 0.5,
                "expected_weekly_velocity": 3,
                "hypothesis_required": True,
                "metric_linked_required": False,
            },
            "acknowledged_risks": [],
            "linear_issue_ids": [],
            "doc_refs": [],
            "created_at": now,
            "last_monitored_at": now,
        },
    ]
    return bets


def test_discover_bets_no_db(client, mock_discovery_returns_two_bets):
    """POST /bets/discover returns created bets and appends to inmemory store."""
    with patch(
        "app.main.discover_bets_from_linear",
        new=AsyncMock(return_value=mock_discovery_returns_two_bets),
    ):
        response = client.post(
            "/bets/discover",
            json={"workspace_id": "ws-test"},
        )

    assert response.status_code == 200
    data = response.json()
    assert "created" in data
    assert "skipped_duplicates" in data
    assert len(data["created"]) == 2
    assert data["skipped_duplicates"] == 0
    assert data["created"][0]["status"] == "detecting"
    assert data["created"][0]["workspace_id"] == "ws-test"


def test_discover_bets_returns_empty_when_no_new(client):
    """Returns created=[] and skipped_duplicates=0 when discovery finds nothing."""
    with patch(
        "app.main.discover_bets_from_linear",
        new=AsyncMock(return_value=[]),
    ):
        response = client.post(
            "/bets/discover",
            json={"workspace_id": "ws-test"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["created"] == []
    assert data["skipped_duplicates"] == 0
```

- [ ] **Step 2.2 — Run test to confirm FAIL**

```bash
cd backend && uv run pytest tests/integration/test_discover_endpoint.py -v
```

Expected: FAIL — `POST /bets/discover` returns 404.

- [ ] **Step 2.3 — Add the endpoint to `main.py`**

After the `GET /bets/{bet_id}` endpoint (around line 388), add:

```python
# ─────────────────────────────────────────────
# BET DISCOVERY (auto-detect from Linear issues)
# ─────────────────────────────────────────────

from app.services.bet_discovery import discover_bets_from_linear


class DiscoverBody(BaseModel):
    workspace_id: str


@app.post("/bets/discover")
async def discover_bets_endpoint(body: DiscoverBody):
    """Scan recent Linear issues and auto-detect strategic directions.

    Uses Gemini Flash to cluster up to 50 issues into 2-5 proposed Bets
    with status=detecting. Deduplicates against existing bets by name.
    Falls back to in-memory store when DB is not configured (local dev).
    """
    from db.repository import list_bets, save_bet

    # Load existing bet names for dedup
    if is_db_configured():
        existing = await list_bets(body.workspace_id)
    else:
        existing = [b for b in _inmemory_bets if b["workspace_id"] == body.workspace_id]

    existing_names = {b["name"].lower() for b in existing}

    new_bets = await discover_bets_from_linear(body.workspace_id, existing_names)

    created = []
    skipped = 0
    for bet in new_bets:
        # Double-check dedup (race condition guard)
        if bet["name"].lower() in existing_names:
            skipped += 1
            continue
        if is_db_configured():
            from db.repository import upsert_workspace
            import uuid
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc).isoformat()
            await upsert_workspace({
                "id": body.workspace_id,
                "linear_team_id": "",
                "control_level": "draft_only",
                "created_at": now,
            })
            saved_id = await save_bet(bet)
            if saved_id:
                created.append(bet)
            else:
                skipped += 1
        else:
            _inmemory_bets.append(bet)
            created.append(bet)
        existing_names.add(bet["name"].lower())

    return {"created": created, "skipped_duplicates": skipped}
```

- [ ] **Step 2.4 — Run tests to confirm PASS**

```bash
cd backend && uv run pytest tests/integration/test_discover_endpoint.py -v
```

Expected: both tests PASS.

- [ ] **Step 2.5 — Run full backend test suite**

```bash
cd backend && uv run pytest tests/unit/ tests/integration/ -v --tb=short
```

Expected: all existing tests plus new tests pass. Fix any regressions before continuing.

- [ ] **Step 2.6 — Commit**

```bash
git add app/main.py tests/integration/test_discover_endpoint.py
git commit -m "feat: add POST /bets/discover endpoint for auto-detecting directions from Linear"
```

---

## Task 3: Frontend API helper

**Files:**
- Modify: `frontend/lib/api.ts`

- [ ] **Step 3.1 — Add `discoverBets()` to `api.ts`**

Append after the `getInterventionsByBet` function (after line 102 in the current file):

```typescript
// ─── Bet Discovery ───

export interface DiscoverBetsResponse {
  created: Bet[];
  skipped_duplicates: number;
}

export function discoverBets(workspaceId: string): Promise<DiscoverBetsResponse> {
  return request<DiscoverBetsResponse>("/bets/discover", {
    method: "POST",
    body: JSON.stringify({ workspace_id: workspaceId }),
  });
}
```

- [ ] **Step 3.2 — Verify TypeScript compiles**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors in `lib/api.ts`.

- [ ] **Step 3.3 — Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat: add discoverBets() API helper"
```

---

## Task 4: "Scan Linear" button on DirectionsPage

**Files:**
- Modify: `frontend/app/workspace/directions/page.tsx`

- [ ] **Step 4.1 — Update imports**

In `frontend/app/workspace/directions/page.tsx`, update the import lines:

```typescript
// Replace the lucide-react import line with:
import {
  Target, AlertTriangle, CheckCircle2, Clock,
  ChevronRight, Zap, Plus, RefreshCw, Search, Loader2,
} from "lucide-react";

// Add discoverBets to the api import:
import { listBets, discoverBets } from "@/lib/api";
```

- [ ] **Step 4.2 — Add scan state and handler inside `DirectionsPage`**

Inside `DirectionsPage`, after the existing `useQuery` block (after line ~182 in current file), add:

```typescript
const [isScanning, setIsScanning] = useState(false);
const [scanError, setScanError] = useState<string | null>(null);

async function handleScanLinear() {
  setIsScanning(true);
  setScanError(null);
  try {
    const result = await discoverBets(WORKSPACE_ID);
    await refetch();
    if (result.created.length === 0) {
      setScanError("No new directions found — all clusters already exist.");
    }
  } catch (err) {
    setScanError(err instanceof Error ? err.message : "Scan failed. Is the backend running?");
  } finally {
    setIsScanning(false);
  }
}
```

- [ ] **Step 4.3 — Add the button and error display to the page header**

Replace the existing button group (the `<div className="flex items-center gap-2">` containing the refresh and "+ New direction" buttons) with:

```tsx
<div className="flex flex-col items-end gap-1.5">
  <div className="flex items-center gap-2">
    {/* Refresh */}
    <button
      onClick={() => refetch()}
      disabled={isFetching}
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white/60 text-slate-400 transition-all hover:bg-white/80 hover:text-slate-600",
        isFetching && "animate-spin",
      )}
      aria-label="Refresh directions"
    >
      <RefreshCw size={15} />
    </button>
    {/* Scan Linear */}
    <button
      onClick={handleScanLinear}
      disabled={isScanning}
      className={cn(
        "flex items-center gap-2 rounded-xl border border-slate-200 bg-white/60 px-4 py-2.5 text-sm font-medium text-slate-600 transition-all hover:bg-white/80 hover:text-slate-800 active:scale-95",
        isScanning && "cursor-not-allowed opacity-60",
      )}
      aria-label="Scan Linear for new directions"
    >
      {isScanning ? (
        <Loader2 size={15} className="animate-spin" />
      ) : (
        <Search size={15} />
      )}
      {isScanning ? "Scanning…" : "Scan Linear"}
    </button>
    {/* New direction */}
    <button
      onClick={() => setShowDeclareModal(true)}
      className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 transition-all hover:bg-indigo-500 active:scale-95"
    >
      <Plus size={15} />
      New direction
    </button>
  </div>
  {/* Inline scan error */}
  {scanError && (
    <p className="text-xs text-amber-600">{scanError}</p>
  )}
</div>
```

- [ ] **Step 4.4 — Verify TypeScript + lint**

```bash
cd frontend && npm run lint && npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 4.5 — Manual smoke test**

1. Start the backend: `cd backend && uv run uvicorn app.main:app --port 8000 --reload`
2. Start the frontend: `cd frontend && npm run dev`
3. Open `http://localhost:3000/workspace/directions`
4. Click "Scan Linear"
5. Spinner appears while scanning
6. New `detecting` cards appear in the grid (or "No new directions found" message if all duplicates)
7. The "Detecting" tab counter updates

- [ ] **Step 4.6 — Run code-reviewer agent**

Invoke `everything-claude-code:code-reviewer` on `frontend/app/workspace/directions/page.tsx`. Address any HIGH or CRITICAL findings.

- [ ] **Step 4.7 — Commit**

```bash
git add frontend/app/workspace/directions/page.tsx
git commit -m "feat: add Scan Linear button to Strategic Directions page"
```

---

## Self-Review Checklist

- [x] **Spec coverage:**
  - "Scan Linear" button → Task 4 ✓
  - `POST /bets/discover` endpoint → Task 2 ✓
  - `bet_discovery.py` service → Task 1 ✓
  - `discoverBets()` API helper → Task 3 ✓
  - Dedup by name → Task 1 Step 1.4 (`existing_names` check) ✓
  - Max 5 directions → `_MAX_DIRECTIONS = 5` in Task 1 ✓
  - 14-day window → `days=14` in `list_issues` call ✓
  - 50-issue cap → `_MAX_ISSUES = 50` + `issues[:_MAX_ISSUES]` ✓
  - `status=detecting`, `source=agent_inferred` → `_build_bet_dict` in Task 1 ✓
  - In-memory fallback → Task 2 Step 2.3 (`_inmemory_bets.append`) ✓
  - Error handling (Gemini fail, Linear fail, bad JSON) → Task 1 + tests ✓
  - Loading state + inline error → Task 4 Step 4.2-4.3 ✓
  - Context7 MCP for google-genai docs → Pre-flight section ✓
  - python-reviewer after bet_discovery.py → Task 1 Step 1.6 ✓
  - code-reviewer after frontend changes → Task 4 Step 4.6 ✓

- [x] **Placeholder scan:** No TBDs, TODOs, or vague steps found.

- [x] **Type consistency:**
  - `discover_bets_from_linear` defined in Task 1, imported in Task 2 ✓
  - `discoverBets` returns `DiscoverBetsResponse` in Task 3, consumed in Task 4 ✓
  - `_make_genai_client` defined and patched consistently in tests ✓
  - `_build_bet_dict` defined in Task 1 and used only there ✓
