"""Session store factory — returns a persistent or in-memory ADK session service.

Priority for DB URL resolution:
  1. AEGIS_SESSION_DB=memory          → InMemorySessionService (evals, CI)
  2. AEGIS_SESSION_DB=<full-url>      → use URL as-is (Cloud Run + AlloyDB/Postgres)
  3. AEGIS_SESSION_DB=<filename>      → SQLite at that path (local dev default)
  4. unset                            → SQLite at ./aegis_sessions.db

On Cloud Run set:
  AEGIS_SESSION_DB=postgresql+asyncpg://user:pass@/aegis_sessions?host=/cloudsql/...
  or point at the same AlloyDB instance used for bets/interventions.
"""

from __future__ import annotations

import os

from google.adk.sessions import DatabaseSessionService, InMemorySessionService

_DB_ENV_KEY = "AEGIS_SESSION_DB"
_DEFAULT_DB_PATH = "aegis_sessions.db"
_MEMORY_SENTINEL = "memory"
_URL_PREFIXES = ("postgresql+", "postgres+", "sqlite+", "mysql+")


def get_session_service() -> DatabaseSessionService | InMemorySessionService:
    """Return the configured session service.

    Detects whether the env value is a full DB URL or a bare SQLite file path,
    so Cloud Run can point sessions at AlloyDB/Postgres without code changes.
    """
    db_setting = os.environ.get(_DB_ENV_KEY, _DEFAULT_DB_PATH).strip()

    if db_setting == _MEMORY_SENTINEL:
        return InMemorySessionService()

    # If the value already looks like a DB URL, use it directly.
    if any(db_setting.startswith(prefix) for prefix in _URL_PREFIXES):
        db_url = db_setting
    else:
        # Bare path → wrap as SQLite URL (local dev default).
        db_url = f"sqlite+aiosqlite:///{db_setting}"

    return DatabaseSessionService(db_url=db_url)
