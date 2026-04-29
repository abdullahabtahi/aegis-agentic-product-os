"""Tests: all Phase 4+ stubs raise NotImplementedError (spec 005 1F)."""

import pytest

from app.stubs import auto_research, graphiti, memory_synthesis, workspace_fact


@pytest.mark.asyncio
async def test_run_auto_research_raises():
    with pytest.raises(NotImplementedError):
        await auto_research.run_auto_research([], "v1")


@pytest.mark.asyncio
async def test_query_temporal_kg_raises():
    with pytest.raises(NotImplementedError):
        await graphiti.query_temporal_kg("entity-1", "query")


@pytest.mark.asyncio
async def test_run_memory_synthesis_raises():
    with pytest.raises(NotImplementedError):
        await memory_synthesis.run_memory_synthesis("ws-1")


@pytest.mark.asyncio
async def test_get_workspace_facts_raises():
    with pytest.raises(NotImplementedError):
        await workspace_fact.get_workspace_facts("ws-1")
