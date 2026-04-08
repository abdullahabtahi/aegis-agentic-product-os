"""Session store factory — returns a persistent or in-memory ADK session service.

Default: SQLite at AEGIS_SESSION_DB (./aegis_sessions.db if unset).
Override to InMemory by setting AEGIS_SESSION_DB=memory (useful in eval runs).

Why SQLite over InMemory:
  Sessions survive backend restarts. Users can resume prior conversations
  from the SessionDrawer without losing pipeline state or chat history.
"""

from __future__ import annotations

import os

from google.adk.sessions import DatabaseSessionService, InMemorySessionService

_DB_ENV_KEY = "AEGIS_SESSION_DB"
_DEFAULT_DB_PATH = "aegis_sessions.db"
_MEMORY_SENTINEL = "memory"


def get_session_service() -> DatabaseSessionService | InMemorySessionService:
    """Return the configured session service.

    - AEGIS_SESSION_DB=memory  → InMemorySessionService (evals, CI)
    - AEGIS_SESSION_DB=<path>  → DatabaseSessionService backed by SQLite at path
    - unset                    → DatabaseSessionService at ./aegis_sessions.db
    """
    db_setting = os.environ.get(_DB_ENV_KEY, _DEFAULT_DB_PATH).strip()

    if db_setting == _MEMORY_SENTINEL:
        return InMemorySessionService()

    db_url = f"sqlite+aiosqlite:///{db_setting}"
    return DatabaseSessionService(db_url=db_url)
