"""File-backed intervention store — local dev fallback when no DB is configured.

In production (Cloud SQL), interventions are persisted via db.repository.save_intervention().
In local dev without a DB, interventions are written to a JSON file so they survive
backend restarts and hot-reloads. Governor writes here via save_intervention(); the
GET /interventions endpoint reads here; approve/reject update the record in-place.

Mirrors the same pattern as app/bet_store.py.
"""

import json
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

_STORE_PATH = Path(
    os.environ.get(
        "INTERVENTION_STORE_PATH",
        Path(__file__).parent.parent / ".dev_interventions.json",
    )
)


def _load() -> list[dict]:
    try:
        if _STORE_PATH.exists():
            return json.loads(_STORE_PATH.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("[intervention_store] Failed to load %s: %s", _STORE_PATH, exc)
    return []


def _save(interventions: list[dict]) -> None:
    try:
        _STORE_PATH.write_text(
            json.dumps(interventions, indent=2, default=str), encoding="utf-8"
        )
    except Exception as exc:
        logger.warning("[intervention_store] Failed to save %s: %s", _STORE_PATH, exc)


class _FileBackedInterventionList(list):
    """A list subclass that persists every mutation to disk.

    Callers use it exactly like a plain list — append, update (via index), etc.
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


# Module-level singleton — imported by repository.py and main.py
inmemory_interventions: _FileBackedInterventionList = _FileBackedInterventionList()
