# frontend/Dockerfile — production build
FROM node:20-slim AS deps

WORKDIR /app

# Copy package files and install all deps (needed for build)
COPY package.json package-lock.json* ./
RUN npm ci

# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build Next.js for production (standalone output)
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Run as non-root user for security
RUN adduser --disabled-password --no-create-home --uid 1000 appuser

# Copy only what's needed to run
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER appuser

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (r) => { if (r.statusCode !== 200) process.exit(1) })" || exit 1

CMD ["node", "server.js"]
