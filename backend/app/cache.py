"""In-process TTL cache for hot-polled REST endpoints.

Why: Cloud SQL on Cloud Run adds ~5–15 ms per round-trip.  The frontend
polls /bets and /interventions every 15–30 s via React Query.  Serving from
this cache cuts DB load and response latency to <1 ms for repeat reads.

Limitations:
  - Not shared across Cloud Run instances (each instance has its own cache).
  - Invalidation is best-effort: mutations call cache.delete_prefix().
  - For a multi-instance deployment this is still a net win — stale reads
    are bounded by TTL (default 15 s), which matches the frontend staleTime.

Thread-safety: CPython GIL + explicit Lock protect concurrent asyncio tasks.
"""

from __future__ import annotations

import time
from threading import Lock
from typing import Any


class TTLCache:
    """Simple key→value cache with per-entry time-to-live."""

    def __init__(self, default_ttl: float = 15.0) -> None:
        # (expires_at, value)
        self._store: dict[str, tuple[float, Any]] = {}
        self._lock = Lock()
        self._default_ttl = default_ttl

    def get(self, key: str) -> Any | None:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            expires_at, value = entry
            if time.monotonic() > expires_at:
                del self._store[key]
                return None
            return value

    def set(self, key: str, value: Any, ttl: float | None = None) -> None:
        with self._lock:
            self._store[key] = (
                time.monotonic() + (ttl if ttl is not None else self._default_ttl),
                value,
            )

    def delete(self, key: str) -> None:
        with self._lock:
            self._store.pop(key, None)

    def delete_prefix(self, prefix: str) -> None:
        """Invalidate all keys that start with `prefix`."""
        with self._lock:
            stale = [k for k in self._store if k.startswith(prefix)]
            for k in stale:
                del self._store[k]


# ─── Module-level singleton ───────────────────────────────────────────────────
#
# TTLs are chosen to match frontend React Query staleTime settings:
#   /bets          → staleTime 15 s  → cache 15 s
#   /interventions → staleTime 15 s  → cache 15 s (ETag still served on top)
#   /workspace/*   → rarely changes  → cache 60 s
#
cache = TTLCache(default_ttl=15.0)
