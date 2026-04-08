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

_DEFAULT_HEALTH_BASELINE: dict = {
    "expected_bet_coverage_pct": 0.5,
    "expected_weekly_velocity": 3,
    "hypothesis_required": True,
    "metric_linked_required": False,
}

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
    def _format(issue) -> str:
        desc = (issue.description or "")[:200].replace("\n", " ")
        return f"- {issue.title} | {desc or '(no description)'}"
    return "\n".join(_format(i) for i in issues)


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
        "health_baseline": dict(_DEFAULT_HEALTH_BASELINE),
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
