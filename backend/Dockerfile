# backend/Dockerfile
FROM python:3.12-slim

# Install uv — pinned for supply-chain safety
COPY --from=ghcr.io/astral-sh/uv:0.8.13 /uv /bin/uv

# Set working directory
WORKDIR /app

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Install dependencies (frozen to ensure lockfile is respected)
RUN uv sync --frozen --no-dev

# Copy application code (restricted by .dockerignore)
COPY . .

# Run as non-root user for security
RUN adduser --disabled-password --no-create-home --uid 1000 appuser
USER appuser

# Disable uv cache — appuser has no home dir, and containers don't need cache
ENV UV_NO_CACHE=1

# Ensure local packages (app/, db/, tools/, models/) are importable
# when running uvicorn directly instead of via uv run
ENV PYTHONPATH=/app

# Expose port (Cloud Run defaults to 8080)
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:' + __import__('os').environ.get('PORT','8080') + '/debug/ping')" || exit 1

# Honor $PORT injected by Cloud Run (defaults to 8080 if not set).
# Use .venv/bin/uvicorn directly — uv run tries to install the project
# at startup, which fails because .venv is owned by root (read-only for appuser).
CMD ["sh", "-c", "/app/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
