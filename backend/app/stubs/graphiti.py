"""Graphiti Temporal KG — bi-temporal knowledge graph (stub).

Phase 4+: layered on AlloyDB, enables "what did we know on day N?"
and "how many times has this risk pattern recurred?" queries.
AlloyDB is always source of truth; Graphiti is a derivable index.
"""

from __future__ import annotations


async def query_temporal_kg(entity_id: str, query: str) -> dict:
    """Stub: Phase 4+ Graphiti temporal KG query."""
    return {"status": "stub", "entity_id": entity_id, "results": []}
