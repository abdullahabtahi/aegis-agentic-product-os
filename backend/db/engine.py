"""Async SQLAlchemy engine + session factory.

Two connection modes — selected automatically by env vars:

  LOCAL / Docker (default):
    DATABASE_URL=postgresql+asyncpg://aegis:aegis@127.0.0.1:5432/aegis

  Cloud Run + Cloud SQL (production):
    Cloud Run mounts the Cloud SQL unix socket automatically when the service
    is deployed with --add-cloudsql-instances=PROJECT:REGION:INSTANCE.
    DATABASE_URL=postgresql+asyncpg://USER:PASS@/DB?host=/cloudsql/PROJECT:REGION:INSTANCE
    deploy/deploy.sh constructs this automatically from SQL_INSTANCE + DB_*.

Falls back gracefully when DATABASE_URL is not set — agents work in
session-state-only mode (useful for CI / local agent evals).
"""

from __future__ import annotations

import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

# ─── Env vars ────────────────────────────────────────────────────────────────

_DATABASE_URL: str = os.environ.get("DATABASE_URL", "").strip()

# ─── Globals ─────────────────────────────────────────────────────────────────

_engine = None
_session_factory = None


def _init_engine() -> None:
    """Initialise the engine exactly once."""
    global _engine, _session_factory

    if _engine is not None:
        return

    if not _DATABASE_URL:
        return  # graceful degradation — no DB configured

    # Pool tuned for Cloud Run:
    #   pool_size=3     — fits comfortably within a single Cloud Run instance
    #   max_overflow=7  — burst headroom; Cloud Run max-concurrency=80 but
    #                     most requests are fast so queuing is brief
    #   pool_recycle=600 — Cloud SQL drops idle connections at ~10 min;
    #                      recycle before that to avoid "connection closed" errors
    #   pool_pre_ping   — validate connections after idle periods (scale-to-zero)
    _engine = create_async_engine(
        _DATABASE_URL,
        pool_size=3,
        max_overflow=7,
        pool_pre_ping=True,
        pool_recycle=600,
        echo=False,
    )
    _session_factory = sessionmaker(
        _engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )


def is_db_configured() -> bool:
    """Return True if a database connection is (or can be) established."""
    _init_engine()
    return _engine is not None


@asynccontextmanager
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async session. Raises RuntimeError if DB not configured."""
    _init_engine()
    if _session_factory is None:
        raise RuntimeError(
            "No database configured. "
            "Set DATABASE_URL for local dev or Cloud Run (unix socket)."
        )
    async with _session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def close_connector() -> None:
    """No-op — kept for lifespan compatibility."""
