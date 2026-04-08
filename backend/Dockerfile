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

# Expose port (Cloud Run defaults to 8080)
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/debug/ping')" || exit 1

# Command to run the application
# We use uv run to execute within the synced environment
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
