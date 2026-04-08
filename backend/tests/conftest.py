"""Root pytest configuration.

Defines custom marks so pytest doesn't emit warnings about unknown marks.

Marks:
  integration — tests that require GCP credentials and Gemini model access.
                Only run in Tier 2 CI (tier-2-eval.yml) or locally with real creds.
                Run with: uv run pytest tests/integration -m integration
"""

import pytest


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line(
        "markers",
        "integration: requires GCP credentials and Gemini model access (Tier 2 CI only)",
    )
