"""File-backed bet store — local dev fallback when no DB is configured.

In production (Cloud SQL), bets are persisted via db.repository.save_bet().
In local dev without a DB, bets are written to a JSON file so they survive
backend restarts and hot-reloads. Both the REST endpoint (main.py) and the
conversational agent tool (declare_direction) write here so GET /bets
reflects bets declared via chat AND via the modal form.
"""

import json
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

_STORE_PATH = Path(os.environ.get("BET_STORE_PATH", Path(__file__).parent.parent / ".dev_bets.json"))


def _load() -> list[dict]:
    try:
        if _STORE_PATH.exists():
            return json.loads(_STORE_PATH.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("[bet_store] Failed to load %s: %s", _STORE_PATH, exc)
    return []


def _save(bets: list[dict]) -> None:
    try:
        _STORE_PATH.write_text(json.dumps(bets, indent=2, default=str), encoding="utf-8")
    except Exception as exc:
        logger.warning("[bet_store] Failed to save %s: %s", _STORE_PATH, exc)


class _FileBackedBetList(list):
    """A list subclass that persists every mutation to disk.
    Callers use it exactly like a plain list (append, remove, clear, etc.).
    """

    def __init__(self) -> None:
        super().__init__(_load())

    def append(self, item: dict) -> None:  # type: ignore[override]
        super().append(item)
        _save(list(self))

    def remove(self, item: dict) -> None:  # type: ignore[override]
        super().remove(item)
        _save(list(self))

    def clear(self) -> None:
        super().clear()
        _save([])

    def __setitem__(self, index, value):  # type: ignore[override]
        super().__setitem__(index, value)
        _save(list(self))

    def __delitem__(self, index):  # type: ignore[override]
        super().__delitem__(index)
        _save(list(self))

    def reload(self) -> None:
        """Re-read the backing file and refresh the list in place."""
        self.clear()
        super().extend(_load())
        # no _save here — we just read


inmemory_bets: _FileBackedBetList = _FileBackedBetList()
