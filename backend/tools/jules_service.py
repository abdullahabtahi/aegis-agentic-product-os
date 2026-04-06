"""Jules API Client — Google's autonomous coding agent integration.

Jules API (v1alpha): https://jules.google/docs/api/reference/overview/
Base URL: https://jules.googleapis.com/v1alpha
Auth: X-Goog-Api-Key header

Aegis uses Jules for Level 3 escalation actions that require code changes:
  - jules_instrument_experiment: Add observability/instrumentation
  - jules_add_guardrails: Add safety checks to risky deployment
  - jules_refactor_blocker: Refactor technical blocker
  - jules_scaffold_experiment: Create experiment scaffold

Flow:
  1. Executor creates a Jules session with requirePlanApproval=True
  2. Jules generates a plan (code change proposal)
  3. Founder reviews and approves/rejects the plan in Jules
  4. Jules executes approved plan and creates a PR

Graceful degradation: if JULES_API_KEY is not set, all calls return
descriptive error dicts. Governor's jules_gate (check #4) already prevents
Jules actions when workspace.github_repo is not set.
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_JULES_BASE_URL = "https://jules.googleapis.com/v1alpha"
_JULES_API_KEY = os.environ.get("JULES_API_KEY", "")


# ─────────────────────────────────────────────
# PROMPT TEMPLATES — map action_type to Jules task prompt
# ─────────────────────────────────────────────

_JULES_PROMPTS: dict[str, str] = {
    "jules_instrument_experiment": (
        "Add observability and instrumentation code for the following experiment. "
        "Include logging, metrics collection, and success/failure tracking.\n\n"
        "Context:\n{rationale}\n\n"
        "Requirements:\n"
        "- Add structured logging for experiment start/end/outcome\n"
        "- Add metrics counters for key experiment events\n"
        "- Ensure instrumentation is non-blocking and does not affect experiment logic\n"
        "- Follow existing project conventions for logging and metrics"
    ),
    "jules_add_guardrails": (
        "Add safety checks and guardrails for the following risky deployment or code path.\n\n"
        "Context:\n{rationale}\n\n"
        "Requirements:\n"
        "- Add input validation at system boundaries\n"
        "- Add circuit breakers or fallback paths where appropriate\n"
        "- Add rate limiting if the code path is user-facing\n"
        "- Ensure guardrails fail safely (deny by default)\n"
        "- Follow existing project conventions for error handling"
    ),
    "jules_refactor_blocker": (
        "Refactor the technical blocker described below to unblock progress.\n\n"
        "Context:\n{rationale}\n\n"
        "Requirements:\n"
        "- Make minimal, focused changes to resolve the blocker\n"
        "- Maintain backward compatibility where possible\n"
        "- Add or update tests for refactored code\n"
        "- Follow existing project code style and conventions"
    ),
    "jules_scaffold_experiment": (
        "Create an experiment scaffold for the following hypothesis validation.\n\n"
        "Context:\n{rationale}\n\n"
        "Requirements:\n"
        "- Create the experiment entry point and configuration\n"
        "- Add data collection hooks for measuring outcomes\n"
        "- Include a clear on/off toggle (feature flag pattern)\n"
        "- Add documentation explaining the experiment design and success criteria\n"
        "- Follow existing project conventions for experiments and feature flags"
    ),
}


def _get_jules_prompt(action_type: str, rationale: str, title: str) -> str:
    """Build the Jules session prompt from action type and intervention context."""
    template = _JULES_PROMPTS.get(action_type, "")
    if not template:
        return f"Execute the following coding task: {title}\n\nContext: {rationale}"
    return template.format(rationale=rationale)


# ─────────────────────────────────────────────
# JULES CLIENT
# ─────────────────────────────────────────────

class JulesClient:
    """Async client for the Jules API (v1alpha).

    All methods are safe to call without a configured API key — they return
    error dicts instead of raising. Governor's jules_gate prevents reaching
    this code without github_repo set on the workspace.
    """

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or _JULES_API_KEY
        self._base_url = _JULES_BASE_URL

    def is_configured(self) -> bool:
        return bool(self._api_key.strip())

    def _headers(self) -> dict[str, str]:
        return {
            "X-Goog-Api-Key": self._api_key,
            "Content-Type": "application/json",
        }

    async def list_sources(self) -> list[dict[str, Any]]:
        """List connected GitHub repositories available to Jules.

        Returns list of source dicts with 'name', 'owner', 'repo' fields.
        """
        if not self.is_configured():
            return []
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"{self._base_url}/sources",
                    headers=self._headers(),
                )
                resp.raise_for_status()
                data = resp.json()
                return data.get("sources", [])
        except Exception as exc:
            logger.warning("Jules list_sources failed: %s", exc)
            return []

    async def find_source_for_repo(self, github_repo: str) -> str | None:
        """Find the Jules source name for a given GitHub repo URL or owner/repo string.

        Args:
            github_repo: e.g. "https://github.com/owner/repo" or "owner/repo"

        Returns:
            Jules source name (e.g. "sources/github/owner/repo") or None.
        """
        # Normalize to owner/repo
        repo_path = github_repo.replace("https://github.com/", "").strip("/")
        parts = repo_path.split("/")
        if len(parts) < 2:
            return None
        owner, repo = parts[0], parts[1]

        sources = await self.list_sources()
        for source in sources:
            source_name = source.get("name", "")
            if f"{owner}/{repo}" in source_name.lower():
                return source_name

        # If exact match not found, construct the expected format
        return f"sources/github/{owner}/{repo}"

    async def create_session(
        self,
        action_type: str,
        title: str,
        rationale: str,
        github_repo: str,
        starting_branch: str = "main",
    ) -> dict[str, Any]:
        """Create a Jules coding session for a Level 3 intervention.

        Creates the session with requirePlanApproval=True — Jules generates
        a plan, founder reviews it, then Jules executes and creates a PR.

        Args:
            action_type: One of the jules_* action types.
            title: Intervention title (used as session title).
            rationale: Intervention rationale (used to build the Jules prompt).
            github_repo: GitHub repo URL or owner/repo string.
            starting_branch: Branch to base changes on.

        Returns:
            Dict with session info: id, name, title, status, or error details.
        """
        if not self.is_configured():
            return {
                "status": "error",
                "error": "JULES_API_KEY not configured",
            }

        source_name = await self.find_source_for_repo(github_repo)
        if not source_name:
            return {
                "status": "error",
                "error": f"Could not resolve Jules source for repo: {github_repo}",
            }

        prompt = _get_jules_prompt(action_type, rationale, title)

        body = {
            "prompt": prompt,
            "sourceContext": {
                "source": source_name,
                "githubRepoContext": {
                    "startingBranch": starting_branch,
                },
            },
            "automationMode": "AUTO_CREATE_PR",
            "title": f"[Aegis] {title}",
            "requirePlanApproval": True,
        }

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    f"{self._base_url}/sessions",
                    headers=self._headers(),
                    json=body,
                )
                resp.raise_for_status()
                session_data = resp.json()

                session_id = session_data.get("id", "")
                session_name = session_data.get("name", "")

                logger.info(
                    "Jules session created: id=%s, action=%s, repo=%s",
                    session_id, action_type, github_repo,
                )

                return {
                    "status": "session_created",
                    "session_id": session_id,
                    "session_name": session_name,
                    "title": session_data.get("title", ""),
                    "require_plan_approval": True,
                    "jules_url": f"https://jules.google/sessions/{session_id}",
                }

        except httpx.HTTPStatusError as exc:
            error_body = exc.response.text
            logger.warning(
                "Jules create_session HTTP %s: %s", exc.response.status_code, error_body,
            )
            return {
                "status": "error",
                "error": f"Jules API returned {exc.response.status_code}",
                "detail": error_body[:500],
            }
        except Exception as exc:
            logger.warning("Jules create_session failed: %s", exc)
            return {
                "status": "error",
                "error": str(exc),
            }

    async def get_session(self, session_id: str) -> dict[str, Any]:
        """Get current status of a Jules session.

        Returns session dict including outputs (PR URL if completed).
        """
        if not self.is_configured():
            return {"status": "error", "error": "JULES_API_KEY not configured"}
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"{self._base_url}/sessions/{session_id}",
                    headers=self._headers(),
                )
                resp.raise_for_status()
                return resp.json()
        except Exception as exc:
            logger.warning("Jules get_session(%s) failed: %s", session_id, exc)
            return {"status": "error", "error": str(exc)}

    async def approve_plan(self, session_id: str) -> dict[str, Any]:
        """Approve Jules's generated plan for a session.

        Called after founder reviews the plan. Jules then executes
        the approved changes and creates a PR.
        """
        if not self.is_configured():
            return {"status": "error", "error": "JULES_API_KEY not configured"}
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{self._base_url}/sessions/{session_id}:approvePlan",
                    headers=self._headers(),
                    json={},
                )
                resp.raise_for_status()
                return {"status": "plan_approved", "session_id": session_id}
        except Exception as exc:
            logger.warning("Jules approve_plan(%s) failed: %s", session_id, exc)
            return {"status": "error", "error": str(exc)}

    async def list_activities(
        self,
        session_id: str,
        page_size: int = 30,
    ) -> list[dict[str, Any]]:
        """List activities (progress events) for a Jules session."""
        if not self.is_configured():
            return []
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"{self._base_url}/sessions/{session_id}/activities",
                    headers=self._headers(),
                    params={"pageSize": page_size},
                )
                resp.raise_for_status()
                data = resp.json()
                return data.get("activities", [])
        except Exception as exc:
            logger.warning("Jules list_activities(%s) failed: %s", session_id, exc)
            return []


# ─────────────────────────────────────────────
# FACTORY
# ─────────────────────────────────────────────

_client: JulesClient | None = None


def get_jules_client() -> JulesClient:
    """Get or create the singleton JulesClient.

    Reads JULES_API_KEY from environment. Safe to call without key —
    client methods return error dicts instead of raising.
    """
    global _client
    if _client is None:
        _client = JulesClient()
    return _client


def is_jules_configured() -> bool:
    """Check if Jules API key is available."""
    return get_jules_client().is_configured()
