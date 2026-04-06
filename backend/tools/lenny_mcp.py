"""Lenny MCP Client — search 284 Lenny's Podcast episode transcripts.

Lenny MCP (https://lenny-mcp.onrender.com/mcp) provides access to product
leadership wisdom from Shreyas Doshi, Julie Zhuo, Brian Chesky, and others.

Used by Product Brain synthesis agent to ground risk classification in
product principles and startup failure patterns.

Tools exposed by Lenny MCP:
  - search_transcripts: keyword search across 284 episodes
  - get_episode: full transcript for a specific guest
  - list_episodes: list all available episodes

We wrap search_transcripts as an ADK-compatible tool function for the
synthesis agent. Graceful degradation: returns empty results if MCP is
unreachable (synthesis continues without enrichment).

Protocol: MCP over StreamableHTTP (JSON-RPC 2.0 over HTTP POST).
"""

from __future__ import annotations

import logging
import os

import httpx
from google.adk.tools import ToolContext

logger = logging.getLogger(__name__)

_LENNY_MCP_URL = os.environ.get(
    "LENNY_MCP_URL",
    "https://lenny-mcp.onrender.com/mcp",
)

_MCP_TIMEOUT = 15  # seconds — Lenny MCP is on free-tier Render, can be slow


async def _mcp_call(method: str, params: dict) -> dict:
    """Make a JSON-RPC 2.0 call to the Lenny MCP server.

    Returns the result dict, or an empty dict on any failure.
    """
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params,
    }
    try:
        async with httpx.AsyncClient(timeout=_MCP_TIMEOUT) as client:
            resp = await client.post(
                _LENNY_MCP_URL,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("result", {})
    except httpx.TimeoutException:
        logger.warning("Lenny MCP timeout after %ds", _MCP_TIMEOUT)
        return {}
    except Exception as exc:
        logger.warning("Lenny MCP call failed: %s", exc)
        return {}


# ─────────────────────────────────────────────
# ADK TOOL: search_lenny_transcripts
# ─────────────────────────────────────────────

async def search_lenny_transcripts(
    query: str,
    tool_context: ToolContext | None = None,
) -> dict:
    """Search 284 Lenny's Podcast episodes for product strategy wisdom.

    Use this to ground your risk classification in real product principles
    from leaders like Shreyas Doshi, Julie Zhuo, and Brian Chesky.

    Search for topics relevant to the risk signal you're classifying:
    - "strategy execution gap" for strategy_unclear risks
    - "team alignment cross functional" for alignment_issue risks
    - "shipping velocity sprint planning" for execution_issue risks
    - "vanity metrics fake progress" for placebo_productivity risks

    Args:
        query: Search keywords (e.g. "hypothesis validation experiment design").

    Returns:
        Dict with matching transcript excerpts and episode metadata.
        Empty results if the MCP server is unreachable (non-blocking).
    """
    if not _LENNY_MCP_URL.strip():
        return {"results": [], "note": "Lenny MCP not configured"}

    result = await _mcp_call(
        "tools/call",
        {"name": "search_transcripts", "arguments": {"query": query}},
    )

    if not result:
        return {"results": [], "note": "Lenny MCP unreachable — proceed without enrichment"}

    # Extract content from MCP tool result format
    content = result.get("content", [])
    excerpts = []
    for item in content:
        if isinstance(item, dict) and item.get("type") == "text":
            excerpts.append(item.get("text", ""))

    # Write to session state for tracing (if tool_context available)
    if tool_context is not None:
        tool_context.state["lenny_search_query"] = query
        tool_context.state["lenny_search_result_count"] = len(excerpts)

    return {
        "results": excerpts,
        "query": query,
        "source": "lenny_podcast_284_episodes",
    }


def is_lenny_configured() -> bool:
    """Check if Lenny MCP URL is configured."""
    return bool(_LENNY_MCP_URL.strip())
