# ──────────────────────────────────────────────────────────
# Frontend Dockerfile — Next.js 16 Standalone
# Three-stage build: install deps → build → lean runner
# Build context MUST be the repo root (Eden Treaty imports
# backend types via relative path: ../../../backend/src/)
# ──────────────────────────────────────────────────────────

FROM oven/bun:1-alpine AS base
WORKDIR /app

# ── Stage 1: Install all dependencies (including dev) ────
FROM base AS deps
COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile

# ── Stage 2: Build Next.js ───────────────────────────────
FROM base AS build

# Copy backend source for Eden Treaty type imports
# (type-only import, stripped at build time, never in final image)
COPY backend/src ./backend/src
COPY backend/package.json ./backend/package.json
COPY backend/tsconfig.json ./backend/tsconfig.json

# Copy frontend source and deps
WORKDIR /app/frontend
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ .

# NEXT_PUBLIC_ vars must be available at build time
# Passed via docker-compose build.args
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

ENV NODE_ENV=production

RUN bun run build

# ── Stage 3: Lean production runner ──────────────────────
FROM oven/bun:1-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy only the standalone output, static assets, and public dir
COPY --from=build /app/frontend/.next/standalone ./
COPY --from=build /app/frontend/.next/static ./.next/static
COPY --from=build /app/frontend/public ./public

# Run as non-root user (built into oven/bun images)
USER bun

EXPOSE 3000

# Next.js standalone server must bind to 0.0.0.0 inside Docker
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

CMD ["bun", "server.js"]
