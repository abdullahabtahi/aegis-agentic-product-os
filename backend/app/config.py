"""Aegis Config Gateway — Smart Secret Management.

Implements the "Graceful Fallback" pattern:
1. Try GCP Secret Manager (Production/Cloud)
2. Fallback to Environment Variables (Local Dev/.env)

This ensures the system is "Cloud Ready" without breaking Claude Code's local flow.
"""

import logging
import os
from functools import lru_cache
from pathlib import Path

logger = logging.getLogger(__name__)

# ─── Load .env early ────────────────────────────────────────────────────────
# Config uses @lru_cache — it is instantiated at first import, which may happen
# before main.py has a chance to load .env. Load here to be safe regardless of
# import order. override=False means shell/process env vars always win.
_env_path = Path(__file__).parent.parent / ".env"
if _env_path.exists():
    try:
        from dotenv import load_dotenv

        load_dotenv(dotenv_path=_env_path, override=False)
    except ImportError:
        for _line in _env_path.read_text().splitlines():
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _, _v = _line.partition("=")
                os.environ.setdefault(_k.strip(), _v.strip())
# ────────────────────────────────────────────────────────────────────────────


class Config:
    def __init__(self):
        # 1. Core GCP Project Info
        self.GOOGLE_CLOUD_PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT")
        self.GOOGLE_CLOUD_LOCATION = os.environ.get("GOOGLE_CLOUD_LOCATION", "global")

        # 2. Load secrets from environment variables.
        # On Cloud Run, gcloud --set-secrets already injects secrets as env vars,
        # so no Secret Manager SDK calls are needed here — they add cold-start
        # latency and require matching secret names that differ from deploy.sh.
        self._secrets = {
            "LINEAR_API_KEY": os.environ.get("LINEAR_API_KEY"),
            "DATABASE_URL": (
                os.environ.get("DATABASE_URL")
                or os.environ.get("ALLOYDB_URL")
            ),
            "JULES_API_KEY": os.environ.get("JULES_API_KEY"),
        }

    @property
    def LINEAR_API_KEY(self):
        return self._secrets.get("LINEAR_API_KEY")

    @property
    def DATABASE_URL(self):
        return self._secrets.get("DATABASE_URL")

    @property
    def JULES_API_KEY(self):
        return self._secrets.get("JULES_API_KEY")


@lru_cache
def get_config():
    return Config()


# Export a singleton instance for easy import
config = get_config()
