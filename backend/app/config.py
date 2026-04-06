"""Aegis Config Gateway — Smart Secret Management.

Implements the "Graceful Fallback" pattern:
1. Try GCP Secret Manager (Production/Cloud)
2. Fallback to Environment Variables (Local Dev/.env)

This ensures the system is "Cloud Ready" without breaking Claude Code's local flow.
"""

import os
import logging
from functools import lru_cache

logger = logging.getLogger(__name__)

class Config:
    def __init__(self):
        # 1. Core GCP Project Info
        self.GOOGLE_CLOUD_PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT")
        self.GOOGLE_CLOUD_LOCATION = os.environ.get("GOOGLE_CLOUD_LOCATION", "global")
        
        # 2. Secret Mapping
        self._secrets = {}
        self._load_secrets()

    def _load_secrets(self):
        """Lazy load secrets from GCP Secret Manager if available, otherwise use ENV."""
        # Detect if we are in a GCP environment (Cloud Run, GKE, etc.)
        # Or if we have explicit credentials set up
        if self.GOOGLE_CLOUD_PROJECT and not os.environ.get("AEGIS_LOCAL_DEV"):
            try:
                from google.cloud import secretmanager
                client = secretmanager.SecretManagerServiceClient()
                
                # List of secrets we care about
                secret_keys = ["LINEAR_API_KEY", "DATABASE_URL", "JULES_API_KEY"]
                
                for key in secret_keys:
                    name = f"projects/{self.GOOGLE_CLOUD_PROJECT}/secrets/{key}/versions/latest"
                    try:
                        response = client.access_secret_version(request={"name": name})
                        self._secrets[key] = response.payload.data.decode("UTF-8")
                        logger.info(f"Loaded secret '{key}' from GCP Secret Manager.")
                    except Exception:
                        # Fallback to ENV if specific secret is missing in GCP
                        self._secrets[key] = os.environ.get(key)
            except Exception as e:
                logger.warning(f"Could not connect to GCP Secret Manager: {e}. Falling back to ENV.")
                self._load_all_from_env()
        else:
            self._load_all_from_env()

    def _load_all_from_env(self):
        """Standard fallback to local environment variables."""
        for key in ["LINEAR_API_KEY", "DATABASE_URL", "ALLOYDB_URL", "JULES_API_KEY"]:
            val = os.environ.get(key)
            if key == "ALLOYDB_URL" and not self._secrets.get("DATABASE_URL"):
                self._secrets["DATABASE_URL"] = val
            elif key != "ALLOYDB_URL":
                self._secrets[key] = val

    @property
    def LINEAR_API_KEY(self):
        return self._secrets.get("LINEAR_API_KEY")

    @property
    def DATABASE_URL(self):
        return self._secrets.get("DATABASE_URL")

    @property
    def JULES_API_KEY(self):
        return self._secrets.get("JULES_API_KEY")

@lru_cache()
def get_config():
    return Config()

# Export a singleton instance for easy import
config = get_config()
