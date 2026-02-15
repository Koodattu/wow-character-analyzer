# ──────────────────────────────────────────────────────────
# Backend Dockerfile — Bun + Elysia
# Two-stage build: install prod deps → lean runtime image
# Bun runs TypeScript natively, no build step needed
# ──────────────────────────────────────────────────────────

FROM oven/bun:1-alpine AS base
WORKDIR /app

# ── Stage 1: Install production dependencies ─────────────
FROM base AS install
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# ── Stage 2: Final runtime image ─────────────────────────
FROM base AS release

COPY --from=install /temp/prod/node_modules node_modules
COPY package.json .
COPY src src
COPY drizzle drizzle

# Create data directory for BunQueue SQLite persistence
# Must exist and be writable before switching to non-root user
RUN mkdir -p /app/data && chown bun:bun /app/data

# Run as non-root user (built into oven/bun images)
USER bun

EXPOSE 3001

CMD ["bun", "run", "src/index.ts"]
