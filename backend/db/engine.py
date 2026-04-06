"""Async SQLAlchemy engine + session factory.

Reads DATABASE_URL from environment. Falls back gracefully when DB is
unavailable — agents still function with session-state-only mode.

Usage:
    from db.engine import get_session

    async with get_session() as session:
        await session.execute(...)
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

_DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    os.environ.get("ALLOYDB_URL", ""),
)

_engine = None
_session_factory = None


def _init_engine() -> None:
    global _engine, _session_factory
    if _engine is not None:
        return
    url = _DATABASE_URL.strip()
    if not url:
        return  # No DB configured — graceful degradation
    _engine = create_async_engine(
        url,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,
        echo=False,
    )
    _session_factory = sessionmaker(
        _engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )


def is_db_configured() -> bool:
    """Check if a database URL is configured."""
    _init_engine()
    return _engine is not None


@asynccontextmanager
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async session. Caller must be in an async context.

    Raises RuntimeError if DATABASE_URL is not configured.
    """
    _init_engine()
    if _session_factory is None:
        raise RuntimeError(
            "DATABASE_URL not configured. Set DATABASE_URL in .env for persistence. "
            "Pipeline still functions without DB (session-state only)."
        )
    async with _session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
