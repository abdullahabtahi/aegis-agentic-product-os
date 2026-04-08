"""Alembic environment configuration for Aegis — AlloyDB (PostgreSQL).

Uses async engine (asyncpg) to match the production AlloyDB connection pattern.
Database URL is loaded from environment variables, never hardcoded.

Environment variables (checked in order):
  ALLOYDB_URL  — full asyncpg URL for AlloyDB
  DATABASE_URL — fallback (e.g., local dev postgres)

Phase 4: swap asyncpg connector for AlloyDB Python Connector.
"""

import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

# alembic.ini config object
config = context.config

# Configure Python logging from alembic.ini [loggers] section
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Metadata for autogenerate support (None = run migrations manually)
target_metadata = None


def get_database_url() -> str:
    """Resolve database URL from environment. Never falls back to hardcoded values."""
    url = os.environ.get("ALLOYDB_URL") or os.environ.get("DATABASE_URL")
    if not url:
        # Use alembic.ini default (local dev only — never in CI/prod)
        url = config.get_main_option("sqlalchemy.url")
    # Force asyncpg driver for async engine — handles bare postgresql:// and psycopg2 URLs
    if url and "asyncpg" not in url:
        url = url.replace("postgresql+psycopg2://", "postgresql+asyncpg://", 1)
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    Offline mode emits SQL to stdout (or a file) without requiring a live DB connection.
    Useful for review, audit, and applying via AlloyDB console.
    """
    url = get_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations with an async engine — required for asyncpg + AlloyDB."""
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = get_database_url()

    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,  # NullPool: no persistent connections during migration
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode against a live database."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
