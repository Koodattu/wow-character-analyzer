# syntax=docker/dockerfile:1

# ──────────────────────────────────────────────────────────
# Backend Dockerfile — Bun + Elysia
# Two-stage build: install prod deps → lean runtime image
# Bun runs TypeScript natively, no build step needed
# ──────────────────────────────────────────────────────────

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS base
WORKDIR /app

# ── Stage 1: Install production dependencies ─────────────
FROM base AS install
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# ── Stage 2: Final runtime image ─────────────────────────
FROM base AS release

ENV NODE_ENV=production

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
