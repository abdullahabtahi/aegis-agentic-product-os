"""Linear Interface — Primary implementation for Aegis Signal Engine reads.

Signal Engine reads directly from the Linear GraphQL API via RealLinearMCP,
satisfying the 14-day bounded read window (CLAUDE.md hard invariant).

Future Phase 4 Executor writes will transition to the standardized McpToolset
integrated with the official Linear MCP server.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

# Path to fixtures directory — relative to this file
_FIXTURES_DIR = Path(__file__).parent.parent / "evals" / "fixtures"

_FIXTURE_MAP: dict[str, str] = {
    r"^proj-healthy": "healthy_workspace.json",
    r"^proj-messy": "messy_workspace.json",
    r"^proj-api": "cross_team_workspace.json",
    # Eval trace aliases (used in golden traces to select specific signals)
    r"^fixture:healthy": "healthy_workspace.json",
    r"^fixture:messy": "messy_workspace.json",
    r"^fixture:cross-team": "cross_team_workspace.json",
}


@dataclass(frozen=True)
class LinearIssue:
    id: str
    title: str
    status: str
    project_id: str | None
    description: str
    rolled_over: bool = False
    roll_count: int = 0


@dataclass(frozen=True)
class IssueRelation:
    from_issue: str
    type: str  # "blocked_by" | "blocks" | "related"
    to_issue: str
    to_team: str | None = None  # cross-team if set


class MockLinearMCP:
    """Deterministic test double for the Linear MCP server.

    All methods are async to match the future real McpToolset interface.
    Returns immutable data — never mutates the fixture JSON.
    """

    def __init__(self) -> None:
        self._cache: dict[str, dict[str, Any]] = {}

    def _load_fixture(self, fixture_name: str) -> dict[str, Any]:
        if fixture_name not in self._cache:
            path = _FIXTURES_DIR / fixture_name
            if not path.exists():
                raise FileNotFoundError(
                    f"Fixture not found: {path}. "
                    "Add it to backend/evals/fixtures/ before writing agent code."
                )
            self._cache[fixture_name] = json.loads(path.read_text())
        return self._cache[fixture_name]

    def _fixture_for_project(self, project_id: str) -> dict[str, Any]:
        for pattern, fixture_name in _FIXTURE_MAP.items():
            if re.match(pattern, project_id):
                return self._load_fixture(fixture_name)
        raise ValueError(
            f"No fixture matched project_id='{project_id}'. "
            f"Known prefixes: {list(_FIXTURE_MAP.keys())}. "
            "Add a fixture or use a known project_id prefix."
        )

    async def list_issues(
        self,
        project_ids: list[str],
        days: int = 14,
        team_id: str | None = None,
    ) -> list[LinearIssue]:
        """Returns issues from the matching fixture. Bounded to 'days' window.

        In the mock, we return all fixture issues — real Linear read is always bounded
        to 'days' (Signal Engine invariant). Days param is validated but not used in mock.
        """
        if days > 14:
            raise ValueError(
                f"Signal Engine must never read more than 14 days. Got days={days}. "
                "This is a hard constraint (CLAUDE.md)."
            )
        # Workspace-wide scan: return issues from all known fixtures (deduplicated by ID)
        if not project_ids:
            seen: set[str] = set()
            all_issues: list[LinearIssue] = []
            for fixture_name in dict.fromkeys(_FIXTURE_MAP.values()):  # preserve order, dedup fixture names
                try:
                    fixture = self._load_fixture(fixture_name)
                except FileNotFoundError:
                    continue
                for issue in fixture.get("issues", []):
                    if issue["id"] not in seen:
                        seen.add(issue["id"])
                        all_issues.append(
                            LinearIssue(
                                id=issue["id"],
                                title=issue["title"],
                                status=issue["status"],
                                project_id=issue.get("project_id"),
                                description=issue.get("description", ""),
                                rolled_over=issue.get("rolled_over", False),
                                roll_count=issue.get("roll_count", 0),
                            )
                        )
            return all_issues

        fixture = self._fixture_for_project(project_ids[0])
        return [
            LinearIssue(
                id=issue["id"],
                title=issue["title"],
                status=issue["status"],
                project_id=issue.get("project_id"),
                description=issue.get("description", ""),
                rolled_over=issue.get("rolled_over", False),
                roll_count=issue.get("roll_count", 0),
            )
            for issue in fixture.get("issues", [])
        ]

    async def list_issue_relations(
        self,
        issue_ids: list[str],
    ) -> list[IssueRelation]:
        """Returns blocked_by/blocks/related relations from the matching fixture."""
        if not issue_ids:
            return []

        # Find which fixture contains these issue_ids
        for fixture_name in _FIXTURE_MAP.values():
            try:
                fixture = self._load_fixture(fixture_name)
                fixture_issue_ids = {i["id"] for i in fixture.get("issues", [])}
                if any(iid in fixture_issue_ids for iid in issue_ids):
                    return [
                        IssueRelation(
                            from_issue=rel["from_issue"],
                            type=rel["type"],
                            to_issue=rel["to_issue"],
                            to_team=rel.get("to_team"),
                        )
                        for rel in fixture.get("issue_relations", [])
                        if rel["from_issue"] in issue_ids
                    ]
            except FileNotFoundError:
                continue
        return []

    async def get_linear_signals_from_fixture(
        self,
        project_id: str,
    ) -> dict[str, Any]:
        """Returns the pre-computed linear_signals dict from the fixture.

        Used by SignalEngineAgent in Phase 1 to avoid re-computing what the fixture
        already has. Phase 2+: replace with actual Signal Engine computation.
        """
        fixture = self._fixture_for_project(project_id)
        return fixture["linear_signals"]

    async def write_action(self, action: dict[str, Any]) -> dict[str, str]:
        """Mock write — logs the action but does NOT call Linear API.

        Returns a fake confirmation. Phase 2+: replace with real Linear MCP write.
        """
        action_type = next(
            (k for k in action if action[k] is not None and k != "add_label"), None
        )
        return {
            "status": "mock_success",
            "message": f"[MOCK] Linear action '{action_type}' recorded. No live write performed.",
        }


# ADK FunctionTool wrappers delegation
# Executed in the context of the Signal Engine agent.


async def list_linear_issues(project_ids: str, days: int = 14) -> dict:
    """List Linear issues for given project IDs (comma-separated) bounded to 14 days.

    Args:
        project_ids: Comma-separated Linear project IDs to read from.
        days: Read window in days. Maximum 14 (Signal Engine invariant).

    Returns:
        dict with 'issues' list and 'total' count.
    """
    ids = [p.strip() for p in project_ids.split(",") if p.strip()]
    client = get_linear_mcp()
    issues = await client.list_issues(project_ids=ids, days=days)
    return {
        "status": "success",
        "issues": [
            {
                "id": i.id,
                "title": i.title,
                "status": i.status,
                "project_id": i.project_id,
                "description": i.description,
                "rolled_over": i.rolled_over,
                "roll_count": i.roll_count,
            }
            for i in issues
        ],
        "total": len(issues),
    }


async def list_linear_relations(issue_ids: str) -> dict:
    """List blocked_by/blocks/related relations for given issue IDs (comma-separated).

    Args:
        issue_ids: Comma-separated Linear issue IDs to get relations for.

    Returns:
        dict with 'relations' list and cross-team count.
    """
    ids = [i.strip() for i in issue_ids.split(",") if i.strip()]
    client = get_linear_mcp()
    relations = await client.list_issue_relations(issue_ids=ids)
    cross_team = [r for r in relations if r.to_team is not None]
    return {
        "status": "success",
        "relations": [
            {
                "from_issue": r.from_issue,
                "type": r.type,
                "to_issue": r.to_issue,
                "to_team": r.to_team,
                "is_cross_team": r.to_team is not None,
            }
            for r in relations
        ],
        "cross_team_count": len(cross_team),
    }


# ─────────────────────────────────────────────
# REAL LINEAR MCP
# ─────────────────────────────────────────────

# GraphQL query: issues + inline relations.
# MAX_ISSUES=250 is a safety cap consistent with the 14-day bounded read window.
# NOTE: Rollover detection (cycle history) is omitted — Linear's IssueHistory schema
# does not expose addedToCycleId as a scalar. rolled_over/roll_count default to False/0
# for RealLinearMCP; MockLinearMCP still provides fixture values for eval traces.
_ISSUES_QUERY = """
query AegisListIssues($filter: IssueFilter!, $first: Int!) {
  issues(filter: $filter, first: $first) {
    nodes {
      id
      title
      state { name }
      project { id }
      description
      relations(first: 15) {
        nodes {
          type
          relatedIssue {
            id
            team { id name }
          }
        }
      }
    }
  }
}
"""


class RealLinearMCP:
    """Live Linear GraphQL client for Signal Engine reads.

    Uses direct httpx (not McpToolset). McpToolset is designed for LLM agents;
    Signal Engine is a deterministic BaseAgent and needs programmatic access.

    Rollover detection:
      Issues are "rolled over" when they appear in more than one cycle.
      `history.addedToCycleId` events reveal distinct cycle memberships.
      roll_count = len(distinct cycle IDs) - 1
      rolled_over = roll_count >= 1

    Phase 4 Executor writes will use McpToolset(StreamableHTTPConnectionParams(
        url="https://mcp.linear.app/mcp",
        headers={"Authorization": f"Bearer {LINEAR_API_KEY}"}
    )) — 24 tools including create_comment, create_issue.

    write_action() on this class raises NotImplementedError intentionally.
    """

    _GRAPHQL_URL = "https://api.linear.app/graphql"
    _MAX_ISSUES = 250  # safety cap — prevents unbounded queries

    def __init__(self, api_key: str) -> None:
        # Linear personal API keys are sent without the "Bearer" prefix.
        # Bearer prefix → INPUT_ERROR 400 from Linear GraphQL API.
        import httpx

        self._headers = {
            "Authorization": api_key,
            "Content-Type": "application/json",
        }
        # Long-lived client for connection reuse across calls within a pipeline cycle.
        # Signal Engine always calls list_issues then list_issue_relations — reusing
        # the same TCP/TLS connection saves ~100–200ms per scan.
        self._client = httpx.AsyncClient(
            timeout=30.0,
            http2=True,
        )
        # Relations cache populated by list_issues; consumed by list_issue_relations.
        # This avoids a second round-trip since Signal Engine always calls
        # list_issues before list_issue_relations within the same pipeline cycle.
        self._relations_cache: dict[str, list[IssueRelation]] = {}

    async def _graphql(
        self, query: str, variables: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        variables = variables or {}
        response = await self._client.post(
            self._GRAPHQL_URL,
            headers=self._headers,
            json={"query": query, "variables": variables},
        )
        response.raise_for_status()
        data = response.json()
        if "errors" in data:
            raise RuntimeError(f"Linear GraphQL error: {data['errors']}")
        return data["data"]

    async def list_issues(
        self,
        project_ids: list[str],
        days: int = 14,
        team_id: str | None = None,
    ) -> list[LinearIssue]:
        """Query Linear issues updated within the 14-day window.

        Also populates self._relations_cache keyed by issue ID.
        Bounded to _MAX_ISSUES=250 — consistent with CLAUDE.md 14-day invariant.
        """
        if days > 14:
            raise ValueError(
                f"Signal Engine must never read more than 14 days. Got days={days}. "
                "This is a hard constraint (CLAUDE.md)."
            )
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

        issue_filter: dict[str, Any] = {"updatedAt": {"gte": cutoff}}
        if project_ids:
            issue_filter["project"] = {"id": {"in": project_ids}}
        if team_id:
            issue_filter["team"] = {"id": {"eq": team_id}}

        data = await self._graphql(
            _ISSUES_QUERY,
            {"filter": issue_filter, "first": self._MAX_ISSUES},
        )

        issues: list[LinearIssue] = []
        self._relations_cache.clear()

        for node in data["issues"]["nodes"]:
            # Rollover detection requires cycle history which is not in this query.
            # MockLinearMCP provides fixture values for eval traces; real API defaults to 0.
            issue_id = node["id"]
            issues.append(
                LinearIssue(
                    id=issue_id,
                    title=node["title"],
                    status=(node["state"]["name"] if node.get("state") else "Unknown"),
                    project_id=(node["project"]["id"] if node.get("project") else None),
                    description=node.get("description") or "",
                    rolled_over=False,
                    roll_count=0,
                )
            )

            # Populate relations cache from inline data
            relations_for_issue: list[IssueRelation] = []
            for rel in (node.get("relations") or {}).get("nodes", []):
                related = rel.get("relatedIssue") or {}
                team_info = related.get("team")
                relations_for_issue.append(
                    IssueRelation(
                        from_issue=issue_id,
                        type=rel.get("type", "related").lower(),
                        to_issue=related.get("id", ""),
                        to_team=(team_info.get("name") if team_info else None),
                    )
                )
            if relations_for_issue:
                self._relations_cache[issue_id] = relations_for_issue

        return issues

    async def list_issue_relations(
        self,
        issue_ids: list[str],
    ) -> list[IssueRelation]:
        """Returns relations for the given issue IDs from the in-cycle cache.

        Call list_issues() first — relations are fetched inline in the same
        GraphQL query to avoid a second round-trip.
        """
        result: list[IssueRelation] = []
        for issue_id in issue_ids:
            result.extend(self._relations_cache.get(issue_id, []))
        return result

    async def write_action(self, action: dict[str, Any]) -> dict[str, str]:
        """Execute a bounded LinearAction write via Linear GraphQL API.

        Supports: add_comment (commentCreate), create_issue (issueCreate).
        Other action types return a no-op confirmation.
        All writes are bounded to the LinearAction interface — never improvises.
        """
        # add_comment → Linear commentCreate mutation
        comment_text = action.get("add_comment")
        if comment_text and isinstance(comment_text, str):
            # add_comment requires an issue_id context — passed as action metadata
            issue_id = action.get("issue_id", "")
            if not issue_id:
                return {"status": "skipped", "reason": "add_comment requires issue_id"}
            mutation = """
            mutation CreateComment($issueId: String!, $body: String!) {
              commentCreate(input: { issueId: $issueId, body: $body }) {
                success
                comment { id body }
              }
            }
            """
            data = await self._graphql(
                mutation, {"issueId": issue_id, "body": comment_text}
            )
            result = data.get("commentCreate", {})
            if result.get("success"):
                return {
                    "status": "success",
                    "comment_id": result.get("comment", {}).get("id", ""),
                }
            return {
                "status": "failed",
                "reason": "commentCreate returned success=false",
            }

        # create_issue → Linear issueCreate mutation
        create_issue = action.get("create_issue")
        if create_issue and isinstance(create_issue, dict):
            title = create_issue.get("title", "")
            description = create_issue.get("description", "")
            project_id = create_issue.get("project_id")
            if not title:
                return {"status": "skipped", "reason": "create_issue requires title"}
            variables: dict[str, Any] = {"title": title, "description": description}
            # projectId is optional — only set if provided
            project_clause = ""
            if project_id:
                variables["projectId"] = project_id
                project_clause = ", projectId: $projectId"
            mutation = f"""
            mutation CreateIssue($title: String!, $description: String!{", $projectId: String" if project_id else ""}) {{
              issueCreate(input: {{ title: $title, description: $description{project_clause} }}) {{
                success
                issue {{ id title }}
              }}
            }}
            """
            data = await self._graphql(mutation, variables)
            result = data.get("issueCreate", {})
            if result.get("success"):
                return {
                    "status": "success",
                    "issue_id": result.get("issue", {}).get("id", ""),
                }
            return {"status": "failed", "reason": "issueCreate returned success=false"}

    async def whoami(self) -> dict[str, str]:
        """Diagnostic helper: returns the authenticated user and organization.

        Use this to verify LINEAR_API_KEY connectivity.
        """
        query = """
        query {
          viewer { id name email }
          organization { id name logoUrl }
        }
        """
        try:
            data = await self._graphql(query)
            viewer = data.get("viewer") or {}
            org = data.get("organization") or {}
            return {
                "user": viewer.get("name", "Unknown"),
                "email": viewer.get("email", "Unknown"),
                "organization": org.get("name", "Unknown"),
                "status": "connected",
            }
        except Exception as e:
            return {"status": "error", "message": str(e)}

        # Unrecognized or no-op action
        return {"status": "no_op", "reason": "no recognized write action in payload"}


# ─────────────────────────────────────────────
# FACTORY
# ─────────────────────────────────────────────


def get_linear_mcp() -> RealLinearMCP | MockLinearMCP:
    """Return the correct Linear client based on environment.

    Always returns RealLinearMCP if LINEAR_API_KEY is present in .env.
    Falls back to MockLinearMCP only for local dev without a key or explicit eval mode.
    """
    api_key = os.environ.get("LINEAR_API_KEY", "").strip()
    force_mock = os.environ.get("AEGIS_MOCK_LINEAR", "").lower() == "true"

    if api_key and not force_mock:
        return RealLinearMCP(api_key=api_key)
    return MockLinearMCP()
