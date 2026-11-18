# syntax=docker/dockerfile:1

# ──────────────────────────────────────────────────────────
# Backend Dockerfile — Bun + Elysia
# Two-stage build: install prod deps → lean runtime image
# Bun runs TypeScript natively, no build step needed
# ──────────────────────────────────────────────────────────

FROM oven/bun:1.4.4-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a AS base
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
