"""Async SQLAlchemy engine + session factory.

Two connection modes — selected automatically by env vars:

  LOCAL / direct TCP (default):
    Set DATABASE_URL or ALLOYDB_URL to a standard asyncpg connection string.
    Example: postgresql+asyncpg://aegis:aegis@127.0.0.1:5432/aegis_dev

  Cloud Run / AlloyDB Connector (production):
    Set ALLOYDB_INSTANCE_URI  →  projects/PROJECT/locations/REGION/clusters/CLUSTER/instances/INSTANCE
    Set DB_USER, DB_PASS, DB_NAME
    The connector handles IAM auth + mTLS automatically; no VPC connector needed.

Falls back gracefully when no DB env vars are set — agents still work in
session-state-only mode.
"""

from __future__ import annotations

import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

# ─── Env vars ────────────────────────────────────────────────────────────────

# Direct connection (local dev / Cloud Run + VPC)
_DATABASE_URL: str = os.environ.get(
    "DATABASE_URL",
    os.environ.get("ALLOYDB_URL", ""),
).strip()

# AlloyDB Connector (Cloud Run production — no VPC needed)
_ALLOYDB_INSTANCE_URI: str = os.environ.get("ALLOYDB_INSTANCE_URI", "").strip()
_DB_USER: str = os.environ.get("DB_USER", "").strip()
_DB_PASS: str = os.environ.get("DB_PASS", "").strip()
_DB_NAME: str = os.environ.get("DB_NAME", "aegis").strip()

# ─── Globals ─────────────────────────────────────────────────────────────────

_engine = None
_session_factory = None
_connector = None  # AsyncConnector instance — kept alive for connection pooling


def _init_engine() -> None:
    """Initialise the engine exactly once.

    Priority:
      1. AlloyDB Connector  (ALLOYDB_INSTANCE_URI set)
      2. Direct URL         (DATABASE_URL / ALLOYDB_URL set)
      3. No DB              (graceful degradation)
    """
    global _engine, _session_factory, _connector

    if _engine is not None:
        return

    if _ALLOYDB_INSTANCE_URI and _DB_USER and _DB_PASS:
        _init_engine_connector()
    elif _DATABASE_URL:
        _init_engine_direct()
    # else: no DB — graceful degradation


def _init_engine_connector() -> None:
    """Connect via AlloyDB Python Connector (recommended for Cloud Run)."""
    global _engine, _session_factory, _connector

    try:
        from google.cloud.alloydb.connector import AsyncConnector
    except ImportError as exc:
        raise RuntimeError(
            "google-cloud-alloydb-connector not installed. "
            "Run: uv add 'google-cloud-alloydb-connector[asyncpg]'"
        ) from exc

    instance_uri = _ALLOYDB_INSTANCE_URI
    user = _DB_USER
    password = _DB_PASS
    db_name = _DB_NAME

    # Connector is created lazily inside the async creator — no need to
    # check whether a running loop exists at init time.

    async def _getconn():
        """Open a new asyncpg connection via the connector."""
        global _connector
        if _connector is None:
            _connector = AsyncConnector()
        return await _connector.connect(
            instance_uri,
            "asyncpg",
            user=user,
            password=password,
            db=db_name,
        )

    _engine = create_async_engine(
        # URL is a dummy — actual connection goes through async_creator
        "postgresql+asyncpg://",
        async_creator=_getconn,
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


def _init_engine_direct() -> None:
    """Connect via direct TCP (local dev or VPC private IP)."""
    global _engine, _session_factory

    _engine = create_async_engine(
        _DATABASE_URL,
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
    """Return True if a database connection is (or can be) established."""
    _init_engine()
    return _engine is not None


@asynccontextmanager
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async session. Raises RuntimeError if DB not configured."""
    _init_engine()
    if _session_factory is None:
        raise RuntimeError(
            "No database configured. Set DATABASE_URL for local dev or "
            "ALLOYDB_INSTANCE_URI + DB_USER + DB_PASS + DB_NAME for Cloud Run."
        )
    async with _session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def close_connector() -> None:
    """Close the AlloyDB connector on app shutdown (call from lifespan)."""
    global _connector
    if _connector is not None:
        await _connector.close()
        _connector = None
